// Vẽ khủng long NHÌN THẲNG vào màn hình (góc chính diện) bằng Canvas 2D thuần — không cần ảnh, không tốn băng thông.
// Toạ độ cục bộ: gốc (0,0) ở giữa 2 chân, trục y hướng LÊN là âm; w, h = khung khủng long (dinoBox).
// A (anim): { t, jaw 0..1, look −1..1 (đầu ngoảnh), glow 0..1 (gồng đòn: mắt đỏ), flap, crouch 0..1 }

const TAU = Math.PI * 2;
export function shade(hex, k) { // k > 0 sáng hơn, k < 0 tối hơn
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); };
function bodyGrad(c, x, y, r, col) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.15);
  g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.45));
  return g;
}
function teethRow(c, x0, x1, y, n, len, down = true) {
  c.fillStyle = '#fff8e6'; c.strokeStyle = 'rgba(80,60,40,0.5)'; c.lineWidth = Math.max(1, len * 0.08);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, x = x0 + (x1 - x0) * k, half = ((x1 - x0) / n) * 0.42, l = len * (0.75 + 0.35 * Math.sin(k * Math.PI));
    c.beginPath(); c.moveTo(x - half, y); c.lineTo(x, y + (down ? l : -l)); c.lineTo(x + half, y); c.closePath(); c.fill(); c.stroke();
  }
}
function eye(c, x, y, r, glow, look = 0) {
  c.save();
  if (glow > 0) { c.shadowColor = '#ff2a00'; c.shadowBlur = r * 3 * glow; }
  ell(c, x, y, r, r * 0.8); c.fillStyle = glow > 0.4 ? '#ff4a1c' : '#ffd23f'; c.fill();
  c.shadowBlur = 0;
  ell(c, x + look * r * 0.25, y, r * 0.22, r * 0.72); c.fillStyle = '#140800'; c.fill();   // đồng tử dọc
  ell(c, x - r * 0.35, y - r * 0.3, r * 0.18, r * 0.14); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
  c.restore();
}
function brow(c, x, y, w, side, col) { // gờ mày dữ tợn: xếch xuống phía trong
  c.beginPath(); c.moveTo(x - side * w * 0.6, y - w * 0.25); c.quadraticCurveTo(x, y - w * 0.55, x + side * w * 0.7, y + w * 0.12);
  c.lineTo(x + side * w * 0.6, y + w * 0.3); c.quadraticCurveTo(x, y - w * 0.1, x - side * w * 0.6, y + w * 0.05); c.closePath();
  c.fillStyle = shade(col, -0.35); c.fill();
}
function claws(c, x, y, w, n, col = '#f4ecd8') {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const cx = x + (i - (n - 1) / 2) * w * 0.38;
    c.beginPath(); c.moveTo(cx - w * 0.12, y); c.quadraticCurveTo(cx, y + w * 0.5, cx + w * 0.02, y + w * 0.45); c.lineTo(cx + w * 0.12, y); c.closePath(); c.fill();
  }
}
function mouth(c, cx, yTop, wid, open, col, teethN, tooth) {
  // hàm trên (răng chĩa xuống) + khoang miệng + hàm dưới hạ xuống theo `open`
  const drop = open;
  if (drop > 1) {
    c.beginPath(); c.moveTo(cx - wid / 2, yTop); c.quadraticCurveTo(cx, yTop + drop * 1.5, cx + wid / 2, yTop);
    c.quadraticCurveTo(cx, yTop + drop * 0.2, cx - wid / 2, yTop); c.fillStyle = '#4a0d0d'; c.fill();
    ell(c, cx, yTop + drop * 0.65, wid * 0.28, drop * 0.3); c.fillStyle = '#b8344a'; c.fill(); // lưỡi
    teethRow(c, cx - wid * 0.44, cx + wid * 0.44, yTop + drop * 1.05, teethN - 1, tooth * 0.8, false);
  }
  teethRow(c, cx - wid * 0.46, cx + wid * 0.46, yTop, teethN, tooth, true);
  // hàm dưới
  c.beginPath(); c.moveTo(cx - wid * 0.5, yTop + drop * 0.9);
  c.quadraticCurveTo(cx, yTop + drop * 1.25 + wid * 0.32, cx + wid * 0.5, yTop + drop * 0.9);
  c.quadraticCurveTo(cx, yTop + drop * 1.1 + wid * 0.08, cx - wid * 0.5, yTop + drop * 0.9);
  c.fillStyle = shade(col, -0.15); c.fill();
}

