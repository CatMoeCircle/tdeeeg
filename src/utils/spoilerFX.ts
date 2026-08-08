/**
 * Telegram 风格剧透粒子特效（移植自官方 web 端动画示例）
 *
 * 效果：
 * - 默认（hidden）：底层文字置为透明，canvas 绘制一层动态流动的颗粒遮罩
 * - 点击：以点击位置为圆心做 ripple（圆形波纹）扩散，同时粒子逐渐淡出，
 *   最终 reveal 显示文字。
 *
 * 依赖 DOM 结构（由组件提供）：
 *   <span class="sp">
 *     <span class="sp-base">真实文字</span>
 *     <span class="sp-view"></span>   <!-- reveal 时显示文字的副本 -->
 *     <canvas class="sp-cv"></canvas>
 *   </span>
 */

export interface SpoilerFXOptions {
  mode?: 'particles' | 'noise';
  fps?: number;
  count?: number;
  density?: number;
  sizeMin?: number;
  sizeMax?: number;
  speedMin?: number;
  speedMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  fadeIn?: number;
  fadeOut?: number;
  alpha?: number;
  color?: string;
  textMode?: 'hide' | 'blur';
  blurPx?: number;
  reveal?: 'ripple' | 'fade';
  noiseAMin?: number;
  noiseAMax?: number;
  /**
   * ripple 波纹揭示应用到的目标：
   * - 'view'：应用在显示文字副本上（文本剧透默认）
   * - 'cv'  ：应用在粒子画布上，波纹扩散处的粒子被擦除露出底层（媒体剧透）
   */
  revealTarget?: 'view' | 'cv';
  /** 是否将 base 内容置为透明（文本场景为 true，媒体场景为 false） */
  hideBase?: boolean;
  /** 粒子层底下的半透明背景色（媒体场景用于增强遮罩可见性，如 'rgba(0,0,0,0.35)'） */
  layerBg?: string;
}

interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  sp: number;
  life: number;
  age: number;
  size: number;
  tier: number;
  a: number;
}

const ACTIVE = new Set<SpoilerFX>();

function easeInQuad(t: number): number {
  return t * t;
}

function parseColor(s: string | null): [number, number, number] | null {
  if (!s) return null;
  s = s.trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

const VIEW_IO = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const fx = (e.target as HTMLElement).__spoilerFX;
      if (fx) {
        fx.visible = e.isIntersecting;
        // 元素进入视野时若有绘制需求（隐藏态需流动粒子 / 有动画），唤醒循环
        if (e.isIntersecting && fx.needsFrame) startLoop();
      }
    }
  })
  : null;

let rafOn = false;

/**
 * 惰性全局动画循环：
 * - 仅当存在"需要绘制"的实例（可见的隐藏态剧透需要流动粒子，或正在 reveal 动画）才持续运行；
 * - 当没有任何实例需要绘制（全部揭示完毕或不可见）时自动停止，避免空转消耗 CPU。
 * 需要唤醒循环的时机都通过本函数（幂等）。
 */
function startLoop() {
  if (rafOn) return;
  rafOn = true;
  const loop = (now: number) => {
    let busy = false;
    for (const fx of ACTIVE) {
      if (fx.needsFrame) {
        busy = true;
        fx.frame(now);
      }
    }
    if (busy) {
      requestAnimationFrame(loop);
    } else {
      // 没有实例需要绘制，停止全局循环
      rafOn = false;
    }
  };
  requestAnimationFrame(loop);
}

/** 挂载到 DOM 上，标记实例，供 IntersectionObserver 反查 */
declare global {
  interface HTMLElement {
    __spoilerFX?: SpoilerFX;
    __spoilerFXClick?: (e: MouseEvent) => void;
    __spoilerFXRO?: ResizeObserver;
  }
}

export class SpoilerFX {
  private el: HTMLElement;
  private base: HTMLElement;
  private view: HTMLElement | null;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cfg: Required<SpoilerFXOptions>;

  private rgb: [number, number, number] = [0, 0, 0];
  private buf?: HTMLCanvasElement;
  private bctx?: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private ps: Particle[] = [];
  private dpr = 1;
  private state: 'hidden' | 'opening' | 'open' | 'closing' = 'hidden';
  private anim: {
    from: number; to: number; t0: number; dur: number;
    x: number; y: number; maxR: number;
  } | null = null;
  private lastF = 0;
  private last = 0;
  visible = true;

