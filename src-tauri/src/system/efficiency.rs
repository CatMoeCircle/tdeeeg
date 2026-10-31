//! 后台资源策略（Windows）。
//!
//! 窗口最小化 / 隐藏到托盘后，界面已经不可交互，但 TDLib 的收发、通知与下载
//! 仍要继续。这里按「后台时长」分两档回收资源：
//!
//! - **最小化 10s**：页面还要继续处理 TDLib 更新，因此只把本进程与 WebView2
//!   子进程标记为 EcoQoS，并把 WebView2 的 `MemoryUsageTargetLevel` 调到 Low
//!   （丢弃缓存、把页面换出到磁盘），脚本和网络连接保持运行。
//! - **隐藏到托盘 60s**：界面根本看不到，先把 WebView2 controller 设为不可见，
//!   再 `TrySuspend` 挂起渲染进程，由系统回收渲染进程占用的内存；重新显示时
//!   `Resume` 并恢复 Normal。挂起期间 TDLib、通知、托盘都不受影响。
//!
//! 两档都避开音视频播放：播放期间不降频、不挂起，否则音频缓冲会卡顿。
//!
//! 主窗口的可见 / 最小化状态由后台线程每秒轮询（`IsWindowVisible` / `IsIconic`），
//! 窗口事件（重新获得焦点 / 尺寸变化）只用来「叫醒」轮询线程，让被挂起的 WebView
//! 尽快恢复。隐藏不产生 tao 窗口事件，托盘、前端 `window.hide()`、系统最小化
//! 等多条路径用轮询都能覆盖。

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicU64, AtomicU8};
#[cfg(target_os = "windows")]
use std::sync::mpsc::{Receiver, Sender};
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};
#[cfg(target_os = "windows")]
use tauri::Manager;

/// 用户偏好：后台运行时是否启用后台资源策略
static PREF_ENABLED: AtomicBool = AtomicBool::new(false);
/// 是否正在播放音频/视频（SMTC 上报）：播放期间不压 CPU / 不挂起
static MEDIA_PLAYING: AtomicBool = AtomicBool::new(false);
/// 效率模式（EcoQoS）当前是否真的生效，供设置页展示真实状态
static ACTIVE: AtomicBool = AtomicBool::new(false);
/// 平台不支持 `SetProcessInformation` 后不再重试，也不对用户展示为可用
static UNAVAILABLE: AtomicBool = AtomicBool::new(false);
/// 主窗口是否曾经可见：启动阶段窗口先隐藏跑 bootstrap，那段不算「后台运行」
static EVER_SHOWN: AtomicBool = AtomicBool::new(false);

/// 最小化后进入效率模式前的宽限期：避免快速最小化/恢复时反复切换调度档
#[cfg(target_os = "windows")]
const MINIMIZED_DELAY: Duration = Duration::from_secs(10);
/// 隐藏到托盘后挂起 WebView2 前的宽限期：期间仍允许界面处理完手头的更新
#[cfg(target_os = "windows")]
const HIDDEN_DELAY: Duration = Duration::from_secs(60);
/// 状态轮询间隔：1s 足够及时，且只是一次 IsWindowVisible/IsIconic 查询
#[cfg(target_os = "windows")]
const POLL_INTERVAL_MS: u64 = 1000;
/// 效率模式生效期间每隔多少个轮询周期刷新一次子进程（WebView2 渲染进程可能重建）
#[cfg(target_os = "windows")]
const CHILD_REFRESH_TICKS: u32 = 8;

/// 当前实际应用到的级别（0 = Normal / 1 = 效率模式 / 2 = 挂起）。
/// 轮询线程与窗口事件共用，避免同一状态重复下发 WebView2 调用。
#[cfg(target_os = "windows")]
static APPLIED_LEVEL: AtomicU8 = AtomicU8::new(Level::Normal as u8);

/// 叫醒轮询线程。隐藏状态没有窗口事件，主要靠轮询；恢复前台时用它抢时间。
#[cfg(target_os = "windows")]
static WAKE_TX: OnceLock<Sender<()>> = OnceLock::new();

/// `prepare_show` 之后短暂压制后台级别用的单调时钟基准（毫秒）。
#[cfg(target_os = "windows")]
static CLOCK_BASE: OnceLock<Instant> = OnceLock::new();
/// 该时间点之前不进入后台级别：托盘 show() 与窗口真正可见之间可能隔一个
/// 事件循环消息，避免轮询线程在这个缝隙里又把刚恢复的 WebView 挂起。
#[cfg(target_os = "windows")]
static RESUME_HOLD_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