// ---------------- T-REX ----------------
function trex(c, w, h, A) {
  const col = '#5b8a3a', belly = '#d8c58a', t = A.t, sway = Math.sin(t * 1.3) * 0.04;
  // đuôi phía sau, lấp ló bên phải
  c.beginPath(); c.moveTo(w * 0.15, -h * 0.5); c.quadraticCurveTo(w * 0.55, -h * (0.42 + sway), w * 0.7, -h * (0.22 + sway * 2));
  c.quadraticCurveTo(w * 0.5, -h * 0.3, w * 0.12, -h * 0.34); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  // chân
  for (const sd of [-1, 1]) {
    ell(c, sd * w * 0.2, -h * 0.31, w * 0.14, h * 0.16); c.fillStyle = bodyGrad(c, sd * w * 0.2, -h * 0.31, w * 0.14, col); c.fill();
    c.beginPath(); c.moveTo(sd * w * 0.15, -h * 0.22); c.lineTo(sd * w * 0.27, -h * 0.22); c.lineTo(sd * w * 0.26, -h * 0.03); c.lineTo(sd * w * 0.16, -h * 0.03); c.closePath();
    c.fillStyle = shade(col, -0.2); c.fill();
    ell(c, sd * w * 0.21, -h * 0.025, w * 0.11, h * 0.035); c.fillStyle = shade(col, -0.3); c.fill();
    claws(c, sd * w * 0.21, -h * 0.01, w * 0.07, 3);
  }
  // thân
  ell(c, 0, -h * 0.48, w * 0.32, h * 0.25); c.fillStyle = bodyGrad(c, 0, -h * 0.48, w * 0.32, col); c.fill();
  c.strokeStyle = shade(col, -0.35); c.lineWidth = w * 0.018;
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(sd * w * 0.29, -h * (0.4 + i * 0.08)); c.quadraticCurveTo(sd * w * 0.24, -h * (0.43 + i * 0.08), sd * w * 0.2, -h * (0.42 + i * 0.08)); c.stroke(); } // sọc lưng
  ell(c, 0, -h * 0.44, w * 0.17, h * 0.19); c.fillStyle = belly; c.fill();
  c.strokeStyle = shade(belly, -0.25); c.lineWidth = w * 0.008;
  for (let i = 1; i < 6; i++) { const y = -h * (0.3 + i * 0.045); const hw = w * 0.16 * Math.sqrt(1 - Math.pow((y + h * 0.44) / (h * 0.19), 2) || 0); c.beginPath(); c.moveTo(-hw, y); c.quadraticCurveTo(0, y + h * 0.01, hw, y); c.stroke(); }
  // tay ngắn tũn
  for (const sd of [-1, 1]) {
    c.strokeStyle = shade(col, -0.1); c.lineWidth = w * 0.045; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sd * w * 0.16, -h * 0.6); c.lineTo(sd * w * 0.22, -h * 0.55); c.lineTo(sd * w * 0.2, -h * 0.5); c.stroke();
    claws(c, sd * w * 0.2, -h * 0.5, w * 0.04, 2);
  }
  // cổ
  c.beginPath(); c.moveTo(-w * 0.16, -h * 0.62); c.lineTo(-w * 0.13, -h * 0.75); c.lineTo(w * 0.13, -h * 0.75); c.lineTo(w * 0.16, -h * 0.62); c.closePath();
  c.fillStyle = col; c.fill();
  // đầu (chính diện: mõm rộng hướng về người xem)
  const hx = A.look * w * 0.05, hy = -h * 0.84, hw = w * 0.46, hh = h * 0.17;
  c.save(); c.translate(hx, 0);
  c.beginPath(); c.moveTo(-hw / 2, hy + hh * 0.35); c.quadraticCurveTo(-hw * 0.56, hy - hh * 0.6, -hw * 0.2, hy - hh * 0.8);
  c.quadraticCurveTo(0, hy - hh * 0.95, hw * 0.2, hy - hh * 0.8); c.quadraticCurveTo(hw * 0.56, hy - hh * 0.6, hw / 2, hy + hh * 0.35);
  c.quadraticCurveTo(0, hy + hh * 0.55, -hw / 2, hy + hh * 0.35); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
  // vảy sần trên đầu
  c.fillStyle = shade(col, -0.25);
  for (let i = 0; i < 7; i++) { ell(c, (i - 3) * hw * 0.09, hy - hh * (0.55 + 0.1 * Math.cos(i)), hw * 0.025, hh * 0.05); c.fill(); }
  ell(c, -hw * 0.08, hy - hh * 0.05, hw * 0.03, hh * 0.06); c.fillStyle = '#1b1208'; c.fill(); // lỗ mũi
  ell(c, hw * 0.08, hy - hh * 0.05, hw * 0.03, hh * 0.06); c.fill();
  for (const sd of [-1, 1]) { eye(c, sd * hw * 0.33, hy - hh * 0.38, hw * 0.075, A.glow, A.look); brow(c, sd * hw * 0.33, hy - hh * 0.55, hw * 0.14, -sd, col); }
  mouth(c, 0, hy + hh * 0.35, hw * 0.92, A.jaw * h * 0.14, col, 9, hh * 0.28);
  c.restore();
}