  /**
   * 是否需要在下一帧绘制：
   * - 不在视野内 → 不需要；
   * - 有进行中的 reveal/closing 动画 → 需要；
   * - 已揭示且无动画（open 静止）→ 不需要（遮罩已消失，粒子可停）；
   * - 其余（隐藏态静止）→ 需要（保持流动粒子遮罩效果）。
   * 全局循环据此判断是否继续运行，以及是否调用本实例的 frame()。
   */
  get needsFrame(): boolean {
    if (!this.visible) return false;
    if (this.anim) return true;
    return this.state !== 'open';
  }
  constructor(root: HTMLElement, userCfg: SpoilerFXOptions, textCfg?: {
    base: HTMLElement; view?: HTMLElement | null; cv: HTMLCanvasElement;
  }) {
    this.base = textCfg?.base ?? root.querySelector('.sp-base')!;
    this.view = textCfg?.view ?? root.querySelector('.sp-view');
    this.cv = textCfg?.cv ?? root.querySelector('.sp-cv')!;
    this.el = root;
    this.ctx = this.cv.getContext('2d')!;

    const d = defaults();
    const cfg = { ...d, ...userCfg } as Required<SpoilerFXOptions>;
    this.cfg = cfg;

    // base 隐藏策略：默认 hideBase=true（文本场景，base 透明）；媒体场景 false（base 即媒体）
    if (cfg.textMode === 'blur') {
      this.base.style.filter = `blur(${cfg.blurPx}px)`;
      this.base.style.opacity = '0.8';
    } else if (cfg.hideBase !== false) {
      this.base.style.color = 'transparent';
    }

    const revealEl = this.revealEl;
    if (cfg.reveal === 'fade') {
      if (revealEl) {
        revealEl.style.opacity = '0';
        revealEl.style.transition = 'opacity .22s ease';
      }
      this.cv.style.transition = 'opacity .22s ease';
    } else if (revealEl) {
      if (this.isMedia) {
        // 媒体剧透：初始（hidden）粒子画布完全显示以遮住媒体，不裁剪
        revealEl.style.maskImage = 'none';
        revealEl.style.webkitMaskImage = 'none';
      } else {
        // 文本剧透：view 副本初始被圆裁剪隐藏（base 透明，粒子可见）
        revealEl.style.clipPath = 'circle(0px at 50% 50%)';
      }
    }

    this.refreshColor();
    this.attachEvents();
    this.resize();
    startLoop();
  }

  /** ripple 波纹揭示/裁剪的目标元素：view（文本副本）或 cv（画布/媒体） */
  private get revealEl(): HTMLElement {
    return this.cfg.revealTarget === 'cv' ? this.cv : (this.view ?? this.cv);
  }

  /**
   * 是否为媒体剧透（revealTarget === 'cv'）。
   * 媒体与文本的 ripple 揭示方向相反：
   * - 文本：隐藏时裁剪 view 副本（粒子可见），揭示时在 view 上展开显示文字；
   * - 媒体：隐藏时粒子画布完整显示（遮住媒体），揭示时用 mask 波纹擦除粒子露出媒体。
   */
  private get isMedia(): boolean {
    return this.cfg.revealTarget === 'cv';
  }

  /** 设置媒体剧透的波纹遮罩：r 半径圆内被擦除（透明）露出媒体，圆外保留粒子 */
  private setMediaMask(x: number, y: number, r: number) {
    const el = this.revealEl;
    const rr = Math.max(0, r);
    const m = `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, transparent 0, transparent ${rr.toFixed(1)}px, black ${rr.toFixed(1)}px)`;
    el.style.maskImage = m;
    el.style.webkitMaskImage = m;
  }

  private refreshColor() {
    const c = this.cfg.color;
    let rgb: [number, number, number] | null = null;
    if (c === 'white') rgb = [255, 255, 255];
    else if (c === 'gray') rgb = [128, 130, 133];
    else if (typeof c === 'string' && c !== 'text') rgb = parseColor(c);
    if (!rgb) rgb = parseColor(getComputedStyle(this.el).color) || [0, 0, 0];
    this.rgb = rgb;
  }

