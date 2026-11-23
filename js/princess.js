// 3 nàng công chúa (nhân vật TỰ THIẾT KẾ, không dựa trên nhân vật có bản quyền) + phòng khiêu vũ lâu đài, vẽ bằng Canvas 2D.
// Thân người có khớp: 2 tay (vai + khuỷu), thân nhún, váy xoè khi xoay, tóc đung đưa.

export const PRINCESSES = [
  { id: 'rose', name: 'Hồng Ngọc', dress: '#ff7eb6', dress2: '#ffc2dc', trim: '#ffd84a', hair: '#7a3e22', hairStyle: 'bun', skin: '#ffe0cc', crown: '#ffd84a', gem: '#ff2e7e' },
  { id: 'jade', name: 'Bích Ngọc', dress: '#2fbfa2', dress2: '#a8f0dc', trim: '#e8f4ff', hair: '#1c1420', hairStyle: 'long', skin: '#f3d2b4', crown: '#dfe8f0', gem: '#2bd47a' },
  { id: 'sun', name: 'Kim Hoa', dress: '#ffb52e', dress2: '#ffe7a3', trim: '#ff7a2e', hair: '#d4502a', hairStyle: 'curly', skin: '#b97a52', crown: '#ffcf33', gem: '#ff5a2a' },
];
/** Góc tay mục tiêu cho từng động tác: a = góc tay mở ra khỏi thân (0 = buông thẳng, π/2 = dang ngang, π = giơ thẳng); e = gập khuỷu. */
export const ARM_POSES = {
  rest: { a1: 0.28, a2: 0.28, e1: 0.25, e2: 0.25 },
  L: { a1: 1.57, a2: 0.35, e1: 0.05, e2: 0.4 }, R: { a1: 0.35, a2: 1.57, e1: 0.4, e2: 0.05 },
  UL: { a1: 2.45, a2: 0.35, e1: 0.05, e2: 0.4 }, UR: { a1: 0.35, a2: 2.45, e1: 0.4, e2: 0.05 },
  UP: { a1: 2.75, a2: 2.75, e1: 0.05, e2: 0.05 }, T: { a1: 1.57, a2: 1.57, e1: 0.05, e2: 0.05 }, DN: { a1: 0.9, a2: 0.9, e1: 1.3, e2: 1.3, squat: 1 },
  CLAP: { a1: 2.75, a2: 2.75, e1: 0.75, e2: 0.75 }, WAVE: { a1: 2.3, a2: 0.4, e1: -0.6, e2: 0.4 },
};

const TAU = Math.PI * 2;
const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); };
function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

/**
 * Vẽ công chúa: chân tại (x, y), cao h.
 * A: { a1, a2, e1, e2 (tay bên trái / phải MÀN HÌNH), bob, sway, squat 0..1, flare 0..1, twirl 0..1, headTilt, blink, mood, t }
 */
