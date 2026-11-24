// Vẽ Canvas 2D phủ lên camera feed. Không dùng WebXR vì: (1) iOS Safari không có WebXR immersive-ar,
// (2) phiên WebXR AR dùng camera SAU — người chơi không thấy chính mình. Canvas 2D chạy mọi nơi.
import { CONFIG } from './config.js';
import { T } from './levels.js';
import { SKELETON } from './pose.js';
import { TileGeom } from './tiles.js';
import { drawDino, drawDinoBg, dinoPose, drawWaterFront, drawProjectile } from './dinodraw.js';
import { dinoBox, RESP } from './dino.js';
import { drawPrincess, drawBallroom, drawPoseIcon, PRINCESSES, ARM_POSES } from './princess.js';
import { POSES, KID_POSES, KID_GRADE } from './dance.js';
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const clamp01 = x => Math.max(0, Math.min(1, x));

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
    if (this.look === 'fruit') { this.bgFruit(); return; }
    if (this.look === 'dino') { drawDinoBg(this, this.scroll || 0, this.dinoEnv || 'plains'); return; }
    if (this.look === 'dance') { if (this._ballroom) ctx.drawImage(this._ballroom, 0, 0); else { ctx.fillStyle = '#1c0f3a'; ctx.fillRect(0, 0, W, H); } return; }
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

  /** Nền game Chém trái cây: bầu trời CAO (chiếm ~85% màn hình) để trái rơi từ xa, núi thấp, mặt đất mỏng ở đáy. */
  bgFruit() {
    const { ctx, W, H } = this, hz = H * 0.86;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#060a24'); sky.addColorStop(0.6, '#1d1a5a'); sky.addColorStop(1, '#6b3c8c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 1);
    if (!this.stars) this.stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 7919 % 1000) / 1000, y: (i * 104729 % 1000) / 1000 * 0.7, r: 0.6 + (i % 3) * 0.5 }));
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const st of this.stars) { ctx.globalAlpha = 0.4 + 0.4 * Math.sin(this.scroll * 0.8 + st.x * 40); ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r * this.u, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    const moon = ctx.createRadialGradient(W * 0.82, H * 0.16, 0, W * 0.82, H * 0.16, H * 0.14);
    moon.addColorStop(0, 'rgba(255,250,220,1)'); moon.addColorStop(0.45, 'rgba(255,240,200,0.95)'); moon.addColorStop(0.5, 'rgba(255,230,180,0.25)'); moon.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = moon; ctx.fillRect(W * 0.6, 0, W * 0.4, H * 0.35);
    ctx.fillStyle = '#2a1d55'; ctx.beginPath(); ctx.moveTo(0, hz);
    for (let x = 0; x <= W; x += W / 40) { const t = x / W * 7; ctx.lineTo(x, hz - H * (0.04 + 0.03 * Math.sin(t) + 0.015 * Math.sin(t * 2.7 + 1))); }
    ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
    const gnd = ctx.createLinearGradient(0, hz, 0, H); gnd.addColorStop(0, '#1a1240'); gnd.addColorStop(1, '#0a0820');
    ctx.fillStyle = gnd; ctx.fillRect(0, hz, W, H - hz);
    for (const st of this.stains || []) { ctx.globalAlpha = Math.max(0, st.life) * 0.5; ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  /** Vẽ 1 trái (hoặc bom / khế vàng) tại toạ độ gốc đã dời; cut=true: vẽ mặt cắt ruột. */
  fruitShape(type, r, tSec, cut = false) {
    const { ctx } = this;
    const circle = (x, y, rr, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); };
    const shade = (c1, c2, rx = r, ry = r) => { const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, rx * 0.1, 0, 0, Math.max(rx, ry)); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    switch (type) {
      case 'watermelon':
        shade('#5fd36b', '#1c6b2a', r, r * 0.82);
        ctx.strokeStyle = '#124d1c'; ctx.lineWidth = r * 0.09;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * r * 0.32, 0, r * 0.12, r * 0.78, 0, 0, Math.PI * 2); ctx.stroke(); }
        if (cut) { ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); for (let i = -3; i <= 3; i++) circle(i * r * 0.22, (i % 2) * r * 0.06, r * 0.035, '#111'); }
        break;
      case 'orange':
        shade('#ffd27a', '#e86a00');
        ctx.fillStyle = 'rgba(160,70,0,0.35)'; for (let i = 0; i < 9; i++) circle(Math.cos(i * 2.4) * r * 0.55, Math.sin(i * 2.4) * r * 0.5, r * 0.05, ctx.fillStyle);
        circle(0, -r * 0.92, r * 0.1, '#3a8f2a');
        if (cut) { ctx.fillStyle = '#ffc067'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.88, r * 0.24, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'apple':
        shade('#ff7b86', '#a3121f');
        circle(0, -r * 0.88, r * 0.22, '#7a0d16');
        ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(r * 0.1, -r * 1.2); ctx.stroke();
        ctx.fillStyle = '#3fae3a'; ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 1.12, r * 0.22, r * 0.1, -0.5, 0, Math.PI * 2); ctx.fill();
        if (cut) { ctx.fillStyle = '#fff1c1'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.88, r * 0.24, 0, 0, Math.PI * 2); ctx.fill(); circle(0, 0, r * 0.08, '#6b4a2a'); }
        break;
      case 'mango':
        shade('#ffe066', '#f05a28', r * 1.15, r * 0.8);
        if (cut) { ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'dragon':
        shade('#ff7ac2', '#c2185b', r, r * 1.05);
        ctx.fillStyle = '#5fd36b';
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); ctx.lineTo(Math.cos(a + 0.18) * r * 1.22, Math.sin(a + 0.18) * r * 1.22); ctx.lineTo(Math.cos(a + 0.36) * r * 0.75, Math.sin(a + 0.36) * r * 0.75); ctx.fill(); }
        if (cut) { ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.24, 0, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 12; i++) circle((i / 11 - 0.5) * r * 1.5, ((i * 7) % 3 - 1) * r * 0.06, r * 0.025, '#111'); }
        break;
      case 'bomb': {
        const pulse = 0.5 + 0.5 * Math.sin(tSec * 12);
        ctx.strokeStyle = `rgba(255,40,40,${0.35 + 0.4 * pulse})`; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2); ctx.stroke();
        shade('#666', '#0b0b0b');
        ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.4, -r * 1.4, r * 0.15, -r * 1.6); ctx.stroke();
        circle(r * 0.15, -r * 1.6, r * (0.14 + 0.08 * pulse), '#ffd23f');
        ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(r * 0.9)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✖', 0, r * 0.05);
        break;
      }
      case 'gold': { // khế vàng: sao 5 cánh phát sáng
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8); g.addColorStop(0, 'rgba(255,240,120,0.6)'); g.addColorStop(1, 'rgba(255,200,0,0)');
        ctx.fillStyle = g; ctx.fillRect(-r * 1.8, -r * 1.8, r * 3.6, r * 3.6);
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#c98a00'; ctx.lineWidth = r * 0.08; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r * 1.05; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      }
    }
  }

  /** Hiệu ứng khi chém: 2 nửa trái bay tách ra theo hướng vuông góc nhát chém + nước bắn + vết nước trên nền. */
  sliceFx(o, angle) {
    const JUICE = { watermelon: '#ff4d5e', orange: '#ffa630', apple: '#fff1c1', mango: '#ffb703', dragon: '#ff5fb0', gold: '#ffe066' };
    const nx = -Math.sin(angle), ny = Math.cos(angle), sp = this.H * 0.25;
    this.halves = this.halves || [];
    for (const side of [-1, 1]) this.halves.push({ type: o.type, r: o.r, x: o.x + nx * side * o.r * 0.15, y: o.y + ny * side * o.r * 0.15, rot: angle, side, vx: o.vx + nx * side * sp, vy: o.vy * 0.3 + ny * side * sp - this.H * 0.1, vr: side * 3, life: 1.3 });
    if (this.halves.length > 30) this.halves.splice(0, this.halves.length - 30);
    this.burst(o.x, o.y, JUICE[o.type] || '#fff', 18);
    this.stains = (this.stains || []).concat({ x: o.x, y: o.y, r: o.r * 1.3, color: JUICE[o.type] || '#fff', life: 1 }).slice(-14);
  }

  /** Cảnh Chém trái cây: nền trời cao, trái rơi, nửa trái, người nhỏ ở đáy, lưỡi chém 2 tay. */
  fruitScene(dt, tSec, fg, view) {
    const { ctx, H } = this, u = this.u;
    this.scroll = tSec;
    this.clear();
    for (const st of this.stains || []) st.life -= dt * 0.4;
    if (this.stains) this.stains = this.stains.filter(st => st.life > 0);
    // người (nhỏ, đứng ở đáy) vẽ trước để trái rơi ngang qua phía trước
    for (const ps of view.persons || []) {
      ctx.save();
      if (ps.label?.stunned) ctx.globalAlpha = 0.45 + 0.25 * Math.sin(tSec * 25); // bị choáng: nhấp nháy
      if (ps.it) this.drawPersonAt(ps.it, ps.anchorF, ps.anchorD, ps.s, this.mirror);
      else if (ps.skel) this.skeleton(ps.skel, null, null, tSec, 0.9);
      ctx.restore();
      if (ps.label) { // nhãn P1 / P2 trên đầu người nhỏ
        const y = ps.label.y, lx = ps.label.x;
        ctx.font = `900 ${Math.round(30 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6 * u; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(ps.label.text + (ps.label.stunned ? ' 💫' : ''), lx, y);
        ctx.fillStyle = ps.label.color; ctx.fillText(ps.label.text + (ps.label.stunned ? ' 💫' : ''), lx, y);
      }
    }
    // dây nối mờ từ cổ tay thật (nhỏ) tới lưỡi chém → dễ hiểu tay mình đang điều khiển lưỡi nào
    for (const h of view.hands || []) if (h.from) {
      ctx.setLineDash([6 * u, 8 * u]); ctx.strokeStyle = h.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(h.from.x, h.from.y); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (const o of fg.objs) { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot); this.fruitShape(o.type, o.r, tSec); ctx.restore(); }
    for (const hf of this.halves || []) {
      hf.life -= dt; hf.vy += H * 0.9 * dt; hf.x += hf.vx * dt; hf.y += hf.vy * dt; hf.rot += hf.vr * dt;
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, hf.life * 1.5)); ctx.translate(hf.x, hf.y); ctx.rotate(hf.rot);
      ctx.beginPath(); ctx.rect(-hf.r * 1.5, hf.side > 0 ? 0 : -hf.r * 1.5, hf.r * 3, hf.r * 1.5); ctx.clip();
      this.fruitShape(hf.type, hf.r, tSec, true); ctx.restore();
    }
    if (this.halves) this.halves = this.halves.filter(hf => hf.life > 0 && hf.y < H + hf.r * 2);
    // lưỡi chém: vệt sáng thon dần theo đường tay vừa đi qua (không còn chấm tròn)
    for (const h of view.hands || []) this.blade(h, tSec);
    this.effects(dt);
  }

  /**
   * Vệt chém kiểu "lưỡi kiếm sáng": đuôi nhọn → thân dày dần → đầu bo tròn nhỏ.
   * Điểm tay từ camera thưa (15–30 Hz) nên nội suy Catmull-Rom cho mượt; độ dài giới hạn ~30% chiều cao,
   * tay đứng yên thì vệt co lại và chỉ còn một vòng mờ nhỏ báo vị trí.
   */
  blade(h, tSec) {
    const { ctx, H } = this, u = this.u;
    if (h.stunned) h = { ...h, color: '#8a8a99', speed: 0.3 }; // đang choáng: lưỡi xám, mảnh
    const raw = (h.trail || []).slice();
    const last = raw[raw.length - 1];
    if (!last || last.x !== h.x || last.y !== h.y) raw.push({ x: h.x, y: h.y });
    let len = 0;
    for (let i = 1; i < raw.length; i++) len += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y);
    if (raw.length < 2 || len < H * 0.025) { // gần như đứng yên → vòng mờ nhỏ, không phải chấm đặc
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = h.color; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(h.x, h.y, 7 * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      return;
    }
    // nội suy Catmull-Rom
    const P = [];
    for (let i = 0; i < raw.length - 1; i++) {
      const p0 = raw[Math.max(0, i - 1)], p1 = raw[i], p2 = raw[i + 1], p3 = raw[Math.min(raw.length - 1, i + 2)];
      const n = Math.max(1, Math.min(8, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / (6 * u))));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        P.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    P.push({ x: h.x, y: h.y });
    // cắt bớt phần đuôi nếu dài quá 30% chiều cao màn hình
    const maxLen = H * 0.3; let acc = 0, start = 0;
    for (let i = P.length - 1; i > 0; i--) { acc += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); if (acc > maxLen) { start = i - 1; break; } }
    const Q = P.slice(start);
    if (Q.length < 2) return;
    const dist = [0];
    for (let i = 1; i < Q.length; i++) dist.push(dist[i - 1] + Math.hypot(Q[i].x - Q[i - 1].x, Q[i].y - Q[i - 1].y));
    const total = dist[dist.length - 1] || 1;
    // độ dày theo tốc độ: vung nhanh → lưỡi dày & sáng hơn
    const power = Math.min(1, 0.45 + 0.55 * Math.min(1, (h.speed || 0) / 2.2));
    const poly = (half) => {
      const L = [], R = [];
      for (let i = 0; i < Q.length; i++) {
        const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)];
        let nx = -(b.y - a.y), ny = b.x - a.x; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const k = dist[i] / total;                       // 0 = đuôi, 1 = đầu
        const w = half * Math.pow(k, 0.85) * Math.min(1, 0.55 + (1 - k) * 6); // đuôi nhọn, đầu thu nhẹ
        L.push([Q[i].x + nx * w, Q[i].y + ny * w]); R.push([Q[i].x - nx * w, Q[i].y - ny * w]);
      }
      ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
      for (const p of L) ctx.lineTo(p[0], p[1]);
      const hw = half * 0.55, end = Q[Q.length - 1], pre = Q[Q.length - 2];
      const ang = Math.atan2(end.y - pre.y, end.x - pre.x);
      ctx.arc(end.x, end.y, hw, ang - Math.PI / 2, ang + Math.PI / 2); // đầu bo tròn
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
      ctx.closePath(); ctx.fill();
    };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = h.color; ctx.globalAlpha = 0.1 * power; poly(30 * u * power);    // quầng sáng ngoài (2 lớp cho mềm)
    ctx.globalAlpha = 0.16 * power; poly(21 * u * power);
    ctx.globalAlpha = 0.55 * power; poly(14 * u * power);                             // thân màu
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.95; poly(6 * u * power);            // lõi trắng sáng
    ctx.restore();
  }

  /**
   * Cảnh ĐẤU KHỦNG LONG (góc nhìn thứ nhất): khủng long nhìn thẳng vào màn hình, điểm yếu sáng, đá bay tới,
   * khung nhỏ góc trái dưới hiện chính người chơi (để biết mình đang né / ngồi / đỡ).
   * view: { hands, pip: { it | skel }, react: '⬅ NÉ' … , lost }
   */
  dinoScene(dt, tSec, dg, view) {
    const { ctx, W, H } = this, u = this.u;
    this.scroll = tSec; this.dinoEnv = dg.env;
    this.clear();
    const d = dg.dino, key = d.key, env = dg.env;
    const waterLv = env === 'sea' ? 0.8 : env === 'river' ? 0.86 : 0;
    // tư thế từng bộ phận + biến đổi toàn thân do biên đạo động tác tính (dinodraw.dinoPose)
    const B = dinoBox(W, H, key, d.z, d.sway);
    const pose = dinoPose(d, dg.clock, tSec, W, H), A = pose.A;
    const { sx, ox, oy, rot } = pose, alpha = d.phase === 'down' ? 1 - Math.max(0, (d.t - 0.9) / 0.9) : 1;
    const focus = { x: B.x, y: B.y - B.h * pose.focusV };
    const cur = d.phase === 'attack' ? d.cur : null;
    const need = cur && !cur.fake ? cur.need : cur?.fake ? 'dodge' : null, RC = need ? RESP[need].color : '#ff3b3b';
    const winding = cur && d.curTo > 0, kTele = winding ? Math.max(0, Math.min(1, 1 - d.curTo / Math.max(0.3, cur.tele))) : 0;
    let shake = pose.shake * u + kTele * 3 * u;
    if (pose.stomp && !this._stomped && ['trex', 'trike', 'ankylo', 'stego', 'spino', 'parasaur', 'allo'].includes(key)) { this.shake = Math.max(this.shake || 0, key === 'trex' ? 6 : 4); this.burst(B.x + (Math.random() - 0.5) * B.w * 0.5, B.y, '#c8a878', 6); }
    this._stomped = pose.stomp;
    // VÙNG NGUY HIỂM (tô theo phản ứng cần làm): NÉ → nửa bên bị đánh · NHẢY → dải thấp · NGỒI → dải cao · ĐỠ → viền xanh
    if (winding && need && need !== 'smash' && need !== 'none' && !cur.fake) {
      const a = 0.12 + 0.22 * kTele * (0.7 + 0.3 * Math.sin(tSec * 18));
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = RC;
      if (need === 'dodge') { const side = -cur.dir; ctx.fillRect(side < 0 ? 0 : W * 0.55, 0, W * 0.45, H); }
      else if (need === 'jump') ctx.fillRect(0, H * 0.72, W, H * 0.28);
      else if (need === 'duck') ctx.fillRect(0, 0, W, H * 0.42);
      ctx.restore();
    }
    // khủng long vẽ vào canvas đệm → tô màu theo phản ứng khi gồng, trắng khi trúng đòn
    const oc = this._dinoCv || (this._dinoCv = document.createElement('canvas'));
    if (oc.width !== this.cv.width || oc.height !== this.cv.height) { oc.width = this.cv.width; oc.height = this.cv.height; }
    const c = oc.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, oc.width, oc.height); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.save();
    c.translate(ox + (Math.random() - 0.5) * shake, oy + (Math.random() - 0.5) * shake);
    c.translate(focus.x, focus.y); c.scale(sx, sx); c.translate(-focus.x, -focus.y);
    if (rot) { c.translate(B.x, B.y); c.rotate(rot); c.translate(-B.x, -B.y); }
    drawDino(c, key, B, A);
    c.restore();
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop';
    if (d.flash > 0) { c.fillStyle = `rgba(255,255,255,${0.75 * d.flash})`; c.fillRect(0, 0, oc.width, oc.height); }
    else if (winding && need !== 'none') { c.globalAlpha = 0.25 * kTele * (0.7 + 0.3 * Math.sin(tSec * 30)); c.fillStyle = RC; c.fillRect(0, 0, oc.width, oc.height); }
    else if (d.phase === 'tired') { c.globalAlpha = 0.15 + 0.1 * Math.sin(tSec * 8); c.fillStyle = '#ffd23f'; c.fillRect(0, 0, oc.width, oc.height); }
    c.restore();
    if (winding) { // quầng màu phía sau khi gồng
      const g = ctx.createRadialGradient(B.x, B.y - B.h * 0.5, B.h * 0.1, B.x, B.y - B.h * 0.5, B.h * 0.9);
      g.addColorStop(0, hexA(RC, 0.35 * kTele)); g.addColorStop(1, hexA(RC, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.save(); ctx.globalAlpha = alpha; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(oc, 0, 0); ctx.restore();
    // bầy (compy / raptor / parasaur) chạy tới theo làn
    for (const a of dg.adds || []) {
      if (a.hit.done) continue; // đã lao qua
      const k = 1 - a.z, ab = dinoBox(W, H, a.kind, Math.max(0, a.z * 0.9), 0);
      const s = a.kind === 'compy' ? 0.55 : 0.6;
      const bb = { ...ab, x: W / 2 + a.lane * W * (0.15 + 0.2 * k), w: ab.w * s, h: ab.h * s, y: ab.y + (a.kind === 'compy' ? H * 0.02 : 0) };
      const ph = tSec * 12 + a.lane;
      drawDino(ctx, a.kind, bb, { t: tSec, legL: Math.max(0, Math.sin(ph)), legR: Math.max(0, -Math.sin(ph)), bob: Math.abs(Math.sin(ph)) * 0.03, jaw: 0.3 + 0.6 * k, glow: k > 0.6 ? 1 : 0.3, headS: 1 + 0.5 * Math.max(0, k - 0.7), headY: a.hit.need === 'jump' ? 0.2 * k : 0 });
      if (k > 0.3 && a.hit.need) { ctx.font = `900 ${Math.round(34 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = RESP[a.hit.need].color; ctx.fillText(RESP[a.hit.need].icon, bb.x, bb.y - bb.h * 1.05); }
    }
    if (waterLv) drawWaterFront(this, tSec, env, waterLv);
    // hiệu ứng đòn đặc biệt (gắn với lúc chạm, không phụ thuộc pha logic)
    const ls = d.lastStrike, sT = ls ? dg.clock - ls.at : 99, lt = ls?.hit?.tmpl;
    const pre = cur && d.curTo < 0.25 && d.curTo > -0.05 ? cur : null, preT = pre ? -d.curTo : 99; // sắp chạm
    const fxT = pre && !pre.fake ? preT : sT, fxTm = pre && !pre.fake ? pre.tmpl : lt;
    if (fxTm === 'roar' && fxT > -0.05 && fxT < 0.7) {
      const k = Math.min(1, Math.max(0, fxT) / 0.4);
      for (let i = 0; i < 4; i++) { const rr = (k + i * 0.25) % 1; ctx.strokeStyle = `rgba(200,225,255,${0.6 * (1 - rr)})`; ctx.lineWidth = (6 + 20 * rr) * u; ctx.beginPath(); ctx.arc(B.x, B.y - B.h * 0.85, H * (0.1 + rr * 0.9), 0, Math.PI * 2); ctx.stroke(); }
    }
    if ((fxTm === 'sweepLow' || fxTm === 'sweepHigh') && fxT > -0.25 && fxT < 0.4) { // vật quét ngang: thấp (đuôi/chùy/sóng) hoặc cao (đuôi gai/diềm)
      const k = Math.min(1, (fxT + 0.25) / 0.5), low = fxTm === 'sweepLow', y = low ? H * 0.86 : H * 0.26, x = W * (1.3 - 1.8 * k);
      const colA = env === 'sea' || env === 'river' ? ['#7fb8d8', '#2f6f9a'] : key === 'ankylo' ? ['#9a7a54', '#4a3420'] : ['#6f9a4a', '#2f4a1e'];
      ctx.save(); ctx.translate(x, y);
      const g = ctx.createLinearGradient(0, -H * 0.1, 0, H * 0.1); g.addColorStop(0, colA[0]); g.addColorStop(1, colA[1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-W * 0.05, 0); ctx.quadraticCurveTo(W * 0.3, -H * 0.13, W * 0.9, -H * 0.09); ctx.lineTo(W * 0.9, H * 0.1); ctx.quadraticCurveTo(W * 0.3, H * 0.12, -W * 0.05, 0); ctx.fill();
      if (key === 'ankylo' && low) { ctx.beginPath(); ctx.ellipse(-W * 0.02, 0, W * 0.06, H * 0.08, 0, 0, Math.PI * 2); ctx.fillStyle = '#5a4430'; ctx.fill(); }
      if (key === 'stego' && !low) { ctx.fillStyle = '#efe6cf'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-W * 0.02 + i * W * 0.03, -H * 0.04); ctx.lineTo(-W * 0.05 + i * W * 0.03, -H * 0.16); ctx.lineTo(i * W * 0.03, -H * 0.03); ctx.fill(); } }
      ctx.restore();
    }
    if ((fxTm === 'stomp' || fxTm === 'snapLow') && fxT > -0.02 && fxT < 0.5) { // sóng xung kích dưới đất
      const k = Math.max(0, fxT) / 0.5;
      ctx.strokeStyle = `rgba(255,220,150,${0.8 * (1 - k)})`; ctx.lineWidth = (14 - 10 * k) * u;
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.95, W * (0.1 + 0.6 * k), H * (0.03 + 0.08 * k), 0, 0, Math.PI * 2); ctx.stroke();
    }
    if ((fxTm === 'swipe' || fxTm === 'pounce' || (fxTm === 'bite' && (key === 'raptor' || key === 'compy'))) && fxT > -0.05 && fxT < 0.3) { // vết móng cào
      const k = Math.min(1, Math.max(0, (fxT + 0.05) / 0.25)), dirv = (pre || ls?.hit)?.dir || 0;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineWidth = 9 * u;
      for (let i = 0; i < 3; i++) { const x0 = W * (0.25 + i * 0.08) - dirv * W * 0.1; ctx.beginPath(); ctx.moveTo(x0, H * 0.15); ctx.quadraticCurveTo(x0 + W * 0.12, H * 0.3, x0 + W * 0.3 * k, H * (0.2 + 0.25 * k)); ctx.stroke(); }
      ctx.restore();
    }
    if ((fxTm === 'wave' || fxTm === 'gust') && fxT > -0.05 && fxT < 0.6) { // bức tường nước / luồng gió bụi ập vào
      const k = Math.min(1, Math.max(0, fxT + 0.05) / 0.45);
      ctx.save(); ctx.globalAlpha = 0.6 * (1 - k * 0.6);
      const g = ctx.createLinearGradient(0, H, 0, H * (0.9 - 0.8 * k));
      if (fxTm === 'wave') { g.addColorStop(0, 'rgba(40,110,170,0.95)'); g.addColorStop(1, 'rgba(200,235,255,0.3)'); } else { g.addColorStop(0, 'rgba(200,170,120,0.9)'); g.addColorStop(1, 'rgba(230,210,170,0.1)'); }
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += W / 30) ctx.lineTo(x, H * (0.95 - 0.85 * k) + Math.sin(x * 0.03 + tSec * 9) * H * 0.03); ctx.lineTo(W, H); ctx.fill();
      ctx.restore();
    }
    if (cur?.need === 'hold' && d.curTo < 0) { // khoá sừng: thanh giằng co
      const p = Math.min(1, -d.curTo / Math.max(0.1, cur.hold || 1)), bw = W * 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - bw / 2, H * 0.62, bw, 18 * u);
      ctx.fillStyle = RESP.hold.color; ctx.fillRect(W / 2 - bw / 2, H * 0.62, bw * p, 18 * u);
      ctx.font = `900 ${Math.round(30 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('💪 GIỮ CHẶT 2 TAY!', W / 2, H * 0.6);
      for (let i = 0; i < 3; i++) this.burst(W / 2 + (Math.random() - 0.5) * W * 0.1, H * 0.5, '#fff2a8', 1);
    }
    if (d.phase === 'counter' || d.phase === 'tired') { // choáng / thở dốc: sao quay quanh đầu
      ctx.font = `${Math.round(28 * u)}px system-ui`; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const a = tSec * 4 + i * 2.1; ctx.fillText(d.phase === 'tired' ? '💨' : '💫', B.x + Math.cos(a) * B.w * 0.25, B.y - B.h * 0.98 + Math.sin(a) * B.h * 0.05); }
    }
    if (d.rage === 2) { const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); v.addColorStop(0, 'rgba(255,0,0,0)'); v.addColorStop(1, `rgba(255,30,0,${0.18 + 0.08 * Math.sin(tSec * 6)})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }
    // vật bay
    for (const k of dg.rocks || []) if (!k.smashed && k.z > 0 && k.z <= 1) {
      drawProjectile(ctx, k.kind, k.x, k.y, k.r, tSec);
      if (k.z < 0.75) { ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(tSec * 20)})`; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(k.x, k.y, k.r * 1.35, 0, Math.PI * 2); ctx.stroke(); }
    }
    // điểm yếu
    const w = dg.weakNow();
    if (w) {
      const pulse = 1 + 0.12 * Math.sin(tSec * 10), r = w.r * pulse, fade = Math.min(1, (w.life - w.age) * 3);
      ctx.save(); ctx.globalAlpha = fade;
      const col = w.gold ? '#ffd23f' : '#ff3b6b';
      const g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, r * 1.6); g.addColorStop(0, w.gold ? 'rgba(255,230,120,0.75)' : 'rgba(255,80,120,0.55)'); g.addColorStop(1, 'rgba(255,80,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w.x, w.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(w.x, w.y, r * 0.55, tSec * 3, tSec * 3 + Math.PI * 1.4); ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + tSec; ctx.beginPath(); ctx.moveTo(w.x + Math.cos(a) * r * 0.75, w.y + Math.sin(a) * r * 0.75); ctx.lineTo(w.x + Math.cos(a) * r * 1.25, w.y + Math.sin(a) * r * 1.25); ctx.stroke(); }
      ctx.restore();
      if (w.gold) { ctx.font = `900 ${Math.round(30 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffd23f'; ctx.fillText('×2', w.x, w.y - r * 1.35); }
    }
    // vết cào khi bị trúng đòn
    if (this.claw > 0) {
      this.claw = Math.max(0, this.claw - dt * 0.9);
      ctx.save(); ctx.globalAlpha = Math.min(1, this.claw * 1.5);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9); v.addColorStop(0, 'rgba(160,0,0,0)'); v.addColorStop(1, 'rgba(160,0,0,0.6)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x0 = W * (0.32 + i * 0.12), y0 = H * 0.18, x1 = x0 + W * 0.1, y1 = H * 0.78;
        ctx.strokeStyle = 'rgba(60,0,0,0.8)'; ctx.lineWidth = 22 * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + W * 0.08, H * 0.45, x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,30,30,0.95)'; ctx.lineWidth = 10 * u; ctx.stroke();
      }
      ctx.restore();
    }
    // khung "BẠN" góc trái dưới
    const ph = H * 0.28, pw = ph * 0.72, px = 16 * u, py = H - ph - 16 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,30,0.55)'; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 12 * u) : ctx.rect(px, py, pw, ph); ctx.fill(); ctx.stroke(); ctx.clip();
    const it = view.pip?.it;
    if (it?.canvas) {
      const s = Math.min(pw / it.canvas.width, ph * 0.92 / it.canvas.height), dw = it.canvas.width * s, dh = it.canvas.height * s;
      ctx.translate(px + pw / 2, py + ph - dh - 4 * u); if (this.mirror) ctx.scale(-1, 1);
      ctx.drawImage(it.canvas, -dw / 2, 0, dw, dh);
    } else if (view.pip?.skel) {
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round'; ctx.beginPath();
      for (const [a, b] of SKELETON) { const P = view.pip.skel[a], Q = view.pip.skel[b]; if (P.v < 0.5 || Q.v < 0.5) continue; ctx.moveTo(px + P.x * pw, py + P.y * ph); ctx.lineTo(px + Q.x * pw, py + Q.y * ph); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = `800 ${Math.round(18 * u)}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.fillText('BẠN', px + 8 * u, py + 6 * u);
    if (view.react) { ctx.font = `900 ${Math.round(24 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#7dffb0'; ctx.fillText(view.react, px + pw / 2, py - 32 * u); }
    if (view.lost) { ctx.font = `900 ${Math.round(40 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffd23f'; ctx.fillText('👀 Quay lại khung hình để đấu tiếp', W / 2, H * 0.5); }
    for (const h of view.hands || []) this.blade(h, tSec);
    this.effects(dt);
  }

  /**
   * Cảnh VŨ HỘI CÔNG CHÚA (kiểu Audition): 3 công chúa nhảy mẫu & nhảy theo, người chơi (đã tách nền) đứng giữa sân khấu,
   * dãy ô động tác + thanh "hạt nhịp" ở đáy, chữ chấm điểm to giữa màn hình.
   * view: { t (thời gian bài), person, skel, pose, song, progress, lastJudge {grade, at, chain}, clapAt }
   */
  danceScene(dt, tSec, dg, view) {
    const { ctx, W, H } = this, u = this.u, t = view.t;
    this.scroll = tSec;
    const ch = dg.chart, beat = ch.beat, u0 = dg.turn;
    const songBeat = (t - (ch.turns[0]?.t0 ?? 0)) / beat, beatPh = Math.pow(1 - (((songBeat % 1) + 1) % 1), 3); // lóe ngay đầu phách
    this.clear();
    drawBallroom(this, tSec, beatPh, dg.feverLeft > 0, '#ff7eb6');
    const floorY = H * 0.8, ph = H * 0.5;
    // ---- biên đạo cho công chúa ----
    const bi = u0 ? (t - u0.t0) / u0.beat : -1;
    const PR = view.practice;
    const pick = (lagBeats) => {
      if (PR) { // màn tập: các nàng làm mẫu đúng động tác đang tập; bước vỗ tay thì vỗ theo phách
        if (PR.done) return { pose: 'UP', twirl: Math.min(1, (performance.now() - PR.done.at) / 900), mood: 'wow' };
        if (PR.pr.step !== 'CLAP') return { pose: PR.pr.step, twirl: 0, mood: 'happy' };
        const f = ((((PR.mt - lagBeats * beat - (PR.pr.offset || 0)) / beat) % 1) + 1) % 1;
        return { pose: f < 0.3 || f > 0.85 ? 'CLAP' : 'UP', twirl: 0, mood: 'happy' };
      }
      if (!u0 || bi < 0) return { pose: 'rest', twirl: 0, mood: 'happy' };
      const b = bi - lagBeats;
      if (u0.kind === 'break') { const k = Math.floor(b); const seqB = ['L', 'R', 'UL', 'UR', 'UP', 'WAVE', 'CLAP', 'UP']; return { pose: seqB[((k % 8) + 8) % 8], twirl: k % 4 === 3 ? (b % 1) : 0, mood: 'happy' }; }
      const demoBeats = 4, n = u0.n;
      if (b < demoBeats) { const k = Math.floor(b * Math.max(n, 4) / demoBeats) - (n < 4 ? 0 : 0); const kk = n <= 4 ? Math.floor(b) : Math.floor(b * n / demoBeats); void k; return { pose: kk < n ? u0.seq[kk] : 'rest', twirl: 0, mood: 'happy' }; }
      if (u0.judged) { const g = u0.grade; if (dg.chart.kid) return { pose: 'UP', twirl: g === 'MISS' ? 0 : Math.min(1, (t - u0.finishAt) / (beat * 0.9)), mood: 'happy' }; return { pose: g === 'MISS' || g === 'BAD' ? 'rest' : 'UP', twirl: g === 'PERFECT' || g === 'GREAT' ? Math.min(1, (t - (u0.finishAt)) / (beat * 0.9)) : 0, mood: g === 'MISS' || g === 'BAD' ? 'sad' : 'wow' }; }
      if (b >= u0.beats - 1.35) return { pose: 'CLAP', twirl: 0, mood: 'wow' };
      if (u0.idx > 0) return { pose: u0.seq[u0.idx - 1], twirl: 0, mood: 'happy' };          // nhảy theo bước bạn vừa làm
      return { pose: Math.floor(b) % 2 ? 'WAVE' : 'rest', twirl: 0, mood: 'happy' };
    };
    this._pr ||= PRINCESSES.map(() => ({ ...ARM_POSES.rest, squat: 0 }));
    const spots = [{ x: W * 0.5, y: floorY - H * 0.07, h: ph * 0.78, lag: 0.08 }, { x: W * 0.17, y: floorY, h: ph, lag: 0 }, { x: W * 0.83, y: floorY, h: ph, lag: 0.04 }];
    const p3 = this.p3d?.ready ? this.p3d : null, A3 = [];
    const drawOne = (i) => {
      const S = PRINCESSES[i], st = this._pr[i], sp = spots[i], P = pick(sp.lag), tgt = ARM_POSES[P.pose] || ARM_POSES.rest;
      const k = Math.min(1, dt * 14);
      for (const key of ['a1', 'a2', 'e1', 'e2']) st[key] += (tgt[key] - st[key]) * k;
      st.squat += ((tgt.squat || 0) - st.squat) * k;
      const groove = Math.abs(Math.sin(Math.PI * (((songBeat - sp.lag) % 1) + 1)));
      const spinF = P.pose === 'SPIN' ? ((((songBeat - sp.lag) % 1) + 1) % 1) : 0; // làm mẫu xoay: mỗi phách 1 vòng
      const A = { ...st, t: tSec + i, bob: 0.025 * groove, sway: Math.sin((songBeat - sp.lag) * Math.PI) * 0.05, flare: 0.15 * groove, twirl: P.twirl || spinF, mood: P.mood, blink: Math.sin(tSec * 1.3 + i * 2) > 0.985 };
      if (p3) { // công chúa 3D (mẫu VRM CC0): bóng dưới chân vẽ 2D, thân vẽ 3D
        A3[i] = A; p3.pose(i, A, dt);
        ctx.fillStyle = 'rgba(20,0,40,0.35)'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, sp.h * 0.3, sp.h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
        return;
      }
      drawPrincess(ctx, sp.x, sp.y, sp.h, S, A);
    };
    const q3 = this.p3dQ || 0.75, t3 = performance.now();
    drawOne(0); if (p3) p3.draw(ctx, [0], spots, W, H, q3); // công chúa sau (giữa)
    // ---- người chơi ở giữa sân khấu ----
    if (view.person?.it) this.drawPersonAt(view.person.it, view.person.anchorF, view.person.anchorD, view.person.s, this.mirror);
    else if (view.skel) this.skeleton(view.skel, null, null, tSec, 0.9);
    if (view.pose && POSES[view.pose]) drawPoseIcon(ctx, W * 0.5 + ph * 0.24, floorY - ph * 0.95, 20 * u, POSES[view.pose], 'done', tSec);
    drawOne(1); drawOne(2);
    if (p3) {
      p3.draw(ctx, [1, 2], spots, W, H, q3);
      // máy chậm: tự hạ độ nét 3D; vẫn chậm thì quay về hình vẽ 2D (không để game giật làm lệch nhịp)
      const ms = performance.now() - t3; this._p3ms = this._p3ms == null ? ms : this._p3ms * 0.95 + ms * 0.05; this._p3n = (this._p3n || 0) + 1;
      if (this._p3n > 90 && this._p3ms > 18) { this._p3n = 0; this._p3ms = null; if (q3 > 0.5) this.p3dQ = 0.5; else { this.p3d.ready = false; console.warn('Công chúa 3D chạy chậm trên máy này → dùng hình 2D'); } }
    }
    // vệt sáng khi vỗ tay
    if (view.clapAt != null && tSec - view.clapAt < 0.35) { const k = (tSec - view.clapAt) / 0.35; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 6 * u; ctx.beginPath(); ctx.arc(W / 2, floorY - ph * 0.75, (30 + 160 * k) * u, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    // ---- bảng động tác + thanh hạt nhịp (đáy màn hình) ----
    const py = H * 0.82, pH = H * 0.17;
    ctx.fillStyle = 'rgba(12,6,28,0.72)'; ctx.fillRect(0, py, W, pH);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, py, W, 2);
    if (PR) this._practicePanel(PR, py, pH, tSec);
    else if (u0 && u0.kind !== 'break' && bi >= 0) {
      const n = u0.n, r = Math.min(30 * u, (W * 0.7) / Math.max(1, n) / 2.4), gap = r * 2.5, x0 = W / 2 - (n - 1) * gap / 2, iy = py + pH * 0.33;
      const KID = !!dg.chart.kid;
      for (let i = 0; i < n; i++) {
        if (KID) this._kidIcon(x0 + i * gap, iy, r, u0.seq[i], u0.done[i] ? 'done' : i === u0.idx ? 'now' : 'todo', tSec);
        else drawPoseIcon(ctx, x0 + i * gap, iy, r, POSES[u0.seq[i]], u0.done[i] ? 'done' : i === u0.idx ? 'now' : 'todo', tSec);
      }
      // thanh hạt nhịp: hạt chạy qua các phách; vạch vỗ tay ở phách cuối
      const bw = W * 0.62, bx = W / 2 - bw / 2, by = py + pH * 0.76;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by - 3 * u, bw, 6 * u);
      for (let k = 0; k < u0.beats; k++) { const x = bx + bw * k / (u0.beats - 1); ctx.fillStyle = k === u0.beats - 1 ? '#ffd84a' : 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x, by, (k === u0.beats - 1 ? 13 : 4) * u, 0, Math.PI * 2); ctx.fill(); }
      const prog = Math.min(1, Math.max(0, bi / (u0.beats - 1))), hx = bx + bw * prog;
      const ready = u0.idx >= n;
      const gB = ctx.createRadialGradient(hx, by, 0, hx, by, 18 * u); gB.addColorStop(0, '#fff'); gB.addColorStop(1, ready ? '#ffd84a' : '#ff7eb6');
      ctx.fillStyle = gB; ctx.beginPath(); ctx.arc(hx, by, 11 * u, 0, Math.PI * 2); ctx.fill();
      { // lời nhắc: đặt phía trên bảng, giữa màn hình (không bị cắt)
        const msg = KID ? (ready ? '👏 Vỗ tay khi nghe tiếng "bốp"!' : `Làm theo các công chúa: ${u0.seq.map(p => KID_POSES[p].emoji + ' ' + KID_POSES[p].label).join('  rồi  ')}`) : ready ? '👏 VỖ TAY khi hạt chạy tới vạch vàng!' : `Làm lần lượt ${n} động tác theo thứ tự`;
        ctx.font = `800 ${Math.round(22 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const mw = ctx.measureText(msg).width + 28 * u;
        ctx.fillStyle = ready ? 'rgba(80,50,0,0.75)' : 'rgba(12,6,28,0.7)'; ctx.fillRect(W / 2 - mw / 2, py - 40 * u, mw, 34 * u);
        ctx.fillStyle = ready ? '#ffd84a' : '#f2e8ff'; ctx.fillText(msg, W / 2, py - 23 * u);
      }
      ctx.textAlign = 'left'; ctx.fillStyle = '#d6c8ff'; ctx.fillText(KID ? (u0.kind === 'finish' ? '🎆 Cuối rồi!' : '') : u0.kind === 'finish' ? '✨ FINISH MOVE ×3' : `Lv ${u0.lvl}`, bx + bw + 20 * u, by);
    } else if (u0?.kind === 'break') {
      ctx.font = `800 ${Math.round(26 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffc2dc';
      ctx.fillText('✨ Các nàng công chúa solo — nghỉ chút, nhún theo nhạc nhé!', W / 2, py + pH / 2);
    } else {
      ctx.font = `800 ${Math.round(26 * u)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffc2dc';
      ctx.fillText('🎵 Chuẩn bị… dãy động tác sắp hiện ra', W / 2, py + pH / 2);
    }
    // ---- chữ chấm điểm ----
    const J = view.lastJudge;
    if (J && tSec - J.at < 1.1) {
      const k = (tSec - J.at) / 1.1, sc = k < 0.12 ? 0.6 + 3.3 * k : 1 - 0.1 * k;
      ctx.save(); ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1; ctx.translate(W / 2, H * 0.3); ctx.scale(sc, sc);
      const KJ = !!dg.chart.kid, label = KJ ? KID_GRADE[J.grade] : J.grade;
      const fs = Math.round((KJ ? 80 : 96) * u); ctx.font = `900 italic ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let fill = { GREAT: '#7dffb0', COOL: '#6fc8ff', BAD: '#ffb347', MISS: KJ ? '#ffb3d9' : '#9aa4b8' }[J.grade];
      if (J.grade === 'PERFECT') { const g = ctx.createLinearGradient(-fs * 2.5, 0, fs * 2.5, 0); ['#ff5ea8', '#ffd84a', '#7dffb0', '#6fc8ff', '#c77dff'].forEach((col, i) => g.addColorStop(((i / 4) + tSec * 0.8) % 1, col)); fill = g; }
      ctx.lineWidth = 10 * u; ctx.strokeStyle = 'rgba(30,10,50,0.85)'; ctx.strokeText(label, 0, 0); ctx.fillStyle = fill; ctx.fillText(label, 0, 0);
      if (!KJ && J.chain > 1 && J.grade === 'PERFECT') { ctx.font = `900 ${Math.round(44 * u)}px system-ui, sans-serif`; ctx.strokeText(`x${J.chain}`, fs * 2.1, fs * 0.1); ctx.fillStyle = '#ffd84a'; ctx.fillText(`x${J.chain}`, fs * 2.1, fs * 0.1); }
      if (J.incomplete && !KJ) { ctx.font = `800 ${Math.round(24 * u)}px system-ui, sans-serif`; ctx.fillStyle = '#ffb347'; ctx.fillText('Chưa làm đủ động tác!', 0, fs * 0.75); }
      ctx.restore();
    }
    this.effects(dt);
  }

  /** Ô động tác cho bé: mũi tên to (⬆ ↔ ⬇), nhấp nháy ô đang cần làm. */
  _kidIcon(x, y, r, P, state, tSec, small = false) {
    const rr = small ? r : r * 1.3, pulse = state === 'now' ? 1 + 0.08 * Math.sin(tSec * 8) : 1;
    drawPoseIcon(this.ctx, x, y, rr * pulse, POSES[P], state, tSec);
  }

  /** Bảng dưới của màn TẬP: 7 bước, động tác đang tập + vòng giữ, gợi ý, game đang thấy gì; bước vỗ tay có thanh phách. */
  _practicePanel(PR, py, pH, tSec) {
    const { ctx, W, H } = this, u = this.u, pr = PR.pr, steps = pr.steps, NS = steps.length, KIDP = !!PR.kid;
    const font = (w, px) => `${w} ${Math.round(px * u)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // tiêu đề + hướng dẫn chính (trên bảng)
    const title = PR.done ? PR.done.text : (KIDP ? `Bước ${Math.min(NS, pr.i + 1)}/${NS} — ${PR.tip[0]}` : `🎓 Bước ${Math.min(NS, pr.i + 1)}/${NS} — ${PR.tip[0]}`);
    ctx.font = font(800, 26); const mw = Math.min(W - 20 * u, ctx.measureText(title).width + 32 * u);
    ctx.fillStyle = 'rgba(12,6,28,0.78)'; ctx.fillRect(W / 2 - mw / 2, H * 0.16, mw, 44 * u);
    ctx.fillStyle = PR.done ? '#7dffb0' : '#fff'; ctx.fillText(title, W / 2, H * 0.16 + 22 * u, W - 30 * u);
    if (!PR.done && (pr.hint || pr.step === 'CLAP')) { ctx.font = font(700, 19); const hm = '💡 ' + PR.tip[1], hw = Math.min(W - 20 * u, ctx.measureText(hm).width + 26 * u); ctx.fillStyle = 'rgba(60,36,0,0.8)'; ctx.fillRect(W / 2 - hw / 2, H * 0.16 + 48 * u, hw, 30 * u); ctx.fillStyle = '#ffd84a'; ctx.fillText(hm, W / 2, H * 0.16 + 63 * u, W - 30 * u); }
    // 7 bước
    const r = 17 * u, gap = r * 2.7;
    for (let k = 0; k < NS; k++) {
      const x = W / 2 - (NS - 1) / 2 * gap + k * gap, y = py + pH * 0.3, st = steps[k];
      const state = pr.res[k] === true ? 'done' : k === pr.i && !PR.done ? 'now' : 'todo';
      if (st === 'CLAP') { ctx.fillStyle = state === 'done' ? '#7dffb0' : state === 'now' ? '#ffd84a' : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.font = font(700, 18); ctx.fillStyle = '#000'; ctx.fillText('👏', x, y + 1); }
      else if (KIDP) this._kidIcon(x, y, r, st, state, tSec, true);
      else drawPoseIcon(ctx, x, y, r, POSES[st], state, tSec);
      if (pr.res[k] === false && !KIDP) { ctx.font = font(900, 16); ctx.fillStyle = '#ff6b6b'; ctx.fillText('✗', x + r, y - r); }
      if (k === pr.i && st !== 'CLAP' && pr.progress > 0) { ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 5 * u; ctx.beginPath(); ctx.arc(x, y, r + 6 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr.progress); ctx.stroke(); }
    }
    // dòng dưới: game đang thấy gì / thanh phách vỗ tay
    const by = py + pH * 0.76;
    if (pr.step === 'CLAP' && !PR.done) {
      const T = pr.clapTargets(), bw = W * 0.62, bx = W / 2 - bw / 2, n = pr.c.clapCountIn + pr.c.clapN;
      if (T.length) {
        const t0 = T[0] - pr.c.clapCountIn * pr.beat, prog = (PR.mt - t0) / (pr.beat * (n - 1));
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by - 3 * u, bw, 6 * u);
        for (let k = 0; k < n; k++) { const x = bx + bw * k / (n - 1), tgt = k >= pr.c.clapCountIn; ctx.fillStyle = tgt ? '#ffd84a' : 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(x, by, (tgt ? 9 : 5) * u, 0, Math.PI * 2); ctx.fill(); if (!tgt) { ctx.font = font(800, 14); ctx.fillStyle = '#fff'; ctx.fillText(String(k + 1), x, by - 18 * u); } }
        const hx = bx + bw * Math.max(0, Math.min(1, prog)); ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.arc(hx, by, 11 * u, 0, Math.PI * 2); ctx.fill();
      }
      const L = PR.lastClap; if (L && tSec - L.at < 1) { const ms = Math.round(L.d * 1000); ctx.font = font(800, 18); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(Math.abs(ms) < 40 ? 'Chuẩn nhịp!' : ms < 0 ? `sớm ${-ms} ms` : `trễ ${ms} ms`, bx + bw + 16 * u, by); ctx.textAlign = 'center'; }
    } else if (!PR.done) {
      const seen = PR.seen ? POSES[PR.seen] : null;
      ctx.font = font(700, 18); ctx.fillStyle = '#d6c8ff';
      let msg = seen ? `Game đang thấy: ${seen.icon} ${seen.name}` : 'Game đang thấy: tay buông / chưa rõ động tác';
      if (PR.dbg && pr.hint) msg += PR.dbg.why ? ' · không thấy rõ 2 vai — đứng lùi ra' : ` · góc tay trái ${PR.dbg.aL ?? '–'}° / phải ${PR.dbg.aR ?? '–'}°`;
      ctx.fillText(msg, W / 2, by, W - 30 * u);
    }
  }

  /** Vẽ người đã cắt nền với điểm neo tuỳ ý: điểm (fx,fy) của khung nhận diện → đặt tại (x,y) màn hình, thu nhỏ s. */
  drawPersonAt(it, af, ad, s, mirror) {
    if (!it?.canvas) return;
    const { ctx } = this;
    ctx.save(); ctx.translate(ad.x, ad.y); if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(it.canvas, (it.bx - af.x) * s, (it.by - af.y) * s, it.canvas.width * s, it.canvas.height * s);
    ctx.restore();
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
    if (ui.fruit) {
      const F = ui.fruit, k = Math.max(0, Math.min(1, F.time / F.duration));
      if (F.duo) { // 2 người: điểm P1 bên trái, P2 bên phải, đồng hồ ở giữa
        F.duo.forEach((P, i) => {
          const x = i ? W - 28 * u : 28 * u, al = i ? 'right' : 'left';
          text(`P${i + 1}`, x, 30 * u, 26, P.color, al, 800);
          text(String(P.score), x, 78 * u, 64, P.stunned ? '#8a8a99' : P.color, al);
          if (P.stunned) text('💫 choáng', x, 124 * u, 22, '#ff5a3c', al, 700);
        });
        const lead = F.duo[0].score === F.duo[1].score ? null : F.duo[0].score > F.duo[1].score ? 0 : 1;
        text(lead == null ? 'Ngang điểm' : `P${lead + 1} dẫn trước`, W / 2, 40 * u, 26, lead == null ? '#d6e4ff' : F.duo[lead].color, 'center', 800);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(W * 0.3, 66 * u, W * 0.4, 10 * u);
        ctx.fillStyle = F.time < 10 ? '#ff5a3c' : '#7dffb0'; ctx.fillRect(W * 0.3, 66 * u, W * 0.4 * k, 10 * u);
        text(`${Math.ceil(F.time)} s · bom −5 điểm 💣`, W / 2, 96 * u, 22, F.time < 10 ? '#ff5a3c' : '#d6e4ff', 'center', 700);
      } else {
      text(String(F.score), W / 2, 50 * u, 66);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(W * 0.3, 96 * u, W * 0.4, 10 * u);
      ctx.fillStyle = F.time < 10 ? '#ff5a3c' : '#7dffb0'; ctx.fillRect(W * 0.3, 96 * u, W * 0.4 * k, 10 * u);
      text(`${Math.ceil(F.time)} s`, W / 2, 124 * u, 24, F.time < 10 ? '#ff5a3c' : '#d6e4ff', 'center', 700);
      text('♥'.repeat(Math.max(0, F.lives)) + '♡'.repeat(Math.max(0, F.maxLives - F.lives)), 28 * u, 46 * u, 44, '#ff4d6d', 'left');
      text('Né bom 💣', 28 * u, 92 * u, 20, '#d6e4ff', 'left', 600);
      if (F.best != null) text(`Kỷ lục: ${F.best}`, W - 24 * u, 92 * u, 22, '#d6e4ff', 'right', 600);
      }
    }
    if (ui.dino) {
      const D = ui.dino, bw = Math.min(W * 0.5, 620 * u), bx = (W - bw) / 2;
      text(`${D.boss ? '👑 ' : ''}${D.name}${D.rage === 2 ? ' 😡😡' : D.rage ? ' 😡' : ''}`, W / 2, 30 * u, 30, D.rage === 2 ? '#ff5a3c' : D.boss ? '#ffd23f' : '#fff');
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx - 3 * u, 54 * u, bw + 6 * u, 22 * u);
      ctx.fillStyle = D.hp / D.maxHp <= 0.25 ? '#ff3b3b' : D.hp / D.maxHp <= 0.5 ? '#ff7b2c' : '#ffb347'; ctx.fillRect(bx, 57 * u, bw * Math.max(0, D.hp / D.maxHp), 16 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; for (const f of [0.25, 0.5]) ctx.fillRect(bx + bw * f - 1, 54 * u, 2, 22 * u); // mốc nổi giận
      text(`${D.stage} · Con ${D.inStage}/${D.stageLen} · Vòng ${D.level}${D.parts ? ' · ' + D.parts : ''}`, W / 2, 98 * u, 20, '#d6e4ff', 'center', 700);
      text('♥'.repeat(Math.max(0, D.lives)) + '♡'.repeat(Math.max(0, D.maxLives - D.lives)), 24 * u, 40 * u, 40, '#ff4d6d', 'left');
      const rx = W - (D.padRight ? 86 : 24) * u; // chừa chỗ nút tạm dừng trên điện thoại
      text(String(D.score), rx, 44 * u, 52, '#fff', 'right');
      if (D.mult > 1) text(`×${D.mult} chuỗi ${D.combo}`, rx, 90 * u, 22, '#7dffb0', 'right', 800);
      else if (D.best != null) text(`Kỷ lục: ${D.best}`, rx, 90 * u, 20, '#d6e4ff', 'right', 600);
    }
    if (ui.dance) {
      const D = ui.dance;
      text(D.song, 24 * u, 30 * u, 24, '#fff', 'left', 800);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(24 * u, 50 * u, W * 0.3, 8 * u);
      ctx.fillStyle = '#ff7eb6'; ctx.fillRect(24 * u, 50 * u, W * 0.3 * Math.max(0, Math.min(1, D.progress)), 8 * u);
      text(`${Math.round(D.bpm)} BPM · ${D.diff}`, 24 * u, 76 * u, 18, '#d6c8ff', 'left', 700);
      const rx = W - (D.padRight ? 86 : 24) * u;
      text(String(D.score), rx, 40 * u, 46, '#fff', 'right');
      text(D.combo > 1 ? `COMBO ${D.combo}` : ' ', rx, 82 * u, 22, '#7dffb0', 'right', 900);
      // thanh FEVER
      const fw = W * 0.22, fx = rx - fw, fyy = 100 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(fx, fyy, fw, 10 * u);
      if (D.feverOn) { const g = ctx.createLinearGradient(fx, 0, fx + fw, 0); ['#ff5ea8', '#ffd84a', '#7dffb0', '#6fc8ff'].forEach((c2, i) => g.addColorStop(((i / 3) + tMs / 900) % 1, c2)); ctx.fillStyle = g; ctx.fillRect(fx, fyy, fw, 10 * u); text('FEVER ×2 🔥', rx, 128 * u, 22, '#ffd84a', 'right', 900); }
      else { ctx.fillStyle = '#ffb347'; ctx.fillRect(fx, fyy, fw * D.fever / 100, 10 * u); text('FEVER', fx - 8 * u, 105 * u, 14, '#ffb347', 'right', 800); }
    }
    if (ui.fact && tMs >= ui.fact.at && tMs - ui.fact.at < 5500) { // "Bạn có biết?" — nhãn khoa học ngay trong game
      const k = Math.min(1, (tMs - ui.fact.at) / 300, (5500 - (tMs - ui.fact.at)) / 400);
      const x0 = W * 0.22, bw = W * 0.74, fs = Math.round(18 * u);
      ctx.save(); ctx.globalAlpha = Math.max(0, k);
      ctx.font = `600 ${fs}px system-ui, sans-serif`;
      const words = ui.fact.text.split(' '), lines = []; let line = '';
      for (const w of words) { const t2 = line ? line + ' ' + w : w; if (ctx.measureText(t2).width > bw - 24 * u) { lines.push(line); line = w; } else line = t2; }
      lines.push(line);
      const bh = lines.length * fs * 1.3 + 16 * u, y0 = H - bh - 14 * u;
      ctx.fillStyle = 'rgba(10,12,30,0.72)'; ctx.fillRect(x0, y0, bw, bh);
      ctx.fillStyle = '#f2f6ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, x0 + 12 * u, y0 + 8 * u + i * fs * 1.3));
      ctx.restore();
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
    const C = cue.color ? [cue.color, cue.arrow ? (cue.dir < 0 ? '⬅' : '➡') : cue.icon, cue.say] // Đấu khủng long: màu + icon + chữ theo phản ứng
      : { jump: ['#00e5ff', '⬆', 'NHẢY'], duck: ['#c77dff', '⬇', 'NGỒI'], move: ['#ffd23f', cue.dir < 0 ? '⬅' : '➡', 'NÉ'], hands: ['#fff27a', '🙌', 'GIƠ TAY'], smash: ['#ffb347', '👊', 'ĐẬP ĐÁ'] }[cue.action];
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
    if (cue.label) text(cue.label, W / 2, H * 0.64, size * 0.36 * Math.min(1, 16 / cue.label.length + 0.35), '#ff5a3c'); // tên đòn khủng long sắp tung ra (dưới chữ hướng dẫn)
    if (cue.action === 'move' || cue.arrow) text(`${cue.dir < 0 ? C[1] + ' ' : ''}${cue.say || C[2]}${cue.dir > 0 ? ' ' + C[1] : ''}`, W / 2, y, size * 0.8, C[0]);
    else { text(C[1], W / 2, y, size, C[0]); text(cue.say || C[2], W / 2, y + size * u * 0.85, size * 0.42, C[0]); }
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