// ---------------- RAPTOR ----------------
function raptor(c, w, h, A) {
  const col = '#e0782b', dark = '#6b2f12', t = A.t;
  // đuôi
  c.beginPath(); c.moveTo(-w * 0.1, -h * 0.5); c.quadraticCurveTo(-w * 0.55, -h * (0.55 + Math.sin(t * 2) * 0.03), -w * 0.75, -h * 0.62);
  c.quadraticCurveTo(-w * 0.5, -h * 0.48, -w * 0.08, -h * 0.42); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  for (const sd of [-1, 1]) { // chân dài, móng liềm
    ell(c, sd * w * 0.16, -h * 0.4, w * 0.11, h * 0.12); c.fillStyle = bodyGrad(c, sd * w * 0.16, -h * 0.4, w * 0.11, col); c.fill();
    c.strokeStyle = shade(col, -0.25); c.lineWidth = w * 0.065; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sd * w * 0.18, -h * 0.32); c.lineTo(sd * w * 0.22, -h * 0.16); c.lineTo(sd * w * 0.2, -h * 0.03); c.stroke();
    claws(c, sd * w * 0.2, -h * 0.015, w * 0.06, 2);
    c.strokeStyle = '#f4ecd8'; c.lineWidth = w * 0.02; c.beginPath(); c.arc(sd * w * 0.25, -h * 0.05, w * 0.05, Math.PI * 1.1, Math.PI * 1.8); c.stroke(); // móng liềm
  }
  ell(c, 0, -h * 0.52, w * 0.22, h * 0.17); c.fillStyle = bodyGrad(c, 0, -h * 0.52, w * 0.22, col); c.fill();
  c.strokeStyle = dark; c.lineWidth = w * 0.03; // sọc
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * (0.12 + i * 0.025), -h * (0.62 - i * 0.04)); c.lineTo(sd * w * (0.2 + i * 0.02), -h * (0.56 - i * 0.04)); c.stroke(); }
  ell(c, 0, -h * 0.5, w * 0.1, h * 0.12); c.fillStyle = '#f2d3a6'; c.fill();
  for (const sd of [-1, 1]) { // tay có lông, móng xoè
    c.strokeStyle = col; c.lineWidth = w * 0.05; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sd * w * 0.14, -h * 0.6); c.lineTo(sd * w * 0.3, -h * 0.55); c.lineTo(sd * w * 0.36, -h * 0.46); c.stroke();
    c.fillStyle = '#2a6f97';
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * (0.2 + i * 0.04), -h * (0.58 - i * 0.025)); c.lineTo(sd * w * (0.22 + i * 0.04), -h * (0.5 - i * 0.025)); c.lineTo(sd * w * (0.25 + i * 0.04), -h * (0.57 - i * 0.025)); c.fill(); }
    claws(c, sd * w * 0.36, -h * 0.46, w * 0.06, 3);
  }
  // cổ
  c.strokeStyle = col; c.lineWidth = w * 0.14; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, -h * 0.62); c.quadraticCurveTo(A.look * w * 0.05, -h * 0.72, A.look * w * 0.04, -h * 0.8); c.stroke();
  // đầu hẹp, mõm dài chĩa thẳng về phía người xem
  c.save(); c.translate(A.look * w * 0.06, 0);
  const hy = -h * 0.86, hw = w * 0.3, hh = h * 0.13;
  c.fillStyle = '#2a9df4'; // mào lông
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * hw * 0.12; c.beginPath(); c.moveTo(x - hw * 0.05, hy - hh * 0.6); c.lineTo(x + Math.sin(t * 3 + i) * hw * 0.02, hy - hh * (1.3 + 0.25 * Math.cos(i * 1.7))); c.lineTo(x + hw * 0.05, hy - hh * 0.6); c.fill(); }
  c.beginPath(); c.moveTo(-hw / 2, hy - hh * 0.2); c.quadraticCurveTo(-hw * 0.45, hy - hh * 0.9, 0, hy - hh * 0.85);
  c.quadraticCurveTo(hw * 0.45, hy - hh * 0.9, hw / 2, hy - hh * 0.2); c.lineTo(hw * 0.3, hy + hh * 0.5); c.quadraticCurveTo(0, hy + hh * 0.75, -hw * 0.3, hy + hh * 0.5); c.closePath();
  c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
  c.strokeStyle = dark; c.lineWidth = w * 0.015; c.beginPath(); c.moveTo(0, hy - hh * 0.8); c.lineTo(0, hy + hh * 0.1); c.stroke();
  for (const sd of [-1, 1]) { eye(c, sd * hw * 0.3, hy - hh * 0.3, hw * 0.09, A.glow, A.look); brow(c, sd * hw * 0.3, hy - hh * 0.5, hw * 0.15, -sd, col); }
  ell(c, -hw * 0.07, hy + hh * 0.25, hw * 0.025, hh * 0.05); c.fillStyle = '#1b1208'; c.fill(); ell(c, hw * 0.07, hy + hh * 0.25, hw * 0.025, hh * 0.05); c.fill();
  mouth(c, 0, hy + hh * 0.5, hw * 0.62, A.jaw * h * 0.1, col, 7, hh * 0.3);
  c.restore();
}

