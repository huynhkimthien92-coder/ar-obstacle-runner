// Vẽ Canvas 2D phủ lên camera feed. Không dùng WebXR vì: (1) iOS Safari không có WebXR immersive-ar,
// (2) phiên WebXR AR dùng camera SAU — người chơi không thấy chính mình. Canvas 2D chạy mọi nơi.
import { CONFIG } from './config.js';
import { T } from './levels.js';
import { SKELETON } from './pose.js';

const R = CONFIG.RENDER;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.particles = []; this.popups = []; this.flash = 0; this.flashColor = '255,40,40'; this.shake = 0;
    this.fixed = null;   // {w,h}: khung cố định 16:9 khi phát sang TV qua Wi-Fi
    this.video = null;   // khi khác null: vẽ luôn hình camera vào canvas (để stream được cả người lẫn game)
    this.mirror = true; this.tvHud = false;
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
    this.hz = this.H * R.horizon;
    this.u = Math.max(1, Math.min(this.W, this.H) / 500); // hệ số cỡ chữ/nét: to hơn trên TV
  }

  // ---- phép chiếu phối cảnh: z (mét phía trước) → hệ số s, toạ độ màn hình ----
  s(z) { return R.focal / (R.focal + Math.max(z, -R.focal * 0.8)); }
  gy(s) { return this.hz + (this.H - this.hz) * s; }
  lx(lane, s) { return this.W / 2 + (lane - 1) * (this.W / 3) * s; }
  ppm(s) { return this.H * R.ppmAtPlayer * s; }

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
    if (!this.fixed || !this.opaque) return;
    // chế độ stream: canvas phải tự có nền (camera hoặc nền tối), vì TV chỉ nhận đúng canvas này
    const v = this.video;
    if (v && v.readyState >= 2 && v.videoWidth) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const s = (this.fit === 'contain' ? Math.min : Math.max)(W / v.videoWidth, H / v.videoHeight), dw = v.videoWidth * s, dh = v.videoHeight * s;
      ctx.save();
      if (this.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(W / 2, H * 0.3, 10, W / 2, H * 0.3, W * 0.7);
      g.addColorStop(0, '#1b2366'); g.addColorStop(1, '#0a0e28');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }

  /** Chữ & HUD vẽ thẳng lên canvas — để TV (qua stream) thấy đủ, và đọc được từ 3 m. */
  overlay(ui, tMs) {
    const { ctx, W, H } = this;
    const u = Math.min(W, H) / 720;
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
    if (ui.hint) text(ui.hint, W / 2, H * 0.25, 54);
    if (ui.big && tMs - ui.big.at < 950) {
      const k = (tMs - ui.big.at) / 950;
      ctx.globalAlpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85);
      text(ui.big.text, W / 2, H / 2, 230 * (1.35 - 0.45 * k), '#fff');
      ctx.globalAlpha = 1;
    }
    if (ui.panel) {
      const p = ui.panel, lines = p.lines || [];
      const bw = Math.min(W * 0.86, 980 * u), bh = (96 + lines.length * 46 + (p.progress != null ? 40 : 0)) * u;
      const bx = (W - bw) / 2, by = p.top ? (ui.hud ? 130 : 24) * u : (H - bh) / 2;
      ctx.fillStyle = 'rgba(5,8,30,0.74)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 22 * u) : ctx.rect(bx, by, bw, bh); ctx.fill();
      text(p.title, W / 2, by + 50 * u, 46, p.color || '#fff');
      lines.forEach((l, i) => text(l, W / 2, by + (104 + i * 46) * u, 28, '#dfe6ff', 'center', 600));
      if (p.progress != null) {
        const pw = bw * 0.6, px = (W - pw) / 2, py = by + bh - 34 * u;
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px, py, pw, 12 * u);
        ctx.fillStyle = '#7dffb0'; ctx.fillRect(px, py, pw * Math.min(1, p.progress), 12 * u);
      }
    }
    if (ui.corner) text(ui.corner, W - 18 * u, H - 22 * u, 20, ui.cornerColor || '#9fffcf', 'right', 600);
    ctx.restore();
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
    this.clear();
    ctx.save();
    if (this.shake > 0.5) { ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake); this.shake *= 0.85; }
    this.track(game.traveled, player?.lane ?? 1, view.dim);
    const obs = game.obstacles.filter(o => o.z > -3 && o.z < CONFIG.GAME.viewDist).sort((a, b) => b.z - a.z);
    const behind = [], front = [];
    for (const o of obs) (o.z > 1.2 ? behind : front).push(o);
    for (const o of behind) this.obstacle(o, tSec);
    if (view.skeleton && view.pts) this.skeleton(view.pts, player, game, tSec);
    else if (view.avatar) this.avatar(player, tSec, game);
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

  skeleton(pts, p, game, t) {
    const { ctx } = this;
    const blink = game && t * 1000 < game.invulnUntil / 1 && Math.floor(t * 12) % 2 === 0;
    const color = p?.airborne ? '#00e5ff' : p?.ducking ? '#c77dff' : '#7dffb0';
    ctx.globalAlpha = blink ? 0.3 : 0.95;
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