  private attachEvents() {
    const onClick = (e: MouseEvent) => {
      // 已揭示（open）时遮罩已消失，把点击交给上层处理（如打开媒体查看器），不拦截
      if (this.state === 'open') return;
      // 未揭示时点击用于揭示/关闭遮罩；阻止冒泡，避免误触发上层（媒体查看器）的点击
      e.stopPropagation();
      this.toggle(e);
    };
    this.el.__spoilerFXClick = onClick;
    this.el.addEventListener('click', onClick);

    if (this.el.__spoilerFXRO) this.el.__spoilerFXRO.disconnect();
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => this.resize());
      ro.observe(this.el);
      this.el.__spoilerFXRO = ro;
    }

    this.el.__spoilerFX = this;
    if (VIEW_IO) VIEW_IO.observe(this.el);
    ACTIVE.add(this);
  }

  destroy() {
    if (this.el.__spoilerFXClick) {
      this.el.removeEventListener('click', this.el.__spoilerFXClick);
    }
    if (this.el.__spoilerFXRO) this.el.__spoilerFXRO.disconnect();
    if (VIEW_IO) VIEW_IO.unobserve(this.el);
    ACTIVE.delete(this);
    this.el.__spoilerFX = undefined;
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.w = r.width;
    this.h = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.max(1, Math.round(this.w * this.dpr));
    this.cv.height = Math.max(1, Math.round(this.h * this.dpr));
    const c = this.cfg;

    if (c.mode === 'noise') {
      this.buf = document.createElement('canvas');
      this.buf.width = Math.max(1, Math.ceil(this.cv.width / 2));
      this.buf.height = Math.max(1, Math.ceil(this.cv.height / 2));
      this.bctx = this.buf.getContext('2d')!;
      if (this.state !== 'open') this.drawNoise();
    } else {
      const n = c.count || 100;
      this.seed(n);
      if (this.state !== 'open') this.drawParticles(this.isMedia ? 1 : (1 - this.lastF));
    }
  }

  private seed(n: number) {
    this.ps = [];
    for (let i = 0; i < n; i++) this.ps.push(this.spawn(true));
  }

  private spawn(init: boolean): Particle {
    const c = this.cfg;
    const ang = Math.random() * Math.PI * 2;
    const life = c.lifeMin + Math.random() * (c.lifeMax - c.lifeMin);
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      dx: Math.cos(ang),
      dy: Math.sin(ang),
      sp: c.speedMin + Math.random() * (c.speedMax - c.speedMin),
      life,
      age: init ? Math.random() * life : 0,
      size: c.sizeMin + Math.random() * (c.sizeMax - c.sizeMin),
      tier: -1,
      a: c.alpha * (0.3 + Math.random() * 0.7),
    };
  }

  private step(dt: number) {
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.ps[i] = this.spawn(false);
        continue;
      }
      p.x += p.dx * p.sp * dt / 1000;
      p.y += p.dy * p.sp * dt / 1000;
      if (p.x < 0) p.x += this.w;
      else if (p.x > this.w) p.x -= this.w;
      if (p.y < 0) p.y += this.h;
      else if (p.y > this.h) p.y -= this.h;
    }
  }

  private drawParticles(layerA: number) {
    const ctx = this.ctx;
    if (layerA <= 0.01) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      return;
    }
    const c = this.cfg;
    const r = this.rgb[0], g = this.rgb[1], b = this.rgb[2];
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    // 可选：先铺一层半透明背景增强遮罩可见性（媒体场景），透明度随 reveal 淡出
    if (c.layerBg) {
      ctx.fillStyle = c.layerBg;
      ctx.globalAlpha = layerA;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      let a: number;
      if (c.fadeIn > 0 || c.fadeOut > 0) {
        const fi = c.fadeIn > 0 ? c.fadeIn : 1;
        const fo = c.fadeOut > 0 ? c.fadeOut : 1;
        a = Math.min(p.age / fi, (p.life - p.age) / fo, 1);
        if (a <= 0) continue;
        a *= c.alpha;
      } else {
        a = p.a;
      }
      a *= layerA;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      if (p.size > 2) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
  }

  private drawNoise() {
    if (!this.buf || !this.bctx) return;
    const bw = this.buf.width, bh = this.buf.height;
    const c = this.cfg;
    const img = this.bctx.createImageData(bw, bh);
    const px = new Uint32Array(img.data.buffer);
    const lo = c.noiseAMin, span = c.noiseAMax - c.noiseAMin;
    for (let i = 0; i < px.length; i++) {
      const v = (Math.random() * 255) | 0;
      const a = lo + ((Math.random() * span) | 0);
      px[i] = (a << 24) | (v << 16) | (v << 8) | v;
    }
    this.bctx.putImageData(img, 0, 0);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.drawImage(this.buf, 0, 0, this.cv.width, this.cv.height);
  }

  /**
   * 同步揭示状态 CSS 类。reveal 完成后（open）添加 .is-revealed，
   * 供外部 CSS 据此取消遮罩后的模糊效果等。
   */
  private syncStateClass() {
    this.el.classList.toggle('is-revealed', this.state === 'open');
  }

  private toggle(e: MouseEvent) {
    const r = this.el.getBoundingClientRect();
    const x = (e && e.clientX ? e.clientX : r.left + this.w / 2) - r.left;
    const y = (e && e.clientY ? e.clientY : r.top + this.h / 2) - r.top;
    const c = this.cfg;

    if (c.reveal === 'fade') {
      const open = this.state === 'open';
      this.state = open ? 'hidden' : 'open';
      const re = this.revealEl;
      if (re !== this.cv) re.style.opacity = open ? '0' : '1';
      this.cv.style.opacity = open ? '1' : '0';
      // 切回隐藏态后需要流动粒子 → 唤醒循环
      if (!open) startLoop();
      return;
    }

    let maxR = 0;
    const pts: [number, number][] = [[0, 0], [this.w, 0], [0, this.h], [this.w, this.h]];
    for (let i = 0; i < 4; i++) {
      const d = Math.sqrt((pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2);
      if (d > maxR) maxR = d;
    }
    const dur = Math.max(250, Math.min(550, maxR * 0.3));
    const to = (this.state === 'open' || this.state === 'closing') ? 0 : 1;
    this.anim = { from: this.lastF, to, t0: performance.now(), dur, x, y, maxR };
    this.state = to === 1 ? 'opening' : 'closing';
    // 有进行中的波纹动画 → 唤醒全局循环
    startLoop();
  }

  frame(now: number) {
    let f: number;
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.t0) / this.anim.dur);
      f = this.anim.from + (this.anim.to - this.anim.from) * easeInQuad(t);
      this.lastF = f;
      if (this.cfg.reveal === 'ripple') {
        if (this.isMedia) {
          // 媒体：mask 波纹 r 增大，圆内粒子被擦除露出媒体
          this.setMediaMask(this.anim.x, this.anim.y, f * this.anim.maxR);
        } else {
          this.revealEl.style.clipPath =
            `circle(${(f * this.anim.maxR).toFixed(1)}px at ${this.anim.x.toFixed(1)}px ${this.anim.y.toFixed(1)}px)`;
        }
      }
      if (t >= 1) {
        const to = this.anim.to;
        const { x, y, maxR } = this.anim;
        this.anim = null;
        this.state = to === 1 ? 'open' : 'hidden';
        this.syncStateClass();
        if (this.cfg.reveal === 'ripple') {
          if (this.isMedia) {
            const el = this.revealEl;
            if (to === 1) {
              // open：波纹铺满 → mask 全遮（粒子全擦除，露出媒体）
              this.setMediaMask(x, y, maxR + 1);
            } else {
              // hidden：恢复无遮罩，粒子全显示遮住媒体
              el.style.maskImage = 'none';
              el.style.webkitMaskImage = 'none';
            }
          } else {
            this.revealEl.style.clipPath = to === 1 ? 'none' : 'circle(0px at 50% 50%)';
          }
        }
      }
    } else {
      f = (this.state === 'open') ? 1 : 0;
    }
    if (!this.visible) return;
    if (this.state === 'open' && !this.anim) return;
    const interval = 1000 / this.cfg.fps;
    if (now - this.last < interval) return;
    const dt = this.last ? Math.min(100, now - this.last) : interval;
    this.last = now;
    if (this.cfg.mode === 'noise') {
      this.drawNoise();
    } else {
      this.step(dt);
      // 媒体：粒子层保持完整显示（alpha 不随揭示整体淡出），由 mask 波纹负责擦除露出媒体；
      // 文本：粒子随揭示整体淡出（layerA = 1 - f）
      this.drawParticles(this.isMedia ? 1 : (1 - f));
    }
  }
}

function defaults(): SpoilerFXOptions {
  return {
    mode: 'particles',
    fps: 30,
    count: 150,
    sizeMin: 1.04,
    sizeMax: 1.69,
    speedMin: 7,
    speedMax: 21,
    lifeMin: 1000,
    lifeMax: 3000,
    fadeIn: 0,
    fadeOut: 0,
    alpha: 1,
    color: 'text',
    textMode: 'hide',
    blurPx: 2,
    reveal: 'ripple',
    revealTarget: 'view',
    hideBase: true,
    layerBg: undefined,
    noiseAMin: 60,
    noiseAMax: 255,
  };
}
