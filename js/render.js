// Vẽ Canvas 2D phủ lên camera feed. Không dùng WebXR vì: (1) iOS Safari không có WebXR immersive-ar,
// (2) phiên WebXR AR dùng camera SAU — người chơi không thấy chính mình. Canvas 2D chạy mọi nơi.
import { CONFIG } from './config.js';
import { T } from './levels.js';
import { SKELETON } from './pose.js';
import { TileGeom } from './tiles.js';

const R = CONFIG.RENDER;

export class Renderer {
  constructor(canvas) {
    // KHÔNG dùng desynchronized: trên Chrome Android canvas độ trễ thấp bị tách thành lớp phủ đục → che mất hình camera
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: true });
    this.particles = []; this.popups = []; this.flash = 0; this.flashColor = '255,40,40'; this.shake = 0;
    this.fixed = null;   // {w,h}: khung cố định 16:9 khi phát sang TV qua Wi-Fi
    this.video = null;   // khi khác null: vẽ luôn hình camera vào canvas (để stream được cả người lẫn game)
    this.mirror = true; this.tvHud = false;
    this.look = 'ar';    // 'ar' = thấy phòng thật · 'game' = khung cảnh game + người cắt ra thu nhỏ
    this.bgDim = 0;      // làm tối hình phòng (kiểu 'ar') để đồ hoạ nổi rõ
    this.scroll = 0;
    this.resize();
  }

  setFixed(w, h) { this.fixed = w ? { w, h } : null; this.cv.classList.toggle('fixed', !!w); this.resize(); }

  resize() {
    if (this.fixed) {
      const k = this.lowQuality ? 0.75 : 1;
      this.W = this.fixed.w; this.H = this.fixed.h; this.dpr = k;
      this.cv.width = Math.round(this.W * k); this.cv.height = Math.round(this.H * k);
    } else {
      const dpr = Math.min(R.maxDpr, window.devicePixelRatio || 1) * (this.lowQuality ? 0.75 : 1);
      this.W = window.innerWidth; this.H = window.innerHeight;
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
      this.dpr = dpr;
    }
    this.u = Math.max(1, Math.min(this.W, this.H) / 500); // hệ số cỡ chữ/nét: to hơn trên TV
    this._horizon();
  }

  /**
   * Tỉ lệ thế giới theo CƠ THỂ người chơi: groundY = mặt đất (ngay dưới chân, px), ppm0 = số px cho 1 m ở chỗ người đứng.
   * Nhờ vậy rào thấp ngang gối, laser ngang ngực, tường cao hơn đầu, sao ở tầm với tay — đúng với người thật
   * (trẻ em thấp hơn thì mọi thứ cũng thấp theo). null = dùng mặc định (chơi bằng phím).
   */
  setWorld(groundY, ppm0) { this.groundY = groundY; this.ppm0 = ppm0; this._horizon(); }
  _horizon() {
    const g = this.groundY ?? this.H;
    this.hz = Math.max(this.H * 0.1, Math.min(this.H * R.horizon, g - this.H * 0.32)); // chân trời luôn đủ cao để thấy vật từ xa
  }

  // ---- phép chiếu phối cảnh: z (mét phía trước) → hệ số s, toạ độ màn hình ----
  s(z) { return R.focal / (R.focal + Math.max(z, -R.focal * 0.8)); }
  gy(s) { return this.hz + ((this.groundY ?? this.H) - this.hz) * s; }
  lx(lane, s) { return this.W / 2 + (lane - 1) * (this.W / 3) * s; }
  ppm(s) { return (this.ppm0 ?? this.H * R.ppmAtPlayer) * s; }

  fx(kind, ob) {
    const s = this.s(0.5), y = this.gy(s) - this.ppm(s) * 0.7;
    const x = ob && ob.lane >= 0 ? this.lx(ob.lane, s) : this.W / 2;
    if (kind === 'coin' || kind === 'star') {
      this.burst(x, y, kind === 'star' ? '#fff27a' : '#ffd23f', kind === 'star' ? 26 : 10);
      this.popup(x, y, kind === 'star' ? '★ +50' : '+10', '#ffe066');
    } else if (kind === 'hit') {
      const fire = ob?.type === T.FIRE;
      this.flash = 1; this.flashColor = fire ? '255,110,0' : '255,40,40'; this.shake = 14;
      this.burst(x, this.H * 0.8, fire ? '#ff7b00' : '#ff3b3b', 30);
      this.popup(this.W / 2, this.H * 0.45, fire ? 'RƠI HỐ LỬA!' : 'ÚI!', '#ff5a3c', 1.6);
    } else if (kind === 'dodge') {
      this.popup(x, this.H * 0.55, ob?.type === T.BAR ? 'Né đẹp!' : ob?.type === T.HURDLE ? 'Nhảy chuẩn!' : 'Ngon!', '#7dffb0');
    }
  }
  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 280;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150, life: 0.6 + Math.random() * 0.4, color });
    }
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
  }
  popup(x, y, text, color, scale = 1) { this.popups.push({ x, y, text, color, life: 1, scale }); }

  clear() {
    const { ctx, W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.opaque) return;
    if (this.look === 'game') { this.bgGame(); return; }
    // Canvas tự vẽ nền (hình camera hoặc nền tối) thay vì để thẻ <video> bên dưới lộ ra: không phụ thuộc trình duyệt
    // ghép lớp (lỗi trên Android), và khi phát sang TV qua Wi-Fi thì TV nhận đúng canvas này.
    const v = this.video;
    if (v && v.readyState >= 2 && v.videoWidth) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      this.drawVideo();
      if (this.bgDim > 0) { ctx.fillStyle = `rgba(5,8,30,${this.bgDim})`; ctx.fillRect(0, 0, W, H); }
    } else {
      const g = ctx.createRadialGradient(W / 2, H * 0.3, 10, W / 2, H * 0.3, W * 0.7);
      g.addColorStop(0, '#1b2366'); g.addColorStop(1, '#0a0e28');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  /** Khung cảnh game thay cho phòng thật: trời hoàng hôn, mặt trời, 2 lớp núi trôi theo quãng đường, mặt đất. */
  bgGame() {
    const { ctx, W, H } = this, hz = this.hz;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#0b1240'); sky.addColorStop(0.55, '#3b2a7e'); sky.addColorStop(1, '#ff8a5c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 1);
    const sun = ctx.createRadialGradient(W * 0.72, hz - H * 0.05, 0, W * 0.72, hz - H * 0.05, H * 0.2);
    sun.addColorStop(0, 'rgba(255,240,180,1)'); sun.addColorStop(0.35, 'rgba(255,170,90,0.85)'); sun.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, hz);
    const ridge = (base, amp, speed, color, seed) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, hz);
      for (let x = 0; x <= W; x += W / 48) {
        const t = (x / W) * 6 + this.scroll * speed + seed;
        ctx.lineTo(x, hz - base - amp * (0.55 * Math.sin(t) + 0.3 * Math.sin(t * 2.3 + 1) + 0.15 * Math.sin(t * 5.1 + 2)));
      }
      ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
    };
    ridge(H * 0.07, H * 0.05, 0.004, '#5a3a8a', 0);
    ridge(H * 0.03, H * 0.035, 0.012, '#2a1d55', 3);
    const ground = ctx.createLinearGradient(0, hz, 0, H);
    ground.addColorStop(0, '#24184f'); ground.addColorStop(1, '#0c0a22');
    ctx.fillStyle = ground; ctx.fillRect(0, hz, W, H - hz);
  }

  /** Vẽ người đã cắt nền, THU NHỎ theo hệ số s, chân đặt tại (x, y) trên đường/ô; có bóng dưới chân. */
  drawPerson(it, x, y, s, mirror, alpha = 1) {
    if (!it?.canvas) return;
    const { ctx } = this, cw = it.canvas.width, ch = it.canvas.height;
    const ax = (it.footPx ? it.footPx.x : it.cxPx) - it.bx, ay = (it.footPx ? it.footPx.y : it.bottomPx) - it.by;
    ctx.save();
    if (it.footPx) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, cw * s * 0.22, cw * s * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(it.canvas, -ax * s, -ay * s, cw * s, ch * s);
    ctx.restore();
  }

  /** Vẽ hình camera đúng như lớp nền (cùng cách phủ khung + lật gương) — dùng cho nền và cho phần "người" vẽ đè. */
  drawVideo() {
    const { ctx, W, H } = this, v = this.video;
    const s = (this.fit === 'contain' ? Math.min : Math.max)(W / v.videoWidth, H / v.videoHeight), dw = v.videoWidth * s, dh = v.videoHeight * s;
    ctx.save();
    if (this.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  }

  /**
   * Vẽ lại NGƯỜI (cắt từ hình camera theo khung xương: đầu, thân, tay, chân dạng ống bo tròn) lên TRÊN ô / đường đua,
   * để người trông như đứng trên sàn thật thay vì bị lớp đồ hoạ che mất chân.
   */
  cutout(pts) {
    const v = this.video;
    if (!pts || !v || v.readyState < 2 || !v.videoWidth) return;
    const ok = i => pts[i] && pts[i].v >= 0.45;
    if (!ok(11) || !ok(12)) return;
    const sw = Math.hypot(pts[11].x - pts[12].x, pts[11].y - pts[12].y);
    const path = new Path2D();
    const circle = (p, r) => { path.moveTo(p.x + r, p.y); path.arc(p.x, p.y, r, 0, Math.PI * 2); };
    const seg = (a, b, w) => { // ống bo tròn từ a tới b, bề rộng w
      if (!ok(a) || !ok(b)) return;
      const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
      path.moveTo(A.x + nx, A.y + ny); path.lineTo(B.x + nx, B.y + ny); path.lineTo(B.x - nx, B.y - ny); path.lineTo(A.x - nx, A.y - ny); path.closePath();
      circle(A, w / 2); circle(B, w / 2);
    };
    // thân: tứ giác vai–hông nới rộng
    if (ok(23) && ok(24)) {
      const c = { x: (pts[11].x + pts[12].x + pts[23].x + pts[24].x) / 4, y: (pts[11].y + pts[12].y + pts[23].y + pts[24].y) / 4 };
      const grow = p => ({ x: c.x + (p.x - c.x) * 1.25, y: c.y + (p.y - c.y) * 1.12 });
      const q = [pts[11], pts[12], pts[24], pts[23]].map(grow);
      path.moveTo(q[0].x, q[0].y); q.slice(1).forEach(p => path.lineTo(p.x, p.y)); path.closePath();
    } else seg(11, 12, sw * 0.6);
    // đầu
    const sh = { x: (pts[11].x + pts[12].x) / 2, y: (pts[11].y + pts[12].y) / 2 };
    const head = ok(0) ? { x: pts[0].x, y: pts[0].y - sw * 0.08 } : { x: sh.x, y: sh.y - sw * 0.75 };
    circle(head, sw * 0.52); seg(11, 12, sw * 0.35);
    if (ok(0)) { const neck = { x: (sh.x + head.x) / 2, y: (sh.y + head.y) / 2 }; circle(neck, sw * 0.28); }
    // tay, chân
    seg(11, 13, sw * 0.36); seg(13, 15, sw * 0.3); seg(12, 14, sw * 0.36); seg(14, 16, sw * 0.3);
    seg(23, 25, sw * 0.5); seg(25, 27, sw * 0.4); seg(24, 26, sw * 0.5); seg(26, 28, sw * 0.4);
    seg(27, 31, sw * 0.32); seg(28, 32, sw * 0.32); seg(27, 29, sw * 0.32); seg(28, 30, sw * 0.32); // bàn chân
    const { ctx } = this;
    ctx.save(); ctx.clip(path); this.drawVideo(); ctx.restore();
  }

  /** Chữ & HUD vẽ thẳng lên canvas — để TV (qua stream) thấy đủ, và đọc được từ 3 m. */
  overlay(ui, tMs) {
    const { ctx, W, H } = this;
    const u = Math.max(0.78, Math.min(W, H) / 720); // điện thoại dọc vẫn giữ chữ to, đọc được từ 1–1,5 m
    const text = (str, x, y, size, color = '#fff', align = 'center', weight = 800) => {
      ctx.font = `${weight} ${Math.round(size * u)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size * u * 0.16); ctx.strokeStyle = 'rgba(0,0,0,0.78)';
      ctx.strokeText(str, x, y, W * 0.94); ctx.fillStyle = color; ctx.fillText(str, x, y, W * 0.94);
    };
    ctx.save();
    if (ui.hud) {
      const h = ui.hud;
      text(String(h.score), W / 2, 50 * u, 66);
      text(`${h.dist} m · ${h.speed} km/h`, W / 2, 100 * u, 24, '#d6e4ff', 'center', 600);
      text('♥'.repeat(Math.max(0, h.lives)) + '♡'.repeat(Math.max(0, h.maxLives - h.lives)), 28 * u, 46 * u, 46, '#ff4d6d', 'left');
      if (h.combo > 1) text(`x${h.combo}`, 28 * u, 100 * u, 40, '#ffd23f', 'left');
    }
    if (ui.tiles) {
      const T = ui.tiles;
      if (T.phase === 'move') {
        const k = T.moveDur ? T.timeLeft / T.moveDur : 0;
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(W * 0.2, 128 * u, W * 0.6, 14 * u);
        ctx.fillStyle = k < 0.3 ? '#ff5a3c' : '#7dffb0'; ctx.fillRect(W * 0.2, 128 * u, W * 0.6 * k, 14 * u);
        text(String(Math.ceil(T.timeLeft)), W / 2, 74 * u, 92, k < 0.3 ? '#ff5a3c' : '#fff');
        text('Tìm Ô XANH!', W / 2, 168 * u, 30, '#7dffb0');
      }
      text(`Vòng ${T.round}`, 24 * u, 36 * u, 30, '#d6e4ff', 'left');
      T.players.forEach((p, i) => text(`P${p.n} ${p.alive ? '♥'.repeat(p.lives) : '✖ bị loại'}`, 24 * u, (80 + i * 40) * u, 28, p.alive ? p.color : '#888', 'left'));
      if (T.solo && T.best != null) text(`Kỷ lục: ${T.best} vòng`, W - 24 * u, 92 * u, 24, '#d6e4ff', 'right', 600);
    }
    if (ui.cue) this.cue(ui.cue, tMs, u, text);
    else if (ui.hint) text(ui.hint, W / 2, H * 0.25, 54);
    if (ui.big && tMs - ui.big.at < 950) {
      const k = (tMs - ui.big.at) / 950;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85);
      text(ui.big.text, W / 2, H / 2, 230 * (1.35 - 0.45 * k), '#fff');
      ctx.globalAlpha = 1;
    }
    if (ui.panel) {
      const p = ui.panel, lines = p.lines || [];
      if (p.side) { // bảng nhỏ bên trái (màn chỉnh góc camera): chữ nhỏ hơn, chừa chỗ nhìn người
        const portrait = H > W, lh = 30, bw = portrait ? W * 0.94 : Math.min(W * 0.5, 560 * u), bh = (62 + lines.length * lh) * u;
        const bx = portrait ? (W - bw) / 2 : 16 * u, by = 16 * u;
        ctx.fillStyle = 'rgba(5,8,30,0.72)';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 18 * u) : ctx.rect(bx, by, bw, bh); ctx.fill();
        const tx = bx + 18 * u;
        text(p.title, tx, by + 30 * u, 28, p.color || '#fff', 'left');
        lines.forEach((l, i) => { const o = typeof l === 'string' ? { text: l } : l; text(o.text, tx, by + (66 + i * lh) * u, 20, o.color || '#dfe6ff', 'left', 700); });
        if (ui.level != null) this.level(portrait ? W / 2 : W - 130 * u, portrait ? by + bh + 30 * u : 40 * u, ui.level); // chừa hàng nút ở dưới
        if (ui.corner) text(ui.corner, W - 18 * u, H - 22 * u, 20, ui.cornerColor || '#9fffcf', 'right', 600);
        ctx.restore(); return;
      }
      const bw = Math.min(W * 0.86, 980 * u), bh = (96 + lines.length * 46 + (p.progress != null ? 40 : 0)) * u;
      const bx = (W - bw) / 2, by = p.top ? (ui.hud ? 130 : 24) * u : (H - bh) / 2;
      ctx.fillStyle = 'rgba(5,8,30,0.74)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 22 * u) : ctx.rect(bx, by, bw, bh); ctx.fill();
      text(p.title, W / 2, by + 50 * u, 46, p.color || '#fff');
      lines.forEach((l, i) => { const o = typeof l === 'string' ? { text: l } : l; text(o.text, W / 2, by + (104 + i * 46) * u, 28, o.color || '#dfe6ff', 'center', 600); });
      if (p.progress != null) {
        const pw = bw * 0.6, px = (W - pw) / 2, py = by + bh - 34 * u;
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px, py, pw, 12 * u);
        ctx.fillStyle = '#7dffb0'; ctx.fillRect(px, py, pw * Math.min(1, p.progress), 12 * u);
      }
    }
    if (ui.corner) text(ui.corner, W - 18 * u, H - 22 * u, 20, ui.cornerColor || '#9fffcf', 'right', 600);
    ctx.restore();
  }

  /** Gợi ý nhìn được từ xa: viền màn hình đổi màu theo động tác + biểu tượng thật to, đậm dần khi vật tới gần. */
  cue(cue, tMs, u, text) {
    const { ctx, W, H } = this;
    const C = { jump: ['#00e5ff', '⬆', 'NHẢY'], duck: ['#c77dff', '⬇', 'NGỒI'], move: ['#ffd23f', cue.dir < 0 ? '⬅' : '➡', 'NÉ'], hands: ['#fff27a', '🙌', 'GIƠ TAY'] }[cue.action];
    if (!C) return;
    const k = Math.max(0, Math.min(1, 1 - cue.t / 1.3));
    const pulse = 0.75 + 0.25 * Math.sin(tMs / 70);
    ctx.save();
    ctx.globalAlpha = (0.25 + 0.6 * k) * pulse;
    ctx.strokeStyle = C[0]; ctx.lineWidth = (10 + 26 * k) * u;
    ctx.strokeRect(0, 0, W, H);
    ctx.globalAlpha = 0.55 + 0.45 * k;
    const size = Math.min(W, H) * (0.16 + 0.08 * k) / u;
    const y = H * 0.22;
    if (cue.action === 'move') text(`${cue.dir < 0 ? C[1] + ' ' : ''}${C[2]}${cue.dir > 0 ? ' ' + C[1] : ''}`, W / 2, y, size * 0.8, C[0]);
    else { text(C[1], W / 2, y, size, C[0]); text(C[2], W / 2, y + size * u * 0.85, size * 0.42, C[0]); }
    ctx.restore();
  }

  /** Khung xương tô 1 màu (nhiều người chơi). */
  skeletonColored(pts, color, alpha = 0.95, label = '') {
    const { ctx } = this;
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(4, Math.min(this.W, this.H) * 0.014);
    ctx.beginPath();
    for (const [a, b] of SKELETON) { const A = pts[a], B = pts[b]; if (A.v < 0.5 || B.v < 0.5) continue; ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); }
    ctx.stroke();
    if (label) {
      const n = pts[0], y = (n.v > 0.4 ? n.y : Math.min(pts[11].y, pts[12].y)) - 40 * this.u, x = n.v > 0.4 ? n.x : (pts[11].x + pts[12].x) / 2;
      ctx.font = `900 ${Math.round(26 * this.u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(label, x, y); ctx.fillStyle = color; ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  /** Game "Ô an toàn": lưới ô phối cảnh trên sàn, ô đỏ là hố lửa, ô xanh phát sáng; người chơi tô màu riêng. */
  tilesScene(dt, tSec, tg, geom, players, roster, manualPos, people = null) {
    const { ctx } = this;
    this.scroll = tSec * 4;
    this.clear();
    const flick = tg.phase === 'reveal' || tg.phase === 'idle';
    const urgent = tg.phase === 'move' && tg.timeLeft < 1.2;
    for (let r = 0; r < geom.rows; r++) for (let c = 0; c < geom.cols; c++) {
      const q = geom.quad(r, c), ce = geom.center(r, c);
      let col = tg.colorAt(r, c);
      if (flick) col = tg.phase === 'idle' ? 'n' : ((r * 7 + c * 13 + Math.floor(tSec * 9)) % 3 === 0 ? 'r' : 'g');
      ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      if (col === 'g') {
        const pulse = urgent ? 0.25 + 0.2 * Math.sin(tSec * 18) : 0;
        ctx.fillStyle = `rgba(40,230,120,${0.3 + pulse})`; ctx.fill();
        ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = Math.max(2, 4 * this.u); ctx.stroke();
      } else if (col === 'r') {
        ctx.fillStyle = 'rgba(110,12,0,0.55)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,40,0.8)'; ctx.lineWidth = Math.max(2, 3 * this.u); ctx.stroke();
        if (!flick) this.fire(ce.x, ce.y + ce.h * 0.15, ce.w * 0.4, Math.max(ce.h * 1.3, ce.w * 0.35), tSec, r * 7 + c);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    const inRoster = id => roster.find(p => p.id === id);
    if (people) { // khung cảnh game: người cắt nền đứng trên lưới ảo, xa trước gần sau
      for (const q of people) {
        const qd = geom.quad(q.tile.r, q.tile.c);
        ctx.beginPath(); qd.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.strokeStyle = q.color; ctx.lineWidth = 7 * this.u; ctx.stroke();
      }
      for (const q of [...people].sort((a, b) => a.y - b.y)) {
        this.drawPerson(q.it, q.x, q.y, q.s, this.mirror, q.alive ? 1 : 0.4);
        ctx.strokeStyle = q.color; ctx.lineWidth = 5 * this.u;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, 30 * this.u * q.persp, 10 * this.u * q.persp, 0, 0, Math.PI * 2); ctx.stroke();
        if (q.label) {
          ctx.font = `900 ${Math.round(26 * this.u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(q.label, q.x, q.headY - 18 * this.u); ctx.fillStyle = q.color; ctx.fillText(q.label, q.x, q.headY - 18 * this.u);
        }
      }
      players = [];
    }
    // ô đang đứng: viền đậm màu người chơi (biết chắc chân mình đang ở ô nào)
    for (const p of players) {
      if (!p.present || !p.feet) continue;
      const ro = inRoster(p.id);
      if (roster.length && (!ro || !ro.alive)) continue;
      const t = geom.locate(p.feet.x, p.feet.y), q = geom.quad(t.r, t.c);
      ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.strokeStyle = p.color; ctx.lineWidth = 7 * this.u; ctx.stroke();
    }
    // người vẽ đè lên ô → đứng TRÊN sàn, không bị ô che chân
    for (const p of players) if (p.present && p.pts) this.cutout(p.pts);
    for (const p of players) {
      if (!p.present || !p.pts) continue;
      const ro = inRoster(p.id);
      const color = ro ? (ro.alive ? p.color : '#777') : 'rgba(255,255,255,0.6)';
      this.skeletonColored(p.pts, color, ro && !ro.alive ? 0.35 : (this.video ? 0.55 : 0.95), ro ? `P${ro.n}` : '');
      if (ro && ro.alive) {
        ctx.strokeStyle = color; ctx.lineWidth = 5 * this.u;
        ctx.beginPath(); ctx.ellipse(p.feet.x, p.feet.y, 34 * this.u, 12 * this.u, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (manualPos) { // chơi bằng phím: con trỏ tròn trên ô
      const ce = geom.center(manualPos.r, manualPos.c);
      ctx.fillStyle = '#00e5ff'; ctx.beginPath(); ctx.ellipse(ce.x, ce.y, ce.w * 0.22, ce.h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(22 * this.u)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P1', ce.x, ce.y);
    }
    this.effects(dt);
  }

  /** Màn chỉnh góc camera: làn, mặt sàn + lưới ô xem trước, khung xương, vùng bị cắt, thước thăng bằng. */
  setupView(pts, info, tSec) {
    const { ctx, W, H } = this, u = this.u;
    this.clear();
    ctx.save();
    ctx.setLineDash([12, 10]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
    for (const x of [W / 3, 2 * W / 3]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = `700 ${Math.round(16 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ['làn trái', 'làn giữa', 'làn phải'].forEach((t, i) => ctx.fillText(t, W * (i + 0.5) / 3, H * 0.5));
    if (info.groundY) {
      const g = new TileGeom(W, H, info.tileRows || 3, W > H ? 4 : 3, Math.min(H * 0.9, info.groundY));
      ctx.strokeStyle = 'rgba(125,255,176,0.45)'; ctx.lineWidth = 2;
      for (let r = 0; r < 3; r++) for (let c = 0; c < g.cols; c++) { const q = g.quad(r, c); ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); }
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.moveTo(0, info.groundY); ctx.lineTo(W, info.groundY); ctx.stroke();
      ctx.fillStyle = '#7dffb0'; ctx.textAlign = 'right'; ctx.fillText('mặt sàn (chân)', W - 12 * u, info.groundY - 8 * u);
    }
    if (pts) { this.cutout(pts); this.skeleton(pts, null, null, tSec, 0.6); }
    ctx.fillStyle = 'rgba(255,60,60,0.35)';
    if (info.headCut) ctx.fillRect(0, 0, W, H * 0.05);
    if (info.feetCut) ctx.fillRect(0, H * 0.95, W, H * 0.05);
    ctx.restore();
  }

  /** Thước thăng bằng (bọt nước): lệch khỏi giữa = máy đang nghiêng. */
  level(cx, cy, dev) {
    const { ctx } = this, u = this.u, w = 200 * u, k = Math.max(-1, Math.min(1, dev / 15)), good = Math.abs(dev) < 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - w / 2, cy - 14 * u, w, 28 * u, 14 * u) : ctx.rect(cx - w / 2, cy - 14 * u, w, 28 * u); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - 14 * u); ctx.lineTo(cx, cy + 14 * u); ctx.stroke();
    ctx.fillStyle = good ? '#7dffb0' : '#ffcc00'; ctx.beginPath(); ctx.arc(cx + k * (w / 2 - 14 * u), cy, 10 * u, 0, Math.PI * 2); ctx.fill();
  }

  /** Mini-game đo độ trễ: bóng rơi xuống vạch theo nhịp, người chơi nhảy đúng lúc chạm vạch. */
  lagTest(now, L, cfg, pts, p, game) {
    const { ctx, W, H } = this;
    this.clear();
    const lineY = H * 0.7, top = H * 0.34, u = this.u;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6 * u;
    ctx.beginPath(); ctx.moveTo(W * 0.3, lineY); ctx.lineTo(W * 0.7, lineY); ctx.stroke();
    for (let k = 0; k < cfg.beats; k++) {
      const hit = L.start + k * cfg.period, dt = now - hit;
      if (dt < -cfg.fall || dt > 300) continue;
      const y = dt <= 0 ? top + (lineY - top) * (1 + dt / cfg.fall) : lineY;
      const r = 34 * u * (dt > 0 ? 1 + dt / 150 : 1);
      ctx.globalAlpha = dt > 0 ? Math.max(0, 1 - dt / 300) : 1;
      ctx.fillStyle = L.hits[k] ? '#7dffb0' : '#ffd23f';
      ctx.beginPath(); ctx.arc(W / 2, y - 34 * u, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (dt >= 0 && dt < 120) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, lineY - 8 * u, W, 16 * u); }
    }
    if (pts) this.skeleton(pts, p, game, now / 1000); else this.avatar(p, now / 1000, game);
  }

  /** Khung frame chính khi đang chơi. */
  frame(dt, tSec, game, player, view) {
    const { ctx } = this;
    this.scroll = game?.traveled || 0;
    this.clear();
    ctx.save();
    if (this.shake > 0.5) { ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= 0.85; }
    this.track(game.traveled, player?.lane ?? 1, view.dim);
    const obs = game.obstacles.filter(o => o.z > -3 && o.z < CONFIG.GAME.viewDist).sort((a, b) => b.z - a.z);
    const behind = [], front = [];
    for (const o of obs) (o.z > 1.2 ? behind : front).push(o);
    for (const o of behind) this.obstacle(o, tSec);
    const blink = game && tSec * 1000 < game.invulnUntil && Math.floor(tSec * 12) % 2 === 0;
    if (view.person) this.drawPerson(view.person.it, view.person.x, view.person.y, view.person.s, this.mirror, blink ? 0.35 : 1); // khung cảnh game
    else {
      if (view.pts && this.video && this.look === 'ar') this.cutout(view.pts); // người đứng trên đường đua, che vật ở phía sau mình
      if (view.skeleton && view.pts) this.skeleton(view.pts, player, game, tSec, this.video ? 0.55 : 0.95);
      else if (view.avatar) this.avatar(player, tSec, game);
    }
    for (const o of front) this.obstacle(o, tSec); // vật đã tới sát người vẽ đè lên người → cảm giác chiều sâu
    ctx.restore();
    this.effects(dt);
  }

  track(traveled, lane, dim = 0.35) {
    const { ctx, W, H } = this;
    const far = this.s(CONFIG.GAME.viewDist), near = this.s(-2);
    const yF = this.gy(far), yN = this.gy(near);
    const edge = (side, s) => W / 2 + side * (W / 2) * s;
    // mặt đường mờ để vẫn thấy môi trường thật phía sau
    const g = ctx.createLinearGradient(0, yF, 0, H);
    g.addColorStop(0, 'rgba(10,14,40,0)'); g.addColorStop(0.25, `rgba(10,14,40,${dim * 0.6})`); g.addColorStop(1, `rgba(10,14,40,${dim})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(edge(-1, far), yF); ctx.lineTo(edge(1, far), yF); ctx.lineTo(edge(1, near), yN); ctx.lineTo(edge(-1, near), yN); ctx.closePath(); ctx.fill();

    // làn người chơi đang đứng
    const s0 = this.s(0), s6 = this.s(7);
    const lg = ctx.createLinearGradient(0, this.gy(s6), 0, H);
    lg.addColorStop(0, 'rgba(0,229,255,0)'); lg.addColorStop(1, 'rgba(0,229,255,0.28)');
    ctx.fillStyle = lg;
    const lx = (l, s, side) => this.lx(l, s) + side * (W / 6) * s;
    ctx.beginPath(); ctx.moveTo(lx(lane, s6, -1), this.gy(s6)); ctx.lineTo(lx(lane, s6, 1), this.gy(s6)); ctx.lineTo(lx(lane, near, 1), yN); ctx.lineTo(lx(lane, near, -1), yN); ctx.closePath(); ctx.fill();

    // mép đường phát sáng + vạch chia làn chạy theo tốc độ
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.strokeStyle = 'rgba(0,229,255,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(edge(side, far), yF); ctx.lineTo(edge(side, near), yN); ctx.stroke();
    }
    const spacing = 4, off = traveled % spacing;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let z = spacing - off; z < CONFIG.GAME.viewDist; z += spacing) {
      const a = this.s(z), b = this.s(z + 1.6);
      ctx.lineWidth = Math.max(1, 5 * a);
      for (const d of [-0.5, 0.5]) {
        ctx.beginPath(); ctx.moveTo(W / 2 + d * (W / 3) * a, this.gy(a)); ctx.lineTo(W / 2 + d * (W / 3) * b, this.gy(b)); ctx.stroke();
      }
    }
  }

  obstacle(o, tSec) {
    const { ctx, W } = this;
    const s = this.s(o.z), y = this.gy(s), m = this.ppm(s);
    const full = o.lane === -1;
    const cx = full ? W / 2 : this.lx(o.lane, s);
    const halfW = full ? (W / 2) * s * 0.98 : (W / 6) * s * 0.86;
    // mờ dần khi ở xa (xuất hiện) và khi đã sát người (để không che mất chính người chơi)
    const fade = Math.min(1, (CONFIG.GAME.viewDist - o.z) / 10, 0.25 + Math.max(0, o.z) / 3);
    ctx.globalAlpha = fade;
    switch (o.type) {
      case T.FIRE: this.fire(cx, y, halfW, m, tSec, o.id); break;
      case T.HURDLE: this.hurdle(cx, y, halfW, m); break;
      case T.BAR: this.laser(cx, y, halfW, m, tSec); break;
      case T.WALL: this.wall(cx, y, halfW, m); break;
      case T.COIN: if (!o.taken) this.coin(cx, y - m * 0.6, m * 0.16, tSec + o.id); break;
      case T.STAR: if (!o.taken) this.star(cx, y, m, tSec); break;
    }
    ctx.globalAlpha = 1;
  }

  fire(cx, y, hw, m, t, seed) {
    const { ctx } = this;
    const depth = m * 0.55;
    const g = ctx.createRadialGradient(cx, y, 2, cx, y, hw);
    g.addColorStop(0, '#fff1a8'); g.addColorStop(0.25, '#ff9d00'); g.addColorStop(0.7, '#d62800'); g.addColorStop(1, 'rgba(60,0,0,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, y, hw, depth * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a1200'; ctx.lineWidth = Math.max(1, m * 0.05); ctx.stroke();
    // lưỡi lửa
    const n = Math.max(4, Math.round(hw / (m * 0.25)));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const fx = cx - hw * 0.8 + (hw * 1.6) * (i + 0.5) / n;
      const h = m * (0.45 + 0.35 * Math.abs(Math.sin(t * 7 + i * 1.7 + seed)));
      const w = (hw * 1.6) / n * 0.6;
      const fg = ctx.createLinearGradient(0, y - h, 0, y);
      fg.addColorStop(0, 'rgba(255,230,120,0)'); fg.addColorStop(0.4, 'rgba(255,150,0,0.8)'); fg.addColorStop(1, 'rgba(255,60,0,0.9)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(fx - w, y);
      ctx.quadraticCurveTo(fx - w * 0.6, y - h * 0.5, fx + Math.sin(t * 9 + i) * w * 0.4, y - h);
      ctx.quadraticCurveTo(fx + w * 0.6, y - h * 0.5, fx + w, y); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  posts(cx, y, hw, m, h, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    const pw = Math.max(2, m * 0.08);
    ctx.fillRect(cx - hw - pw / 2, y - m * h, pw, m * h);
    ctx.fillRect(cx + hw - pw / 2, y - m * h, pw, m * h);
  }

  hurdle(cx, y, hw, m) {
    const { ctx } = this;
    const h = 0.45, th = m * 0.14, top = y - m * h;
    this.posts(cx, y, hw, m, h, '#ddd');
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#ff2d55';
      ctx.fillRect(cx - hw + (2 * hw) * i / seg, top, (2 * hw) / seg + 0.5, th);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(cx - hw, top, 2 * hw, th);
  }

  laser(cx, y, hw, m, t) {
    const { ctx } = this;
    const h = 1.25, ly = y - m * h;
    this.posts(cx, y, hw, m, h + 0.1, '#555b70');
    const pulse = 0.7 + 0.3 * Math.sin(t * 20);
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,0,60,${0.25 * pulse})`; ctx.lineWidth = Math.max(4, m * 0.35);
    ctx.beginPath(); ctx.moveTo(cx - hw, ly); ctx.lineTo(cx + hw, ly); ctx.stroke();
    ctx.strokeStyle = `rgba(255,80,120,${pulse})`; ctx.lineWidth = Math.max(2, m * 0.08);
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, m * 0.025); ctx.stroke();
  }

  wall(cx, y, hw, m) {
    const { ctx } = this;
    const h = m * 2.0, top = y - h, d = m * 0.25;
    ctx.fillStyle = 'rgba(40,60,110,0.92)';
    ctx.fillRect(cx - hw, top, 2 * hw, h);
    ctx.fillStyle = 'rgba(90,120,190,0.95)';
    ctx.beginPath(); ctx.moveTo(cx - hw, top); ctx.lineTo(cx + hw, top); ctx.lineTo(cx + hw * 0.92, top - d); ctx.lineTo(cx - hw * 0.92, top - d); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = Math.max(1, m * 0.06);
    ctx.strokeRect(cx - hw, top, 2 * hw, h);
    // vạch cảnh báo
    ctx.save(); ctx.beginPath(); ctx.rect(cx - hw, y - m * 0.5, 2 * hw, m * 0.3); ctx.clip();
    ctx.fillStyle = '#ffcc00';
    for (let x = cx - hw - m; x < cx + hw + m; x += m * 0.4) {
      ctx.beginPath(); ctx.moveTo(x, y - m * 0.2); ctx.lineTo(x + m * 0.2, y - m * 0.2); ctx.lineTo(x + m * 0.5, y - m * 0.5); ctx.lineTo(x + m * 0.3, y - m * 0.5); ctx.fill();
    }
    ctx.restore();
  }

  coin(x, y, r, t) {
    const { ctx } = this;
    const w = Math.max(r * 0.15, Math.abs(Math.cos(t * 4)) * r);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.beginPath(); ctx.ellipse(x, y, w, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  star(cx, y, m, t) {
    const { ctx } = this;
    const sy = y - m * 2.15, r = m * 0.32 * (1 + 0.08 * Math.sin(t * 6));
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,242,122,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx, sy + r); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,242,122,0.25)';
    ctx.beginPath(); ctx.arc(cx, sy, r * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff27a'; ctx.strokeStyle = '#e0a800'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5 + t * 1.5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(cx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  skeleton(pts, p, game, t, alpha = 0.95) {
    const { ctx } = this;
    const blink = game && t * 1000 < game.invulnUntil / 1 && Math.floor(t * 12) % 2 === 0;
    const color = p?.airborne ? '#00e5ff' : p?.ducking ? '#c77dff' : '#7dffb0';
    ctx.globalAlpha = blink ? 0.3 * alpha : alpha;
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, Math.min(this.W, this.H) * 0.016);
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const [a, b] of SKELETON) {
      const A = pts[a], B = pts[b];
      if (A.v < 0.5 || B.v < 0.5) continue;
      ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const i of [0, 15, 16, 27, 28]) { const q = pts[i]; if (q.v > 0.5) { ctx.beginPath(); ctx.arc(q.x, q.y, ctx.lineWidth * 0.9, 0, Math.PI * 2); ctx.fill(); } }
    ctx.globalAlpha = 1;
  }

  /** Người que thay cho skeleton khi chơi bằng phím/vuốt (không camera). */
  avatar(p, t, game) {
    const { ctx, H } = this;
    const s = this.s(0.3), x = this.lx(p?.lane ?? 1, s), ground = this.gy(s) - 4;
    const m = this.ppm(s) * 0.62; // nhỏ hơn người thật để còn thấy đường phía trước
    const jump = p?.airborne ? m * 0.7 : 0, duck = p?.ducking ? 0.5 : 1;
    const blink = game && t * 1000 < game.invulnUntil && Math.floor(t * 12) % 2 === 0;
    const run = Math.sin(t * 14);
    const hip = { x, y: ground - jump - m * 0.9 * duck };
    const head = { x, y: hip.y - m * 0.75 * duck - m * 0.18 };
    const neck = { x, y: hip.y - m * 0.6 * duck };
    ctx.globalAlpha = blink ? 0.3 : 1;
    ctx.strokeStyle = p?.airborne ? '#00e5ff' : p?.ducking ? '#c77dff' : '#7dffb0';
    ctx.lineWidth = Math.max(4, m * 0.09); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y);
    for (const sgn of [-1, 1]) {
      ctx.moveTo(hip.x, hip.y); ctx.lineTo(hip.x + sgn * m * 0.18 + run * sgn * m * 0.15, hip.y + m * 0.45 * duck); ctx.lineTo(hip.x + sgn * m * 0.2, ground - jump);
      const up = p?.handsUp || p?.oneHandUp;
      ctx.moveTo(neck.x, neck.y); ctx.lineTo(neck.x + sgn * m * 0.32, up ? neck.y - m * 0.55 : neck.y + m * 0.3 - run * sgn * m * 0.1);
    }
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(head.x, head.y, m * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, ground, m * 0.35, m * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    void H;
  }

  /** Màn hiệu chỉnh: khung đứng + 3 làn = 3 phần màn hình. */
  calibration(pts, motion, tSec) {
    const { ctx, W, H } = this;
    this.clear();
    const ok = motion?.distance.hint === 'ok';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
    for (const x of [W / 3, 2 * W / 3]) { ctx.beginPath(); ctx.moveTo(x, H * 0.05); ctx.lineTo(x, H * 0.97); ctx.stroke(); }
    ctx.setLineDash([16, 10]); ctx.lineDashOffset = -tSec * 30;
    ctx.strokeStyle = ok ? '#7dffb0' : '#ffcc00'; ctx.lineWidth = 4;
    const bx = W / 3 + 6, bw = W / 3 - 12, by = H * 0.06, bh = H * 0.9;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 24) : ctx.rect(bx, by, bw, bh); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    if (pts) this.skeleton(pts, motion, null, tSec);
    if (motion?.calibrating !== false && motion?.calibProgress > 0) {
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.5, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * motion.calibProgress); ctx.stroke();
    }
  }

  effects(dt) {
    const { ctx, W, H } = this;
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x - 3 * this.u, p.y - 3 * this.u, 6 * this.u, 6 * this.u); }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      p.life -= dt * 0.9; p.y -= 60 * dt;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = `800 ${Math.round(28 * p.scale * this.u)}px system-ui, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
    }
    this.popups = this.popups.filter(p => p.life > 0);
    ctx.globalAlpha = 1;
    if (this.flash > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, `rgba(${this.flashColor},0)`); g.addColorStop(1, `rgba(${this.flashColor},${0.6 * this.flash})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      this.flash *= Math.pow(0.04, dt);
    }
  }
}