/// 平台是否支持效率模式（Windows 10 1709+）。写失败后永久降级为不支持。
pub fn is_supported() -> bool {
    cfg!(target_os = "windows") && !UNAVAILABLE.load(Ordering::SeqCst)
}

/// 效率模式当前是否生效（最小化满 10s + 开关打开 + 写入成功）
pub fn is_active() -> bool {
    ACTIVE.load(Ordering::SeqCst)
}

/// 设置用户偏好，并按当前窗口状态立即生效或撤销
pub fn set_preference(enabled: bool) {
    PREF_ENABLED.store(enabled, Ordering::SeqCst);
    #[cfg(target_os = "windows")]
    wake();
}

/// SMTC 上报的播放状态：后台听歌 / 看视频时既不做 EcoQoS，也不挂起 WebView。
///
/// EcoQoS 会让 CPU 跑在低频率档，音频缓冲来不及填充就会出现爆音；
/// 挂起则会直接暂停页面脚本与媒体管线。播放期间优先保证音频线程的调度。
pub fn set_media_playing(playing: bool) {
    if MEDIA_PLAYING.swap(playing, Ordering::SeqCst) == playing {
        return;
    }
    #[cfg(target_os = "windows")]
    wake();
}

/// 退出 / 崩溃前的兜底：撤销效率模式，避免宿主进程连同 WebView2 子进程
/// 长时间停留在低调度档（例如升级安装器等待本进程退出）。
pub fn clear_on_exit() {
    #[cfg(target_os = "windows")]
    APPLIED_LEVEL.store(Level::Normal as u8, Ordering::SeqCst);
    if ACTIVE.swap(false, Ordering::SeqCst) {
        let _ = imp::set_process_efficiency(false);
    }
}

/// 显示主窗口前调用：若 WebView 正被挂起 / 低内存档，先恢复再 show，
/// 避免托盘点开时先看到一帧空白窗口。幂等，非 Windows 平台为空实现。
pub fn prepare_show(app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        // show() 的窗口消息可能排在当前事件之后，先记一个短暂的「保持前台」窗口，
        // 防止轮询线程在这几毫秒内又套上后台级别。
        RESUME_HOLD_UNTIL_MS.store(now_ms().saturating_add(2_500), Ordering::SeqCst);
        if APPLIED_LEVEL.load(Ordering::SeqCst) != Level::Normal as u8 {
            apply_level(app, Level::Normal);
            wake();
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }
}

/// 启动后台状态轮询线程。非 Windows 平台为空实现。
pub fn init(app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let (tx, rx) = std::sync::mpsc::channel::<()>();
        let _ = WAKE_TX.set(tx);

        // 重新可见 / 从最小化恢复时立刻叫醒轮询线程，让被挂起的 WebView 尽快 Resume，
        // 而不是最多等一个轮询周期。回调本身只做一次线程唤醒，不碰 COM。
        if let Some(window) = app.get_webview_window("main") {
            window.on_window_event(|event| {
                if matches!(
                    event,
                    tauri::WindowEvent::Focused(true) | tauri::WindowEvent::Resized(_)
                ) && APPLIED_LEVEL.load(Ordering::SeqCst) != Level::Normal as u8
                {
                    wake();
                }
            });
        }

        let app = app.clone();
        let _ = std::thread::Builder::new()
            .name("efficiency-watch".into())
            .spawn(move || watch_loop(app, rx));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }
}

#[cfg(target_os = "windows")]
fn wake() {
    if let Some(tx) = WAKE_TX.get() {
        let _ = tx.send(());
    }
}

#[cfg(target_os = "windows")]
fn now_ms() -> u64 {
    CLOCK_BASE.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// 主窗口在桌面上的实际状态
#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BgState {
    /// 可见且未最小化
    Foreground,
    /// 任务栏最小化（窗口仍算可见）
    Minimized,
    /// 隐藏到托盘 / 被前端 hide()
    Hidden,
}

/// 后台资源级别
#[cfg(target_os = "windows")]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
enum Level {
    Normal = 0,
    /// 最小化满 10s：EcoQoS + WebView2 低内存目标
    Throttled = 1,
    /// 隐藏满 60s：挂起 WebView2 渲染进程
    Suspended = 2,
}

