//! Windows SMTC（System Media Transport Controls）——系统媒体控件 / 锁屏播放卡片。
//!
//! WebView2 的 HTML5 Audio 会经 Chromium `HardwareMediaKeyHandling` →
//! `MediaKeysListenerManager` 注册一条 SMTC（源应用是 `msedgewebview2.exe`，
//! 显示名常为「未知应用」）。根治方式是在 WebView2 启动参数里
//! `--disable-features=HardwareMediaKeyHandling`（见 `main.rs`），让 WebView2
//! 进程根本不创建 SMC。这里在 **宿主进程** 用
//! `ISystemMediaTransportControlsInterop::GetForWindow` 发布会话，并配合
//! [`crate::toast_identity`] 的进程 AUMID + 注册表 DisplayName，使系统显示
//! 正确应用名。前端不更新 webview MediaSession。

/// 与前端约定的控制事件名。
pub const CONTROL_EVENT: &str = "smtc-control";

#[cfg(target_os = "windows")]
mod imp {
    use super::CONTROL_EVENT;
    use std::sync::Mutex;

    use tauri::{AppHandle, Emitter};
    use windows::core::{factory, HSTRING};
    use windows::Foundation::{TimeSpan, TypedEventHandler};
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, MusicDisplayProperties,
        PlaybackPositionChangeRequestedEventArgs, SystemMediaTransportControls,
        SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsDisplayUpdater, SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Storage::Streams::{
        DataWriter, InMemoryRandomAccessStream, RandomAccessStreamReference,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

    struct SmtcState {
        controls: SystemMediaTransportControls,
        /// ButtonPressed / PlaybackPositionChangeRequested 的注册 token。
        _button_token: i64,
        _seek_token: i64,
    }

    static STATE: Mutex<Option<SmtcState>> = Mutex::new(None);

    fn secs_to_timespan(secs: f64) -> TimeSpan {
        // WinRT TimeSpan 为 100ns 单位
        let dur = if secs.is_finite() && secs > 0.0 {
            (secs * 10_000_000.0) as i64
        } else {
            0
        };
        TimeSpan { Duration: dur }
    }

    fn timespan_to_secs(ts: TimeSpan) -> f64 {
        ts.Duration as f64 / 10_000_000.0
    }

    /// 初始化 SMTC：绑定主窗口、注册系统按钮回调。幂等。
    pub fn init(app: &AppHandle, hwnd: HWND) -> Result<(), String> {
        let mut guard = STATE.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }

        let interop =
            factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()
                .map_err(|e| format!("smc factory failed: {e}"))?;
        let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd) }
            .map_err(|e| format!("GetForWindow failed: {e}"))?;

        // 只注册回调，不在此 SetIsEnabled(true)：
        // 启动即启用会让系统在「从未播放」时也挂一条空 SMTC。
        // 有曲目时由 update_metadata 负责启用。
        let _ = controls.SetIsPlayEnabled(true);
        let _ = controls.SetIsPauseEnabled(true);
        let _ = controls.SetIsStopEnabled(true);
        let _ = controls.SetIsNextEnabled(true);
        let _ = controls.SetIsPreviousEnabled(true);

        let app_btn = app.clone();
        let button_token = controls
            .ButtonPressed(&TypedEventHandler::<
                SystemMediaTransportControls,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >::new(move |_sender, args| {
                let Some(args) = args.as_ref() else {
                    return Ok(());
                };
                let action = match args.Button()? {
                    SystemMediaTransportControlsButton::Play => "play",
                    SystemMediaTransportControlsButton::Pause => "pause",
                    SystemMediaTransportControlsButton::Stop => "stop",
                    SystemMediaTransportControlsButton::Next => "next",
                    SystemMediaTransportControlsButton::Previous => "prev",
                    _ => return Ok(()),
                };
                let _ = app_btn.emit(CONTROL_EVENT, serde_json::json!({ "action": action }));
                Ok(())
            }))
            .map_err(|e| format!("ButtonPressed failed: {e}"))?;

        let app_seek = app.clone();
        let seek_token = controls
            .PlaybackPositionChangeRequested(&TypedEventHandler::<
                SystemMediaTransportControls,
                PlaybackPositionChangeRequestedEventArgs,
            >::new(move |_sender, args| {
                let Some(args) = args.as_ref() else {
                    return Ok(());
                };
                let pos = timespan_to_secs(args.RequestedPlaybackPosition()?);
                let _ = app_seek.emit(
                    CONTROL_EVENT,
                    serde_json::json!({ "action": "seek", "position": pos }),
                );
                Ok(())
            }))
            .map_err(|e| format!("PlaybackPositionChangeRequested failed: {e}"))?;

        *guard = Some(SmtcState {
            controls,
            _button_token: button_token,
            _seek_token: seek_token,
        });
        Ok(())
    }

    fn with_controls<T>(
        f: impl FnOnce(&SystemMediaTransportControls) -> Result<T, String>,
    ) -> Result<T, String> {
        let guard = STATE.lock().map_err(|e| e.to_string())?;
        let state = guard
            .as_ref()
            .ok_or_else(|| "smtc not initialized".to_string())?;
        f(&state.controls)
    }

    fn set_thumbnail(
        updater: &SystemMediaTransportControlsDisplayUpdater,
        cover_path: Option<&str>,
        cover_bytes: Option<&[u8]>,
    ) -> Result<(), String> {
        // 本地文件优先
        if let Some(path) = cover_path {
            let p = path.trim();
            if !p.is_empty() && std::path::Path::new(p).is_file() {
                let file = windows::Storage::StorageFile::GetFileFromPathAsync(&HSTRING::from(p))
                    .and_then(|op| op.get())
                    .map_err(|e| format!("open cover file failed: {e}"))?;
                let reference = RandomAccessStreamReference::CreateFromFile(&file)
                    .map_err(|e| format!("CreateFromFile failed: {e}"))?;
                updater
                    .SetThumbnail(&reference)
                    .map_err(|e| format!("SetThumbnail failed: {e}"))?;
                return Ok(());
            }
        }

        // 字节封面：写入内存流
        if let Some(bytes) = cover_bytes {
            if !bytes.is_empty() {
                let stream = InMemoryRandomAccessStream::new()
                    .map_err(|e| format!("InMemoryRandomAccessStream failed: {e}"))?;
                let writer = DataWriter::CreateDataWriter(&stream)
                    .map_err(|e| format!("CreateDataWriter failed: {e}"))?;
                writer
                    .WriteBytes(bytes)
                    .map_err(|e| format!("WriteBytes failed: {e}"))?;
                writer
                    .StoreAsync()
                    .and_then(|op| op.get())
                    .map_err(|e| format!("StoreAsync failed: {e}"))?;
                let _ = writer.DetachStream();
                stream.Seek(0).map_err(|e| format!("Seek failed: {e}"))?;
                let reference = RandomAccessStreamReference::CreateFromStream(&stream)
                    .map_err(|e| format!("CreateFromStream failed: {e}"))?;
                updater
                    .SetThumbnail(&reference)
                    .map_err(|e| format!("SetThumbnail failed: {e}"))?;
                return Ok(());
            }
        }

        // 无封面：显式清空缩略图（update_metadata 已 ClearAll，这里兜底）
        let _ = updater.SetThumbnail(None::<&RandomAccessStreamReference>);
        Ok(())
    }

    /// 更新正在播放元数据（标题 / 作者 / 专辑 / 封面）。
    pub fn update_metadata(
        title: &str,
        artist: &str,
        album: &str,
        cover_path: Option<&str>,
        cover_bytes: Option<&[u8]>,
    ) -> Result<(), String> {
        with_controls(|controls| {
            // clear() 会停用，重新有曲目时再打开
            let _ = controls.SetIsEnabled(true);
            let updater = controls
                .DisplayUpdater()
                .map_err(|e| format!("DisplayUpdater failed: {e}"))?;
            // ClearAll 会丢掉上一曲的缩略图；无封面曲目切歌时必须清掉
            let _ = updater.ClearAll();
            updater
                .SetType(MediaPlaybackType::Music)
                .map_err(|e| format!("SetType failed: {e}"))?;

            let music: MusicDisplayProperties = updater
                .MusicProperties()
                .map_err(|e| format!("MusicProperties failed: {e}"))?;
            music
                .SetTitle(&HSTRING::from(title))
                .map_err(|e| format!("SetTitle failed: {e}"))?;
            music
                .SetArtist(&HSTRING::from(artist))
                .map_err(|e| format!("SetArtist failed: {e}"))?;
            if !album.is_empty() {
                let _ = music.SetAlbumTitle(&HSTRING::from(album));
            }

            // 封面失败不阻断元数据发布
            if let Err(e) = set_thumbnail(&updater, cover_path, cover_bytes) {
                eprintln!("[smtc] thumbnail: {e}");
            }

            updater
                .Update()
                .map_err(|e| format!("DisplayUpdater.Update failed: {e}"))
        })
    }

    /// 更新播放状态与进度。
    pub fn update_playback(
        playing: bool,
        position_secs: f64,
        duration_secs: f64,
    ) -> Result<(), String> {
        with_controls(|controls| {
            let status = if playing {
                MediaPlaybackStatus::Playing
            } else {
                MediaPlaybackStatus::Paused
            };
            controls
                .SetPlaybackStatus(status)
                .map_err(|e| format!("SetPlaybackStatus failed: {e}"))?;

            if duration_secs > 0.0 {
                let timeline = SystemMediaTransportControlsTimelineProperties::new()
                    .map_err(|e| format!("TimelineProperties failed: {e}"))?;
                timeline
                    .SetStartTime(TimeSpan { Duration: 0 })
                    .map_err(|e| format!("SetStartTime failed: {e}"))?;
                timeline
                    .SetEndTime(secs_to_timespan(duration_secs))
                    .map_err(|e| format!("SetEndTime failed: {e}"))?;
                timeline
                    .SetPosition(secs_to_timespan(position_secs))
                    .map_err(|e| format!("SetPosition failed: {e}"))?;
                timeline
                    .SetMinSeekTime(TimeSpan { Duration: 0 })
                    .map_err(|e| format!("SetMinSeekTime failed: {e}"))?;
                timeline
                    .SetMaxSeekTime(secs_to_timespan(duration_secs))
                    .map_err(|e| format!("SetMaxSeekTime failed: {e}"))?;
                controls
                    .UpdateTimelineProperties(&timeline)
                    .map_err(|e| format!("UpdateTimelineProperties failed: {e}"))?;
            }
            Ok(())
        })
    }

    /// 清空元数据并停用 SMTC（关闭播放器 / 无曲目时调用）。
    ///
    /// Win11 媒体浮窗对「只 Stopped + disable」的会话有时会留残影：
    /// 需先 ClearAll+Update 清显示，再置 Closed，最后 SetIsEnabled(false)。
    pub fn clear() -> Result<(), String> {
        with_controls(|controls| {
            if let Ok(updater) = controls.DisplayUpdater() {
                let _ = updater.ClearAll();
                let _ = updater.Update();
            }
            if let Ok(timeline) = SystemMediaTransportControlsTimelineProperties::new() {
                let _ = timeline.SetStartTime(TimeSpan { Duration: 0 });
                let _ = timeline.SetEndTime(TimeSpan { Duration: 0 });
                let _ = timeline.SetPosition(TimeSpan { Duration: 0 });
                let _ = timeline.SetMinSeekTime(TimeSpan { Duration: 0 });
                let _ = timeline.SetMaxSeekTime(TimeSpan { Duration: 0 });
                let _ = controls.UpdateTimelineProperties(&timeline);
            }
            let _ = controls.SetPlaybackStatus(MediaPlaybackStatus::Closed);
            let _ = controls.SetIsEnabled(false);
            Ok(())
        })
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use tauri::AppHandle;

    #[allow(dead_code)]
    pub fn init(_app: &AppHandle, _hwnd: isize) -> Result<(), String> {
        Ok(())
    }
    pub fn update_metadata(
        _title: &str,
        _artist: &str,
        _album: &str,
        _cover_path: Option<&str>,
        _cover_bytes: Option<&[u8]>,
    ) -> Result<(), String> {
        Err("smtc: unsupported platform".into())
    }
    pub fn update_playback(
        _playing: bool,
        _position_secs: f64,
        _duration_secs: f64,
    ) -> Result<(), String> {
        Err("smtc: unsupported platform".into())
    }
    pub fn clear() -> Result<(), String> {
        Ok(())
    }
}

/// 供 lib.rs 在窗口就绪后初始化（Windows）。
#[cfg(target_os = "windows")]
pub fn init_with_hwnd(app: &tauri::AppHandle, hwnd: isize) -> Result<(), String> {
    use windows::Win32::Foundation::HWND;
    imp::init(app, HWND(hwnd as *mut _))
}

#[cfg(not(target_os = "windows"))]
pub fn init_with_hwnd(_app: &tauri::AppHandle, _hwnd: isize) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn smtc_update_metadata(
    title: String,
    artist: String,
    album: Option<String>,
    cover_path: Option<String>,
    cover_bytes: Option<Vec<u8>>,
) -> Result<(), String> {
    imp::update_metadata(
        &title,
        &artist,
        album.as_deref().unwrap_or(""),
        cover_path.as_deref(),
        cover_bytes.as_deref(),
    )
}

#[tauri::command]
pub fn smtc_update_playback(
    playing: bool,
    position_secs: f64,
    duration_secs: f64,
) -> Result<(), String> {
    imp::update_playback(playing, position_secs, duration_secs)
}

#[tauri::command]
pub fn smtc_clear() -> Result<(), String> {
    imp::clear()
}