// ---------------- TRICERATOPS ----------------
function trike(c, w, h, A) {
  const col = '#5f86a8', frill = '#d9662b';
  ell(c, 0, -h * 0.5, w * 0.44, h * 0.3); c.fillStyle = bodyGrad(c, 0, -h * 0.5, w * 0.44, col); c.fill(); // thân phía sau
  for (const sd of [-1, 1]) { // 2 chân trước như cột
    c.beginPath(); c.moveTo(sd * w * 0.2, -h * 0.35); c.lineTo(sd * w * 0.36, -h * 0.35); c.lineTo(sd * w * 0.35, -h * 0.03); c.lineTo(sd * w * 0.21, -h * 0.03); c.closePath();
    c.fillStyle = bodyGrad(c, sd * w * 0.28, -h * 0.2, w * 0.12, col); c.fill();
    ell(c, sd * w * 0.28, -h * 0.03, w * 0.1, h * 0.04); c.fillStyle = shade(col, -0.35); c.fill();
    claws(c, sd * w * 0.28, -h * 0.02, w * 0.05, 3, '#e8e0cc');
  }
  // diềm cổ (frill) to sau đầu, viền gai
  c.save(); c.translate(A.look * w * 0.03, 0);
  const fy = -h * 0.66, fr = w * 0.4, frh = h * 0.36;
  c.fillStyle = shade(frill, -0.3);
  for (let i = 0; i <= 12; i++) { const a = Math.PI * (1.02 + i / 12 * 0.96); const x = Math.cos(a) * fr * 1.07, y = fy + Math.sin(a) * frh * 1.07; c.beginPath(); c.moveTo(x - fr * 0.05, y + frh * 0.03); c.lineTo(Math.cos(a) * fr * 1.2, fy + Math.sin(a) * frh * 1.2); c.lineTo(x + fr * 0.05, y + frh * 0.03); c.fill(); }
  ell(c, 0, fy, fr, frh); const g = c.createRadialGradient(0, fy, fr * 0.2, 0, fy, fr); g.addColorStop(0, '#f2c14e'); g.addColorStop(0.55, frill); g.addColorStop(1, shade(frill, -0.4)); c.fillStyle = g; c.fill();
  for (const sd of [-1, 1]) { ell(c, sd * fr * 0.55, fy - frh * 0.35, fr * 0.12, frh * 0.12); c.fillStyle = '#3b1a5a'; c.fill(); ell(c, sd * fr * 0.55, fy - frh * 0.35, fr * 0.06, frh * 0.06); c.fillStyle = '#ffe27a'; c.fill(); }
  // mặt hình nêm thu về mỏ
  const top = -h * 0.66, bot = -h * 0.16, fw = w * 0.34;
  c.beginPath(); c.moveTo(-fw / 2, top); c.quadraticCurveTo(0, top - h * 0.06, fw / 2, top);
  c.quadraticCurveTo(fw * 0.42, -h * 0.35, fw * 0.12, bot); c.quadraticCurveTo(0, bot + h * 0.04, -fw * 0.12, bot);
  c.quadraticCurveTo(-fw * 0.42, -h * 0.35, -fw / 2, top); c.closePath(); c.fillStyle = bodyGrad(c, 0, -h * 0.45, fw * 0.6, col); c.fill();
  // mỏ quặp
  c.beginPath(); c.moveTo(-fw * 0.16, -h * 0.25); c.quadraticCurveTo(0, -h * 0.2 + A.jaw * h * 0.04, fw * 0.16, -h * 0.25); c.lineTo(0, -h * 0.1); c.closePath(); c.fillStyle = '#3d3a36'; c.fill();
  if (A.jaw > 0.1) { ell(c, 0, -h * 0.2, fw * 0.08, A.jaw * h * 0.04); c.fillStyle = '#4a0d0d'; c.fill(); }
  // sừng mũi
  c.beginPath(); c.moveTo(-fw * 0.07, -h * 0.33); c.lineTo(0, -h * 0.43); c.lineTo(fw * 0.07, -h * 0.33); c.closePath(); c.fillStyle = '#efe6cf'; c.fill();
  for (const sd of [-1, 1]) { // 2 sừng mày dài, chĩa lên & ra phía trước
    eye(c, sd * fw * 0.24, -h * 0.5, fw * 0.08, A.glow, A.look);
    const hg = c.createLinearGradient(sd * fw * 0.2, -h * 0.56, sd * w * 0.27, -h * 0.98); hg.addColorStop(0, '#cdbf9c'); hg.addColorStop(1, '#fffaf0');
    c.beginPath(); c.moveTo(sd * fw * 0.1, -h * 0.58); c.quadraticCurveTo(sd * w * 0.12, -h * 0.85, sd * w * 0.27, -h * 0.98 + Math.sin(A.t) * h * 0.005);
    c.quadraticCurveTo(sd * w * 0.18, -h * 0.75, sd * fw * 0.34, -h * 0.57); c.closePath(); c.fillStyle = hg; c.fill();
  }
  c.restore();
}