export function drawPrincess(c, x, y, h, S, A) {
  const t = A.t || 0, sq = A.squat || 0, bob = (A.bob || 0) * h, tw = A.twirl || 0;
  const spin = Math.cos(tw * TAU), sx = tw ? 0.55 + 0.45 * Math.abs(spin) : 1; // xoay vòng: thân hẹp lại
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, 0, 0, h * 0.3, h * 0.05); c.fill();
  c.translate(0, -bob + sq * h * 0.12); c.rotate(A.sway || 0); c.scale(sx * (tw && spin < 0 ? -1 : 1), 1);
  const skirtTop = -h * 0.58, flare = (A.flare || 0) + tw * 0.6 + sq * 0.2;
  // giày
  c.fillStyle = shade(S.dress, -0.35); ell(c, -h * 0.07, -h * 0.015, h * 0.05, h * 0.022); c.fill(); ell(c, h * 0.07, -h * 0.015, h * 0.05, h * 0.022); c.fill();
  // tóc sau (dài / xoăn) — vẽ trước thân
  const hy = -h * 0.84, hr = h * 0.115, hairSw = Math.sin(t * 3) * h * 0.01 + (A.sway || 0) * h * 0.2;
  c.fillStyle = S.hair;
  if (S.hairStyle === 'long') { c.beginPath(); c.moveTo(-hr * 1.05, hy); c.quadraticCurveTo(-hr * 1.3 + hairSw, hy + hr * 2.6, -hr * 0.7 + hairSw, hy + hr * 3.2); c.lineTo(hr * 0.7 + hairSw, hy + hr * 3.2); c.quadraticCurveTo(hr * 1.3 + hairSw, hy + hr * 2.6, hr * 1.05, hy); c.fill(); }
  if (S.hairStyle === 'curly') for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + i / 8 * 0.7); ell(c, Math.cos(a) * hr * 1.15 + hairSw * 0.5, hy + Math.sin(a) * hr * 1.25, hr * 0.38, hr * 0.38); c.fill(); }
  // váy xoè nhiều tầng
  const bw = h * (0.3 + 0.08 * flare);
  for (let layer = 0; layer < 3; layer++) {
    const k = 1 - layer * 0.18, top = skirtTop + layer * h * 0.04, bot = -h * (0.02 + layer * 0.03);
    const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, layer % 2 ? S.dress2 : S.dress); g.addColorStop(1, shade(layer % 2 ? S.dress2 : S.dress, -0.2));
    c.beginPath(); c.moveTo(-h * 0.07, top);
    c.quadraticCurveTo(-bw * k * 0.9, (top + bot) / 2, -bw * k, bot);
    for (let i = 0; i <= 8; i++) { const xx = -bw * k + (2 * bw * k) * i / 8; c.quadraticCurveTo(xx - bw * k / 8, bot + h * 0.025 * (i % 2 ? 1 : -0.2), xx, bot); } // viền lượn sóng
    c.quadraticCurveTo(bw * k * 0.9, (top + bot) / 2, h * 0.07, top); c.closePath(); c.fillStyle = g; c.fill();
  }
  c.strokeStyle = S.trim; c.lineWidth = h * 0.008; c.beginPath(); c.moveTo(-bw * 0.98, -h * 0.025); c.quadraticCurveTo(0, h * 0.005, bw * 0.98, -h * 0.025); c.stroke();
  c.fillStyle = S.trim; for (let i = 0; i < 7; i++) { const xx = (i - 3) * bw * 0.26, yy = -h * 0.12 - (i % 2) * h * 0.06; ell(c, xx + Math.sin(t * 2 + i) * h * 0.003, yy, h * 0.012, h * 0.012); c.fill(); } // hoa / đá lấp lánh trên váy
  // thân áo
  c.beginPath(); c.moveTo(-h * 0.085, -h * 0.72); c.lineTo(h * 0.085, -h * 0.72); c.lineTo(h * 0.07, skirtTop + h * 0.01); c.lineTo(-h * 0.07, skirtTop + h * 0.01); c.closePath();
  c.fillStyle = S.dress; c.fill(); c.strokeStyle = S.trim; c.lineWidth = h * 0.006; c.beginPath(); c.moveTo(-h * 0.07, skirtTop + h * 0.01); c.lineTo(h * 0.07, skirtTop + h * 0.01); c.stroke();
  c.fillStyle = S.gem; ell(c, 0, -h * 0.68, h * 0.014, h * 0.014); c.fill();
  // tay (2 khúc + tay áo phồng)
  const arm = (sd, a, e) => {
    const sx0 = sd * h * 0.085, sy0 = -h * 0.705, L1 = h * 0.15, L2 = h * 0.14;
    const ang = Math.PI / 2 + sd * (-(Math.PI / 2) + 0) ; void ang;
    const dirx = sd * Math.sin(a), diry = Math.cos(a);                         // a: 0 = buông xuống, π = giơ thẳng
    const ex = sx0 + dirx * L1, ey = sy0 + diry * L1;
    const a2 = a + sd * 0 + e * 1, dx2 = sd * Math.sin(a2), dy2 = Math.cos(a2);
    const hx = ex + dx2 * L2, hy2 = ey + dy2 * L2;
    c.strokeStyle = S.skin; c.lineCap = 'round'; c.lineWidth = h * 0.032;
    c.beginPath(); c.moveTo(sx0, sy0); c.lineTo(ex, ey); c.lineTo(hx, hy2); c.stroke();
    c.fillStyle = S.dress2; ell(c, sx0 + dirx * h * 0.025, sy0 + diry * h * 0.025, h * 0.035, h * 0.03); c.fill(); // tay áo phồng
    c.fillStyle = S.trim; ell(c, ex + dx2 * L2 * 0.75, ey + dy2 * L2 * 0.75, h * 0.018, h * 0.012, a2); c.fill(); // găng / vòng tay
    c.fillStyle = S.skin; ell(c, hx, hy2, h * 0.02, h * 0.02); c.fill();
    return { x: hx, y: hy2 };
  };
  const h1 = arm(-1, A.a1 ?? 0.3, A.e1 ?? 0.2), h2 = arm(1, A.a2 ?? 0.3, A.e2 ?? 0.2);
  // cổ + đầu
  c.fillStyle = S.skin; c.fillRect(-h * 0.02, -h * 0.76, h * 0.04, h * 0.05);
  c.save(); c.translate(0, hy); c.rotate(A.headTilt || 0); c.translate(0, -hy);
  ell(c, 0, hy, hr, hr * 1.02); c.fillStyle = S.skin; c.fill();
  // mặt: mắt to, má hồng, miệng theo tâm trạng
  const blink = A.blink ? 0.15 : 1, ey0 = hy + hr * 0.1;
  for (const sd of [-1, 1]) {
    c.fillStyle = '#2a1a2e'; ell(c, sd * hr * 0.38, ey0, hr * 0.13, hr * 0.17 * blink); c.fill();
    if (blink > 0.5) { c.fillStyle = '#fff'; ell(c, sd * hr * 0.38 - hr * 0.04, ey0 - hr * 0.06, hr * 0.05, hr * 0.05); c.fill(); }
    c.fillStyle = 'rgba(255,110,140,0.35)'; ell(c, sd * hr * 0.55, ey0 + hr * 0.28, hr * 0.15, hr * 0.09); c.fill();
  }
  c.strokeStyle = '#8a2a3a'; c.lineWidth = h * 0.006; c.beginPath();
  if (A.mood === 'sad') c.arc(0, hy + hr * 0.62, hr * 0.15, Math.PI * 1.15, Math.PI * 1.85);
  else if (A.mood === 'wow') { c.fillStyle = '#8a2a3a'; ell(c, 0, hy + hr * 0.5, hr * 0.09, hr * 0.12); c.fill(); }
  else c.arc(0, hy + hr * 0.38, hr * 0.18, Math.PI * 0.2, Math.PI * 0.8);
  c.stroke();
  // tóc trước + kiểu tóc
  c.fillStyle = S.hair;
  c.beginPath(); c.moveTo(-hr * 1.02, hy + hr * 0.1); c.quadraticCurveTo(-hr * 1.1, hy - hr * 1.15, 0, hy - hr * 1.08); c.quadraticCurveTo(hr * 1.1, hy - hr * 1.15, hr * 1.02, hy + hr * 0.1);
  c.quadraticCurveTo(hr * 0.6, hy - hr * 0.55, 0, hy - hr * 0.45); c.quadraticCurveTo(-hr * 0.6, hy - hr * 0.55, -hr * 1.02, hy + hr * 0.1); c.fill();
  if (S.hairStyle === 'bun') { ell(c, 0, hy - hr * 1.25, hr * 0.5, hr * 0.42); c.fill(); for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * hr * 0.95, hy); c.quadraticCurveTo(sd * hr * 1.25, hy + hr * 0.8 + hairSw * 0.3, sd * hr * 0.9, hy + hr * 1.2); c.lineWidth = h * 0.012; c.strokeStyle = S.hair; c.stroke(); } }
  if (S.hairStyle === 'long') { c.fillStyle = S.gem; ell(c, hr * 0.85, hy - hr * 0.55, hr * 0.22, hr * 0.14, 0.6); c.fill(); }
  // vương miện
  const cy = hy - hr * (S.hairStyle === 'bun' ? 0.95 : 0.98);
  c.fillStyle = S.crown; c.beginPath(); c.moveTo(-hr * 0.55, cy);
  for (let i = 0; i <= 4; i++) { const xx = -hr * 0.55 + i * hr * 0.275; c.lineTo(xx - hr * 0.07, cy - (i % 2 ? hr * 0.18 : hr * 0.38)); c.lineTo(xx + hr * 0.07, cy - (i % 2 ? hr * 0.18 : hr * 0.38)); }
  c.lineTo(hr * 0.55, cy); c.closePath(); c.fill();
  c.fillStyle = S.gem; ell(c, 0, cy - hr * 0.14, hr * 0.08, hr * 0.08); c.fill();
  if (S.id === 'sun') { for (let i = -2; i <= 2; i++) { c.fillStyle = '#ffcf33'; ell(c, i * hr * 0.4, hy - hr * 0.92 + Math.abs(i) * hr * 0.12, hr * 0.16, hr * 0.16); c.fill(); c.fillStyle = '#7a4a1a'; ell(c, i * hr * 0.4, hy - hr * 0.92 + Math.abs(i) * hr * 0.12, hr * 0.07, hr * 0.07); c.fill(); } }
  c.restore();
  c.restore();
  return { hands: [h1, h2] };
}