#[cfg(target_os = "windows")]
fn watch_loop(app: tauri::AppHandle, rx: Receiver<()>) {
    let mut state = BgState::Foreground;
    let mut since = Instant::now();
    let mut tick: u32 = 0;

    loop {
        let _ = rx.recv_timeout(Duration::from_millis(POLL_INTERVAL_MS));
        // 清掉连续 resize / focus 产生的多余唤醒，避免循环空转
        while rx.try_recv().is_ok() {}

        let observed = window_state(&app).unwrap_or(BgState::Foreground);
        if observed == BgState::Foreground {
            EVER_SHOWN.store(true, Ordering::SeqCst);
            RESUME_HOLD_UNTIL_MS.store(0, Ordering::SeqCst);
        }
        // 启动阶段窗口先隐藏跑 bootstrap：首次显示之前不把「隐藏」当成后台运行
        let effective = if EVER_SHOWN.load(Ordering::SeqCst) {
            observed
        } else {
            BgState::Foreground
        };
        if effective != state {
            state = effective;
            since = Instant::now();
        }

        // prepare_show 之后短暂保持前台，避开 show() 消息尚未处理完的缝隙
        let hold_foreground = now_ms() < RESUME_HOLD_UNTIL_MS.load(Ordering::SeqCst);
        let want = if hold_foreground {
            Level::Normal
        } else {
            desired_level(state, since.elapsed())
        };
        if APPLIED_LEVEL.load(Ordering::SeqCst) != want as u8 {
            apply_level(&app, want);
        }

        if ACTIVE.load(Ordering::SeqCst) && tick % CHILD_REFRESH_TICKS == 0 {
            imp::refresh_child_processes(true);
        }
        tick = tick.wrapping_add(1);
    }
}

#[cfg(target_os = "windows")]
fn desired_level(state: BgState, elapsed: Duration) -> Level {
    if !PREF_ENABLED.load(Ordering::SeqCst) || MEDIA_PLAYING.load(Ordering::SeqCst) {
        return Level::Normal;
    }
    match state {
        BgState::Foreground => Level::Normal,
        BgState::Minimized if elapsed >= MINIMIZED_DELAY => Level::Throttled,
        BgState::Hidden if elapsed >= HIDDEN_DELAY => Level::Suspended,
        _ => Level::Normal,
    }
}

/// 应用目标级别。窗口状态在真正下发前再确认一次，避免「刚恢复前台却被挂起」。
#[cfg(target_os = "windows")]
fn apply_level(app: &tauri::AppHandle, target: Level) {
    let observed = window_state(app).unwrap_or(BgState::Foreground);
    let target = match target {
        Level::Throttled if observed != BgState::Minimized => Level::Normal,
        Level::Suspended if observed != BgState::Hidden => Level::Normal,
        other => other,
    };

    if APPLIED_LEVEL.swap(target as u8, Ordering::SeqCst) == target as u8 {
        return;
    }

    match target {
        Level::Normal => {
            set_eco_qos(false);
            webview2::apply(app, webview2::Mode::Normal);
        }
        Level::Throttled => {
            webview2::apply(app, webview2::Mode::Low);
            set_eco_qos(true);
        }
        Level::Suspended => {
            // 挂起只冻结界面进程；宿主进程（TDLib 收发、通知、下载）不套 EcoQoS，
            // 避免后台消息处理和传输被降频。
            set_eco_qos(false);
            webview2::apply(app, webview2::Mode::Suspend);
        }
    }
}

#[cfg(target_os = "windows")]
fn set_eco_qos(on: bool) {
    if UNAVAILABLE.load(Ordering::SeqCst) {
        ACTIVE.store(false, Ordering::SeqCst);
        return;
    }
    if on == ACTIVE.load(Ordering::SeqCst) {
        return;
    }
    let ok = imp::set_process_efficiency(on);
    if on && !ok {
        // 旧系统不支持 ProcessPowerThrottling：停止重试，UI 改为「不可用」
        UNAVAILABLE.store(true, Ordering::SeqCst);
        ACTIVE.store(false, Ordering::SeqCst);
        return;
    }
    ACTIVE.store(on, Ordering::SeqCst);
}