// ---------------- PTERODACTYL ----------------
function ptero(c, w, h, A) {
  const col = '#8a5bc4', mem = '#5e3c8f', flap = Math.sin(A.t * 7) * (A.flap ?? 1);
  for (const sd of [-1, 1]) { // cánh màng
    const tipY = -h * (0.72 + flap * 0.12), wristY = -h * (0.7 + flap * 0.06);
    c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.64); c.lineTo(sd * w * 0.27, wristY); c.lineTo(sd * w * 0.5, tipY);
    c.quadraticCurveTo(sd * w * 0.33, -h * 0.5, sd * w * 0.06, -h * 0.4); c.closePath();
    const g = c.createLinearGradient(0, -h * 0.7, sd * w * 0.5, -h * 0.5); g.addColorStop(0, mem); g.addColorStop(1, shade(mem, 0.25)); c.fillStyle = g; c.fill();
    c.strokeStyle = shade(col, -0.3); c.lineWidth = w * 0.014; c.lineCap = 'round';
    c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.64); c.lineTo(sd * w * 0.27, wristY); c.lineTo(sd * w * 0.5, tipY); c.stroke(); // xương cánh
    c.lineWidth = w * 0.006; c.globalAlpha = 0.5;
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(sd * w * 0.27, wristY); c.lineTo(sd * w * (0.27 + 0.06 * i), -h * (0.52 + 0.02 * i)); c.stroke(); }
    c.globalAlpha = 1; claws(c, sd * w * 0.27, wristY, w * 0.025, 3);
  }
  ell(c, 0, -h * 0.55, w * 0.075, h * 0.15); c.fillStyle = bodyGrad(c, 0, -h * 0.55, w * 0.08, col); c.fill();
  for (const sd of [-1, 1]) { c.strokeStyle = col; c.lineWidth = w * 0.02; c.beginPath(); c.moveTo(sd * w * 0.03, -h * 0.42); c.lineTo(sd * w * 0.05, -h * 0.33); c.stroke(); claws(c, sd * w * 0.05, -h * 0.33, w * 0.02, 3); }
  // đầu + mào dài phía sau (thấy như vây trên đầu), mỏ dài chĩa vào người xem
  c.save(); c.translate(A.look * w * 0.03, 0);
  const hy = -h * 0.76;
  c.beginPath(); c.moveTo(-w * 0.02, hy - h * 0.06); c.quadraticCurveTo(w * 0.01, hy - h * 0.25, w * 0.05, hy - h * 0.3); c.quadraticCurveTo(w * 0.04, hy - h * 0.15, w * 0.03, hy - h * 0.05); c.closePath();
  c.fillStyle = '#e8543b'; c.fill();
  ell(c, 0, hy, w * 0.065, h * 0.075); c.fillStyle = bodyGrad(c, 0, hy, w * 0.065, col); c.fill();
  const bg = c.createLinearGradient(0, hy, 0, hy + h * 0.2); bg.addColorStop(0, '#f2d27a'); bg.addColorStop(1, '#a8781e');
  c.beginPath(); c.moveTo(-w * 0.035, hy + h * 0.02); c.lineTo(0, hy + h * (0.2 + A.jaw * 0.04)); c.lineTo(w * 0.035, hy + h * 0.02); c.closePath(); c.fillStyle = bg; c.fill();
  if (A.jaw > 0.1) { c.strokeStyle = '#4a0d0d'; c.lineWidth = w * 0.01 * A.jaw; c.beginPath(); c.moveTo(0, hy + h * 0.03); c.lineTo(0, hy + h * 0.17); c.stroke(); }
  for (const sd of [-1, 1]) eye(c, sd * w * 0.035, hy - h * 0.015, w * 0.016, A.glow, A.look);
  c.restore();
}