/** Phòng khiêu vũ lâu đài (tầng tĩnh vẽ sẵn) + đèn quét, sàn phát sáng theo nhịp, hoa giấy khi FEVER. */
export function drawBallroom(r, t, beatPh, fever, accent = '#ff7eb6') {
  const { ctx, W, H } = r, fy = H * 0.56;
  const key = `${W}x${H}`;
  if (!r._ballroom || r._ballroomKey !== key) {
    const cv = r._ballroom || (r._ballroom = document.createElement('canvas')); cv.width = W; cv.height = H; r._ballroomKey = key;
    const c = cv.getContext('2d');
    const wall = c.createLinearGradient(0, 0, 0, fy); wall.addColorStop(0, '#1c0f3a'); wall.addColorStop(1, '#4a2a6a'); c.fillStyle = wall; c.fillRect(0, 0, W, fy);
    for (let i = 0; i < 5; i++) { // cửa sổ vòm nhìn ra trời sao
      const x = W * (0.1 + i * 0.2), w = W * 0.09, top = H * 0.08, bot = fy - H * 0.06;
      const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, '#0d1640'); g.addColorStop(1, '#2a3a8a');
      c.fillStyle = g; c.beginPath(); c.moveTo(x - w / 2, bot); c.lineTo(x - w / 2, top + w / 2); c.arc(x, top + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, bot); c.fill();
      c.fillStyle = '#fff'; for (let k = 0; k < 8; k++) { c.globalAlpha = 0.4 + 0.6 * ((k * 7 + i) % 5) / 5; ell(c, x - w / 2 + ((k * 37 + i * 11) % 100) / 100 * w, top + ((k * 53 + i * 7) % 100) / 100 * (bot - top), 1.2, 1.2); c.fill(); }
      c.globalAlpha = 1; c.strokeStyle = '#d9b44a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - w / 2, bot); c.lineTo(x - w / 2, top + w / 2); c.arc(x, top + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, bot); c.stroke();
      c.beginPath(); c.moveTo(x, top); c.lineTo(x, bot); c.moveTo(x - w / 2, (top + bot) / 2); c.lineTo(x + w / 2, (top + bot) / 2); c.lineWidth = 1.5; c.stroke();
    }
    for (let i = 0; i < 6; i++) { const x = W * (0.0 + i * 0.2); const g = c.createLinearGradient(x - W * 0.02, 0, x + W * 0.02, 0); g.addColorStop(0, '#6a4a8a'); g.addColorStop(0.5, '#c9a8e8'); g.addColorStop(1, '#5a3a7a'); c.fillStyle = g; c.fillRect(x - W * 0.018, 0, W * 0.036, fy); c.fillStyle = '#d9b44a'; c.fillRect(x - W * 0.026, fy - H * 0.02, W * 0.052, H * 0.02); c.fillRect(x - W * 0.026, 0, W * 0.052, H * 0.02); }
    // sàn đá cẩm thạch ô bàn cờ phối cảnh
    const fl = c.createLinearGradient(0, fy, 0, H); fl.addColorStop(0, '#3a2450'); fl.addColorStop(1, '#1a0f2a'); c.fillStyle = fl; c.fillRect(0, fy, W, H - fy);
    const rows = 9, cols = 12, vx = W / 2;
    for (let rI = 0; rI < rows; rI++) {
      const y0 = fy + (H - fy) * Math.pow(rI / rows, 1.7), y1 = fy + (H - fy) * Math.pow((rI + 1) / rows, 1.7);
      for (let cI = -cols; cI < cols; cI++) {
        if ((rI + cI) % 2 === 0) continue;
        const xAt = (cc, y) => vx + (cc / cols) * W * 1.4 * ((y - fy) / (H - fy) * 0.85 + 0.15);
        c.fillStyle = 'rgba(255,230,255,0.07)'; c.beginPath(); c.moveTo(xAt(cI, y0), y0); c.lineTo(xAt(cI + 1, y0), y0); c.lineTo(xAt(cI + 1, y1), y1); c.lineTo(xAt(cI, y1), y1); c.fill();
      }
    }
    const carpet = c.createLinearGradient(0, fy, 0, H); carpet.addColorStop(0, 'rgba(200,30,80,0.5)'); carpet.addColorStop(1, 'rgba(160,20,60,0.85)');
    c.fillStyle = carpet; c.beginPath(); c.moveTo(W * 0.46, fy); c.lineTo(W * 0.54, fy); c.lineTo(W * 0.7, H); c.lineTo(W * 0.3, H); c.fill();
  }
  ctx.drawImage(r._ballroom, 0, 0);
  // đèn chùm lấp lánh
  for (const cx of [W * 0.3, W * 0.7]) {
    const cy = H * 0.1; ctx.strokeStyle = '#d9b44a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy); ctx.stroke();
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.12); glow.addColorStop(0, `rgba(255,240,200,${0.55 + 0.25 * beatPh})`); glow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - H * 0.12, cy - H * 0.12, H * 0.24, H * 0.24);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + t * 0.3; ctx.fillStyle = '#fff6d8'; ell(ctx, cx + Math.cos(a) * H * 0.05, cy + Math.sin(a) * H * 0.015, 3, 5); ctx.fill(); }
  }
  // 2 đèn quét theo nhịp
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [sx, ph, col] of [[W * 0.08, 0, accent], [W * 0.92, Math.PI, '#7fd8ff']]) {
    const a = Math.sin(t * 0.9 + ph) * 0.5, tx = W / 2 + Math.sin(t * 0.9 + ph) * W * 0.35, ty = H * 0.95;
    const g = ctx.createLinearGradient(sx, 0, tx, ty); g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00');
    ctx.globalAlpha = 0.18 + 0.12 * beatPh; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(tx - W * 0.1, ty); ctx.lineTo(tx + W * 0.1, ty); ctx.fill(); void a;
  }
  // sàn lóe sáng mỗi phách
  ctx.globalAlpha = 0.25 * beatPh; const fg = ctx.createRadialGradient(W / 2, H * 0.9, 0, W / 2, H * 0.9, W * 0.45); fg.addColorStop(0, fever ? '#ffd84a' : accent); fg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fg; ctx.fillRect(0, fy, W, H - fy);
  ctx.restore();
  if (fever) { // hoa giấy
    for (let i = 0; i < 60; i++) { const x = ((i * 97 + t * 40 * (1 + i % 3)) % W), y = ((i * 53 + t * (80 + (i % 5) * 30)) % H); ctx.fillStyle = ['#ff7eb6', '#ffd84a', '#7fd8ff', '#7dffb0', '#c9a8ff'][i % 5]; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3 + i); ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
  }
}