/// 主窗口当前状态；返回 None 表示窗口还没建好（例如启动早期），保持上一次判断。
#[cfg(target_os = "windows")]
fn window_state(app: &tauri::AppHandle) -> Option<BgState> {
    use tauri::Manager;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{IsIconic, IsWindowVisible};

    let window = app.get_webview_window("main")?;
    let hwnd = window.hwnd().ok()?;
    let hwnd = HWND(hwnd.0 as *mut _);
    // SAFETY: hwnd 来自仍在存活的 Tauri 窗口；两个查询都只读窗口状态。
    let (visible, minimized) =
        unsafe { (IsWindowVisible(hwnd).as_bool(), IsIconic(hwnd).as_bool()) };
    Some(if !visible {
        BgState::Hidden
    } else if minimized {
        BgState::Minimized
    } else {
        BgState::Foreground
    })
}

/// WebView2 侧的内存策略：低内存目标与挂起 / 恢复。
#[cfg(target_os = "windows")]
mod webview2 {
    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2_19, ICoreWebView2_3,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use webview2_com::TrySuspendCompletedHandler;
    use windows::core::{Interface, BOOL};

    #[derive(Clone, Copy)]
    pub enum Mode {
        /// 前台：可见 + Resume + Normal
        Normal,
        /// 最小化：可见 + Resume + Low（脚本继续跑，内存目标降低）
        Low,
        /// 托盘隐藏：不可见 + TrySuspend（挂起渲染进程）
        Suspend,
    }

    pub fn apply(app: &tauri::AppHandle, mode: Mode) {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        // with_webview 在 UI 线程执行 COM；从轮询线程调用时由 Tauri 投递过去。
        let _ = window.with_webview(move |platform| {
            let controller = platform.controller();
            let Ok(core) = (|| unsafe { controller.CoreWebView2() })() else {
                return;
            };

            match mode {
                Mode::Normal => unsafe {
                    let _ = controller.SetIsVisible(true);
                    if let Ok(wv3) = core.cast::<ICoreWebView2_3>() {
                        let _ = wv3.Resume();
                    }
                    set_target_level(&core, false);
                },
                Mode::Low => unsafe {
                    let _ = controller.SetIsVisible(true);
                    if let Ok(wv3) = core.cast::<ICoreWebView2_3>() {
                        let _ = wv3.Resume();
                    }
                    set_target_level(&core, true);
                },
                Mode::Suspend => {
                    let wv3 = match core.cast::<ICoreWebView2_3>() {
                        Ok(wv3) => wv3,
                        Err(_) => {
                            // WebView2 运行时太旧，没有挂起接口：退回低内存目标
                            unsafe {
                                let _ = controller.SetIsVisible(true);
                                set_target_level(&core, true);
                            }
                            return;
                        }
                    };

                    let mut suspended = BOOL(0);
                    if unsafe { wv3.IsSuspended(&mut suspended) }.is_ok() && suspended.as_bool() {
                        return;
                    }

                    unsafe {
                        // TrySuspend 要求 controller 不可见（否则 ERROR_INVALID_STATE）
                        let _ = controller.SetIsVisible(false);
                    }

                    let controller_for_cb = controller.clone();
                    let core_for_cb = core.clone();
                    let handler =
                        TrySuspendCompletedHandler::create(Box::new(move |error, successful| {
                            if error.is_err() || !successful {
                                eprintln!(
                                    "[efficiency] TrySuspend failed: {error:?} success={successful}"
                                );
                                // 挂起失败（例如页面还在跑脚本）时退回低内存档，别让窗口
                                // 停在「controller 不可见但没挂起」的空白状态。若期间已经
                                // 恢复前台，APPLIED_LEVEL 会先变回 Normal，这里就不动。
                                if super::APPLIED_LEVEL.load(std::sync::atomic::Ordering::SeqCst)
                                    == super::Level::Suspended as u8
                                {
                                    unsafe {
                                        let _ = controller_for_cb.SetIsVisible(true);
                                        set_target_level(&core_for_cb, true);
                                    }
                                }
                            }
                            Ok(())
                        }));

                    if let Err(e) = unsafe { wv3.TrySuspend(&handler) } {
                        eprintln!("[efficiency] TrySuspend call failed: {e}");
                        unsafe {
                            let _ = controller.SetIsVisible(true);
                            set_target_level(&core, true);
                        }
                    }
                }
            }
        });
    }