const DRAW = { trex, raptor, trike, ptero };

/** Vẽ 1 khủng long vào ctx tại khung B (gốc = giữa chân). */
export function drawDino(ctx, key, B, A) {
  ctx.save();
  ctx.translate(B.x, B.y);
  if (A.crouch) ctx.scale(1 + A.crouch * 0.04, 1 - A.crouch * 0.06);
  // bóng dưới chân (khủng long bay: bóng mờ dưới đất)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ell(ctx, 0, key === 'ptero' ? B.h * 0.25 : 0, B.w * 0.36, B.h * 0.045); ctx.fill();
  DRAW[key](ctx, B.w, B.h, A);
  ctx.restore();
}

/** Nền tiền sử: trời hoàng hôn, núi lửa phun khói, rừng dương xỉ, mặt đất phối cảnh. Vẽ sẵn tầng tĩnh vào canvas đệm. */
export function drawDinoBg(r, t) {
  const { ctx, W, H } = r, hz = H * 0.42;
  const key = `${W}x${H}`;
  if (!r._dinoBg || r._dinoBgKey !== key) {
    const cv = r._dinoBg || (r._dinoBg = document.createElement('canvas'));
    cv.width = W; cv.height = H; r._dinoBgKey = key;
    const c = cv.getContext('2d');
    const sky = c.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#2b1450'); sky.addColorStop(0.45, '#c2456a'); sky.addColorStop(0.8, '#ff8a4c'); sky.addColorStop(1, '#ffc46b');
    c.fillStyle = sky; c.fillRect(0, 0, W, hz + 2);
    const sun = c.createRadialGradient(W * 0.3, hz * 0.9, 0, W * 0.3, hz * 0.9, H * 0.3); sun.addColorStop(0, 'rgba(255,240,180,0.95)'); sun.addColorStop(0.2, 'rgba(255,200,120,0.6)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
    c.fillStyle = sun; c.fillRect(0, 0, W, hz);
    c.fillStyle = '#7a3a6b'; c.beginPath(); c.moveTo(0, hz); // dãy núi xa
    for (let x = 0; x <= W; x += W / 12) c.lineTo(x, hz - H * (0.06 + 0.05 * Math.abs(Math.sin(x * 0.013))));
    c.lineTo(W, hz); c.fill();
    c.fillStyle = '#4a2246'; c.beginPath(); c.moveTo(W * 0.55, hz); c.lineTo(W * 0.7, hz - H * 0.24); c.lineTo(W * 0.76, hz - H * 0.24); c.lineTo(W * 0.95, hz); c.fill(); // núi lửa
    const lava = c.createLinearGradient(0, hz - H * 0.24, 0, hz - H * 0.12); lava.addColorStop(0, '#ffdd55'); lava.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = lava; c.beginPath(); c.moveTo(W * 0.7, hz - H * 0.24); c.lineTo(W * 0.76, hz - H * 0.24); c.lineTo(W * 0.745, hz - H * 0.12); c.lineTo(W * 0.715, hz - H * 0.15); c.fill();
    // rừng ở chân trời: dương xỉ + cọ
    c.fillStyle = '#20301f';
    for (let i = 0; i < 26; i++) { const x = (i / 25) * W, hh = H * (0.03 + 0.03 * ((i * 37) % 5) / 5); ell(c, x, hz, W * 0.035, hh); c.fill(); }
    for (const [px, ph] of [[0.08, 0.2], [0.18, 0.15], [0.86, 0.22], [0.94, 0.16]]) {
      const x = W * px, top = hz - H * ph; c.strokeStyle = '#20301f'; c.lineWidth = W * 0.006; c.beginPath(); c.moveTo(x, hz); c.quadraticCurveTo(x + W * 0.01, (hz + top) / 2, x, top); c.stroke();
      for (let k = 0; k < 6; k++) { const a = Math.PI * (1 + k / 5); c.beginPath(); c.moveTo(x, top); c.quadraticCurveTo(x + Math.cos(a) * W * 0.04, top + Math.sin(a) * H * 0.03 - H * 0.02, x + Math.cos(a) * W * 0.06, top + H * 0.03); c.lineWidth = W * 0.004; c.stroke(); }
    }
    // mặt đất
    const gr = c.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, '#5a4a2a'); gr.addColorStop(0.5, '#7b5b33'); gr.addColorStop(1, '#3e2c18');
    c.fillStyle = gr; c.fillRect(0, hz, W, H - hz);
    c.strokeStyle = 'rgba(255,220,160,0.07)'; c.lineWidth = 2;
    for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(W / 2 + i * W * 0.02, hz); c.lineTo(W / 2 + i * W * 0.22, H); c.stroke(); }
    c.fillStyle = 'rgba(30,20,10,0.35)';
    for (let i = 0; i < 18; i++) { const y = hz + (H - hz) * Math.pow(((i * 53) % 17) / 17, 1.6), s = (y - hz) / (H - hz); ell(c, ((i * 71) % 97) / 97 * W, y, W * 0.02 * (0.3 + s), H * 0.006 * (0.3 + s)); c.fill(); }
    // dương xỉ tiền cảnh 2 góc
    for (const sd of [-1, 1]) {
      const bx = sd < 0 ? 0 : W;
      for (let k = 0; k < 7; k++) {
        const a = (sd < 0 ? -0.15 : Math.PI + 0.15) + sd * k * 0.17 * -1, len = H * (0.28 + 0.05 * Math.sin(k * 2));
        c.strokeStyle = k % 2 ? '#1f3a1c' : '#2b4d24'; c.lineWidth = W * 0.012; c.lineCap = 'round';
        const ex = bx + Math.cos(a - sd * 0.9) * len * (sd < 0 ? 1 : 1), ey = H - Math.abs(Math.sin(a - sd * 0.9)) * len;
        c.beginPath(); c.moveTo(bx, H); c.quadraticCurveTo((bx + ex) / 2, ey - H * 0.05, ex, ey); c.stroke();
      }
    }
  }
  ctx.drawImage(r._dinoBg, 0, 0);
  // khói núi lửa động
  for (let i = 0; i < 5; i++) {
    const k = ((t * 0.08 + i / 5) % 1), x = W * (0.73 + k * 0.05 * Math.sin(i)), y = hz - H * (0.25 + k * 0.25);
    ctx.fillStyle = `rgba(60,40,60,${0.35 * (1 - k)})`; ell(ctx, x, y, W * (0.02 + k * 0.05), H * (0.02 + k * 0.04)); ctx.fill();
  }
}

/** Tảng đá bay tới (z: 1 xa → 0 sát mặt). */
export function drawRock(ctx, x, y, r, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, rr = r * (0.82 + 0.18 * Math.sin(i * 2.3)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r); g.addColorStop(0, '#b9b2a6'); g.addColorStop(1, '#4b443c');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#2b2620'; ctx.lineWidth = r * 0.06; ctx.stroke();
  ctx.restore();
}