/** Ô động tác (kiểu dãy mũi tên Audition): state 'todo' | 'now' | 'done'. */
export function drawPoseIcon(c, x, y, r, P, state, t) {
  c.save();
  const k = state === 'now' ? 1 + 0.08 * Math.sin(t * 10) : 1;
  c.translate(x, y); c.scale(k, k);
  c.globalAlpha = state === 'done' ? 1 : state === 'now' ? 1 : 0.7;
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, state === 'done' ? '#ffffff' : P.color); g.addColorStop(1, state === 'done' ? P.color : shade(P.color, -0.45));
  ell(c, 0, 0, r, r); c.fillStyle = g; c.fill();
  c.lineWidth = r * (state === 'now' ? 0.16 : 0.08); c.strokeStyle = state === 'now' ? '#fff' : 'rgba(255,255,255,0.6)'; c.stroke();
  c.fillStyle = state === 'done' ? shade(P.color, -0.5) : '#fff'; c.font = `900 ${Math.round(r * 1.15)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(P.icon, 0, r * 0.06);
  if (state === 'done') { c.fillStyle = '#2bd47a'; ell(c, r * 0.7, -r * 0.7, r * 0.32, r * 0.32); c.fill(); c.fillStyle = '#fff'; c.font = `900 ${Math.round(r * 0.45)}px system-ui`; c.fillText('✓', r * 0.7, -r * 0.68); }
  c.restore();
}