    /// `ICoreWebView2_19::SetMemoryUsageTargetLevel`，旧运行时没有该接口时静默跳过。
    unsafe fn set_target_level(core: &ICoreWebView2, low: bool) {
        let Ok(wv19) = core.cast::<ICoreWebView2_19>() else {
            return;
        };
        let level = if low {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };
        let _ = unsafe { wv19.SetMemoryUsageTargetLevel(level) };
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use std::collections::{HashMap, HashSet};

    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{
        GetCurrentProcess, OpenProcess, ProcessPowerThrottling, SetProcessInformation,
        PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        PROCESS_POWER_THROTTLING_STATE, PROCESS_SET_INFORMATION,
    };

    /// 对单个进程写入（或撤销）EcoQoS。EXECUTION_SPEED 位对应「效率模式」。
    unsafe fn set_eco_qos(process: HANDLE, on: bool) -> bool {
        let state = PROCESS_POWER_THROTTLING_STATE {
            Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
            ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
            StateMask: if on {
                PROCESS_POWER_THROTTLING_EXECUTION_SPEED
            } else {
                0
            },
        };
        // SAFETY: state 是本次调用期间存活的本地结构体，大小与 API 约定一致。
        unsafe {
            SetProcessInformation(
                process,
                ProcessPowerThrottling,
                &state as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
            )
            .is_ok()
        }
    }

    /// 全量进程表：子进程 pid → 父进程 pid
    fn process_parents() -> HashMap<u32, u32> {
        let mut map = HashMap::new();
        // SAFETY: 工具快照句柄用完即关；PROCESSENTRY32W 按约定先填 dwSize。
        unsafe {
            let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
                return map;
            };
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    map.insert(entry.th32ProcessID, entry.th32ParentProcessID);
                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
        map
    }

    /// 递归收集后代进程（WebView2：浏览器进程是直接子进程，
    /// 渲染 / GPU / 网络进程又是它的子进程）。
    fn descendants(root: u32, parents: &HashMap<u32, u32>) -> Vec<u32> {
        let mut seen: HashSet<u32> = HashSet::new();
        let mut out: Vec<u32> = Vec::new();
        let mut frontier = vec![root];
        // 4 层足够覆盖 msedgewebview2 的进程树深度
        for _ in 0..4 {
            let next: Vec<u32> = parents
                .iter()
                .filter(|(pid, ppid)| {
                    **pid != root && frontier.contains(ppid) && !seen.contains(pid)
                })
                .map(|(pid, _)| *pid)
                .collect();
            if next.is_empty() {
                break;
            }
            seen.extend(next.iter().copied());
            out.extend(next.iter().copied());
            frontier = next;
        }
        out
    }

    /// 把当前宿主进程的所有后代子进程一起切开 / 关掉效率模式
    fn apply_to_descendants(on: bool) {
        let parents = process_parents();
        for pid in descendants(std::process::id(), &parents) {
            // SAFETY: 句柄在使用后立即关闭；无权打开的进程直接跳过。
            unsafe {
                let Ok(handle) = OpenProcess(PROCESS_SET_INFORMATION, false, pid) else {
                    continue;
                };
                let _ = set_eco_qos(handle, on);
                let _ = CloseHandle(handle);
            }
        }
    }

    /// 应用 / 撤销效率模式。返回宿主进程本身是否写入成功。
    pub fn set_process_efficiency(on: bool) -> bool {
        // SAFETY: GetCurrentProcess 返回伪句柄，不需要关闭。
        let self_ok = unsafe { set_eco_qos(GetCurrentProcess(), on) };
        apply_to_descendants(on);
        self_ok
    }

    /// 效率模式期间周期性重扫子进程：WebView2 渲染进程崩溃重建后不会继承 EcoQoS。
    pub fn refresh_child_processes(on: bool) {
        apply_to_descendants(on);
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    #[allow(dead_code)]
    pub fn set_process_efficiency(_on: bool) -> bool {
        false
    }

    #[allow(dead_code)]
    pub fn refresh_child_processes(_on: bool) {}
}

/// 设置页展示用状态
#[derive(serde::Serialize)]
pub struct BackgroundEfficiencyStatus {
    pub supported: bool,
    pub active: bool,
}

#[tauri::command]
pub fn set_background_efficiency(enabled: bool) {
    set_preference(enabled);
}

#[tauri::command]
pub fn get_background_efficiency_status() -> BackgroundEfficiencyStatus {
    BackgroundEfficiencyStatus {
        supported: is_supported(),
        active: is_active(),
    }
}
