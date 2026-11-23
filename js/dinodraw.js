// Vẽ khủng long NHÌN THẲNG vào màn hình (góc chính diện) bằng Canvas 2D thuần — không cần ảnh, không tốn băng thông.
// Toạ độ cục bộ: gốc (0,0) ở giữa 2 chân, trục y hướng LÊN là âm; w, h = khung khủng long (dinoBox).
// Mỗi bộ phận (chân, tay, đầu, hàm, đuôi, cánh) cử động riêng theo tư thế do dinoPose() tính cho từng giai đoạn / đòn.

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

// ---------------- Khớp nối: mỗi bộ phận cử động riêng ----------------
// A (tư thế) do dinoPose() tính: legL/legR (nhấc chân 0..1), armL/armR (giơ tay, rad), tail (−1..1 quất đuôi),
// headX/headY (dời đầu, theo w/h), headS (đầu to lên = lao về phía người xem), headRot, jaw 0..1, bob (nhún thân),
// wing (vị trí vỗ cánh −1..1), wingFold (0 xoè → 1 cụp), squint (nheo mắt khi choáng / đau), glow, look.
const P0 = { legL: 0, legR: 0, armL: 0, armR: 0, tail: 0, headX: 0, headY: 0, headS: 1, headRot: 0, jaw: 0.15, bob: 0, wing: 0, wingFold: 0, squint: 0, glow: 0, look: 0 };
/** Biến đổi quanh điểm neo (ax, ay): dời (dx, dy) → xoay rot → thu phóng s. */
function part(c, ax, ay, dx, dy, s, rot, fn) {
  c.save(); c.translate(ax + dx, ay + dy); if (rot) c.rotate(rot); if (s !== 1) c.scale(s, s); c.translate(-ax, -ay); fn(); c.restore();
}
function eyes(c, xs, y, r, A, col, browW) {
  for (const sd of [-1, 1]) {
    const x = sd * xs;
    c.save(); c.translate(x, y); c.scale(1, 1 - 0.75 * A.squint); c.translate(-x, -y);
    eye(c, x, y, r, A.glow, A.look);
    c.restore();
    if (browW) brow(c, x, y - r * 1.5 - A.glow * r * 0.3, browW, -sd, col);
  }
}

// ---------------- T-REX ----------------
function trex(c, w, h, A) {
  const col = '#5b8a3a', belly = '#d8c58a';
  // đuôi phía sau: quất sang hai bên (A.tail), khi quật đuôi thì vung rộng ra
  const tx = w * (0.55 + 0.25 * Math.abs(A.tail)) * (A.tail < 0 ? -1 : 1), ty = -h * (0.24 - 0.12 * Math.abs(A.tail));
  c.beginPath(); c.moveTo(Math.sign(tx) * w * 0.12, -h * 0.52); c.quadraticCurveTo(tx * 0.75, -h * 0.5, tx, ty);
  c.quadraticCurveTo(tx * 0.7, -h * 0.3, Math.sign(tx) * w * 0.1, -h * 0.34); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chân: nhấc lên khi bước, gối co
    part(c, sd * w * 0.2, -h * 0.42, 0, -lift * h * 0.08, 1, -sd * lift * 0.12, () => {
      ell(c, sd * w * 0.2, -h * 0.31, w * 0.14, h * 0.16); c.fillStyle = bodyGrad(c, sd * w * 0.2, -h * 0.31, w * 0.14, col); c.fill();
      c.beginPath(); c.moveTo(sd * w * 0.15, -h * 0.22); c.lineTo(sd * w * 0.27, -h * 0.22); c.lineTo(sd * w * 0.26, -h * 0.03); c.lineTo(sd * w * 0.16, -h * 0.03); c.closePath();
      c.fillStyle = shade(col, -0.2); c.fill();
      ell(c, sd * w * 0.21, -h * 0.025, w * 0.11, h * 0.035); c.fillStyle = shade(col, -0.3); c.fill();
      claws(c, sd * w * 0.21, -h * 0.01, w * 0.07, 3);
    });
  }
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.48, w * 0.32, h * 0.25); c.fillStyle = bodyGrad(c, 0, -h * 0.48, w * 0.32, col); c.fill();
    c.strokeStyle = shade(col, -0.35); c.lineWidth = w * 0.018;
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(sd * w * 0.29, -h * (0.4 + i * 0.08)); c.quadraticCurveTo(sd * w * 0.24, -h * (0.43 + i * 0.08), sd * w * 0.2, -h * (0.42 + i * 0.08)); c.stroke(); }
    ell(c, 0, -h * 0.44, w * 0.17, h * 0.19); c.fillStyle = belly; c.fill();
    c.strokeStyle = shade(belly, -0.25); c.lineWidth = w * 0.008;
    for (let i = 1; i < 6; i++) { const y = -h * (0.3 + i * 0.045); const hw = w * 0.16 * Math.sqrt(Math.max(0, 1 - Math.pow((y + h * 0.44) / (h * 0.19), 2))); c.beginPath(); c.moveTo(-hw, y); c.quadraticCurveTo(0, y + h * 0.01, hw, y); c.stroke(); }
    for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) { // tay ngắn: cào cào khi gồng
      part(c, sd * w * 0.16, -h * 0.6, 0, 0, 1, -sd * ar, () => {
        c.strokeStyle = shade(col, -0.1); c.lineWidth = w * 0.045; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sd * w * 0.16, -h * 0.6); c.lineTo(sd * w * 0.22, -h * 0.55); c.lineTo(sd * w * 0.2, -h * 0.5); c.stroke();
        claws(c, sd * w * 0.2, -h * 0.5, w * 0.04, 2);
      });
    }
    c.beginPath(); c.moveTo(-w * 0.16, -h * 0.62); c.lineTo(-w * 0.13 + A.headX * w * 0.5, -h * 0.75 + A.headY * h * 0.5); c.lineTo(w * 0.13 + A.headX * w * 0.5, -h * 0.75 + A.headY * h * 0.5); c.lineTo(w * 0.16, -h * 0.62); c.closePath();
    c.fillStyle = col; c.fill();
    // ĐẦU: dời / xoay / phóng to quanh gốc cổ
    part(c, 0, -h * 0.74, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.84, hw = w * 0.46, hh = h * 0.17;
      c.beginPath(); c.moveTo(-hw / 2, hy + hh * 0.35); c.quadraticCurveTo(-hw * 0.56, hy - hh * 0.6, -hw * 0.2, hy - hh * 0.8);
      c.quadraticCurveTo(0, hy - hh * 0.95, hw * 0.2, hy - hh * 0.8); c.quadraticCurveTo(hw * 0.56, hy - hh * 0.6, hw / 2, hy + hh * 0.35);
      c.quadraticCurveTo(0, hy + hh * 0.55, -hw / 2, hy + hh * 0.35); c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
      c.fillStyle = shade(col, -0.25);
      for (let i = 0; i < 7; i++) { ell(c, (i - 3) * hw * 0.09, hy - hh * (0.55 + 0.1 * Math.cos(i)), hw * 0.025, hh * 0.05); c.fill(); }
      ell(c, -hw * 0.08, hy - hh * 0.05, hw * 0.03, hh * (0.06 + A.glow * 0.02)); c.fillStyle = '#1b1208'; c.fill(); // lỗ mũi phập phồng
      ell(c, hw * 0.08, hy - hh * 0.05, hw * 0.03, hh * (0.06 + A.glow * 0.02)); c.fill();
      eyes(c, hw * 0.33, hy - hh * 0.38, hw * 0.075, A, col, hw * 0.14);
      mouth(c, 0, hy + hh * 0.35, hw * 0.92, A.jaw * h * 0.16, col, 9, hh * 0.28);
    });
  });
}

// ---------------- RAPTOR ----------------
function raptor(c, w, h, A) {
  const col = '#e0782b', dark = '#6b2f12';
  const tx = -w * (0.75 + 0.1 * A.tail), ty = -h * (0.62 + 0.12 * A.tail);
  c.beginPath(); c.moveTo(-w * 0.1, -h * 0.5); c.quadraticCurveTo(-w * 0.5, -h * (0.55 + A.tail * 0.06), tx, ty);
  c.quadraticCurveTo(-w * 0.5, -h * 0.48, -w * 0.08, -h * 0.42); c.closePath(); c.fillStyle = shade(col, -0.3); c.fill();
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) {
    part(c, sd * w * 0.16, -h * 0.45, 0, -lift * h * 0.1, 1, -sd * lift * 0.2, () => {
      ell(c, sd * w * 0.16, -h * 0.4, w * 0.11, h * 0.12); c.fillStyle = bodyGrad(c, sd * w * 0.16, -h * 0.4, w * 0.11, col); c.fill();
      c.strokeStyle = shade(col, -0.25); c.lineWidth = w * 0.065; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sd * w * 0.18, -h * 0.32); c.lineTo(sd * w * (0.22 + lift * 0.04), -h * (0.16 + lift * 0.05)); c.lineTo(sd * w * 0.2, -h * 0.03); c.stroke();
      claws(c, sd * w * 0.2, -h * 0.015, w * 0.06, 2);
      c.strokeStyle = '#f4ecd8'; c.lineWidth = w * 0.02; c.beginPath(); c.arc(sd * w * 0.25, -h * 0.05, w * (0.05 + lift * 0.02), Math.PI * 1.1, Math.PI * 1.8); c.stroke(); // móng liềm vung lên
    });
  }
  part(c, 0, -h * 0.4, 0, -A.bob * h, 1, 0, () => {
    ell(c, 0, -h * 0.52, w * 0.22, h * 0.17); c.fillStyle = bodyGrad(c, 0, -h * 0.52, w * 0.22, col); c.fill();
    c.strokeStyle = dark; c.lineWidth = w * 0.03;
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * (0.12 + i * 0.025), -h * (0.62 - i * 0.04)); c.lineTo(sd * w * (0.2 + i * 0.02), -h * (0.56 - i * 0.04)); c.stroke(); }
    ell(c, 0, -h * 0.5, w * 0.1, h * 0.12); c.fillStyle = '#f2d3a6'; c.fill();
    for (const [sd, ar] of [[-1, A.armL], [1, A.armR]]) { // tay có lông + móng: giương ra, cào xuống
      part(c, sd * w * 0.14, -h * 0.6, 0, 0, 1, -sd * ar, () => {
        c.strokeStyle = col; c.lineWidth = w * 0.05; c.lineCap = 'round';
        c.beginPath(); c.moveTo(sd * w * 0.14, -h * 0.6); c.lineTo(sd * w * 0.3, -h * 0.55); c.lineTo(sd * w * 0.36, -h * 0.46); c.stroke();
        c.fillStyle = '#2a6f97';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(sd * w * (0.2 + i * 0.04), -h * (0.58 - i * 0.025)); c.lineTo(sd * w * (0.22 + i * 0.04), -h * (0.5 - i * 0.025)); c.lineTo(sd * w * (0.25 + i * 0.04), -h * (0.57 - i * 0.025)); c.fill(); }
        claws(c, sd * w * 0.36, -h * 0.46, w * 0.06, 3);
      });
    }
    c.strokeStyle = col; c.lineWidth = w * 0.14; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -h * 0.62); c.quadraticCurveTo(A.headX * w * 0.6, -h * 0.72 + A.headY * h * 0.5, A.headX * w, -h * 0.8 + A.headY * h); c.stroke();
    part(c, 0, -h * 0.8, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.86, hw = w * 0.3, hh = h * 0.13;
      c.fillStyle = '#2a9df4'; // mào lông dựng lên khi gồng
      for (let i = 0; i < 6; i++) { const x = (i - 2.5) * hw * 0.12; c.beginPath(); c.moveTo(x - hw * 0.05, hy - hh * 0.6); c.lineTo(x + Math.sin(A.t * 3 + i) * hw * 0.02, hy - hh * (1.3 + 0.25 * Math.cos(i * 1.7) + A.glow * 0.4)); c.lineTo(x + hw * 0.05, hy - hh * 0.6); c.fill(); }
      c.beginPath(); c.moveTo(-hw / 2, hy - hh * 0.2); c.quadraticCurveTo(-hw * 0.45, hy - hh * 0.9, 0, hy - hh * 0.85);
      c.quadraticCurveTo(hw * 0.45, hy - hh * 0.9, hw / 2, hy - hh * 0.2); c.lineTo(hw * 0.3, hy + hh * 0.5); c.quadraticCurveTo(0, hy + hh * 0.75, -hw * 0.3, hy + hh * 0.5); c.closePath();
      c.fillStyle = bodyGrad(c, 0, hy, hw * 0.5, col); c.fill();
      c.strokeStyle = dark; c.lineWidth = w * 0.015; c.beginPath(); c.moveTo(0, hy - hh * 0.8); c.lineTo(0, hy + hh * 0.1); c.stroke();
      eyes(c, hw * 0.3, hy - hh * 0.3, hw * 0.09, A, col, hw * 0.15);
      ell(c, -hw * 0.07, hy + hh * 0.25, hw * 0.025, hh * 0.05); c.fillStyle = '#1b1208'; c.fill(); ell(c, hw * 0.07, hy + hh * 0.25, hw * 0.025, hh * 0.05); c.fill();
      mouth(c, 0, hy + hh * 0.5, hw * 0.62, A.jaw * h * 0.12, col, 7, hh * 0.3);
    });
  });
}

// ---------------- TRICERATOPS ----------------
function trike(c, w, h, A) {
  const col = '#5f86a8', frill = '#d9662b';
  part(c, 0, -h * 0.3, 0, -A.bob * h, 1, 0, () => { ell(c, 0, -h * 0.5, w * 0.44, h * 0.3); c.fillStyle = bodyGrad(c, 0, -h * 0.5, w * 0.44, col); c.fill(); });
  for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chân trước như cột: cào đất trước khi húc
    part(c, sd * w * 0.28, -h * 0.35, 0, -lift * h * 0.1, 1, sd * lift * 0.08, () => {
      c.beginPath(); c.moveTo(sd * w * 0.2, -h * 0.35); c.lineTo(sd * w * 0.36, -h * 0.35); c.lineTo(sd * w * 0.35, -h * 0.03); c.lineTo(sd * w * 0.21, -h * 0.03); c.closePath();
      c.fillStyle = bodyGrad(c, sd * w * 0.28, -h * 0.2, w * 0.12, col); c.fill();
      ell(c, sd * w * 0.28, -h * 0.03, w * 0.1, h * 0.04); c.fillStyle = shade(col, -0.35); c.fill();
      claws(c, sd * w * 0.28, -h * 0.02, w * 0.05, 3, '#e8e0cc');
    });
  }
  // ĐẦU + diềm: cúi xuống (headY > 0) chĩa sừng về phía người xem khi húc, hất lên khi hất sừng
  part(c, 0, -h * 0.4, A.headX * w, A.headY * h - A.bob * h, A.headS, A.headRot, () => {
    const fy = -h * 0.66, fr = w * 0.4, frh = h * 0.36;
    c.fillStyle = shade(frill, -0.3);
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (1.02 + i / 12 * 0.96); const x = Math.cos(a) * fr * 1.07, y = fy + Math.sin(a) * frh * 1.07; c.beginPath(); c.moveTo(x - fr * 0.05, y + frh * 0.03); c.lineTo(Math.cos(a) * fr * 1.2, fy + Math.sin(a) * frh * 1.2); c.lineTo(x + fr * 0.05, y + frh * 0.03); c.fill(); }
    ell(c, 0, fy, fr, frh); const g = c.createRadialGradient(0, fy, fr * 0.2, 0, fy, fr); g.addColorStop(0, '#f2c14e'); g.addColorStop(0.55, frill); g.addColorStop(1, shade(frill, -0.4)); c.fillStyle = g; c.fill();
    for (const sd of [-1, 1]) { ell(c, sd * fr * 0.55, fy - frh * 0.35, fr * 0.12, frh * 0.12); c.fillStyle = '#3b1a5a'; c.fill(); ell(c, sd * fr * 0.55, fy - frh * 0.35, fr * 0.06, frh * 0.06); c.fillStyle = '#ffe27a'; c.fill(); }
    const top = -h * 0.66, bot = -h * 0.16, fw = w * 0.34;
    c.beginPath(); c.moveTo(-fw / 2, top); c.quadraticCurveTo(0, top - h * 0.06, fw / 2, top);
    c.quadraticCurveTo(fw * 0.42, -h * 0.35, fw * 0.12, bot); c.quadraticCurveTo(0, bot + h * 0.04, -fw * 0.12, bot);
    c.quadraticCurveTo(-fw * 0.42, -h * 0.35, -fw / 2, top); c.closePath(); c.fillStyle = bodyGrad(c, 0, -h * 0.45, fw * 0.6, col); c.fill();
    c.beginPath(); c.moveTo(-fw * 0.16, -h * 0.25); c.quadraticCurveTo(0, -h * 0.2 + A.jaw * h * 0.05, fw * 0.16, -h * 0.25); c.lineTo(0, -h * 0.1); c.closePath(); c.fillStyle = '#3d3a36'; c.fill();
    if (A.jaw > 0.1) { ell(c, 0, -h * 0.2, fw * 0.08, A.jaw * h * 0.04); c.fillStyle = '#4a0d0d'; c.fill(); }
    c.beginPath(); c.moveTo(-fw * 0.07, -h * 0.33); c.lineTo(0, -h * 0.43); c.lineTo(fw * 0.07, -h * 0.33); c.closePath(); c.fillStyle = '#efe6cf'; c.fill();
    eyes(c, fw * 0.24, -h * 0.5, fw * 0.08, A, col, 0);
    for (const sd of [-1, 1]) {
      const hg = c.createLinearGradient(sd * fw * 0.2, -h * 0.56, sd * w * 0.27, -h * 0.98); hg.addColorStop(0, '#cdbf9c'); hg.addColorStop(1, '#fffaf0');
      c.beginPath(); c.moveTo(sd * fw * 0.1, -h * 0.58); c.quadraticCurveTo(sd * w * 0.12, -h * 0.85, sd * w * 0.27, -h * 0.98);
      c.quadraticCurveTo(sd * w * 0.18, -h * 0.75, sd * fw * 0.34, -h * 0.57); c.closePath(); c.fillStyle = hg; c.fill();
    }
  });
}

// ---------------- PTERODACTYL ----------------
function ptero(c, w, h, A) {
  const col = '#8a5bc4', mem = '#5e3c8f', flap = A.wing, span = 1 - 0.65 * A.wingFold;
  part(c, 0, -h * 0.55, 0, -A.bob * h, 1, 0, () => {
    for (const sd of [-1, 1]) { // cánh màng: vỗ (flap) và cụp lại khi bổ nhào (wingFold)
      const tipY = -h * (0.72 + flap * 0.16 - A.wingFold * 0.1), wristY = -h * (0.7 + flap * 0.08 - A.wingFold * 0.05);
      const wx = sd * w * 0.27 * span, tx = sd * w * 0.5 * span;
      c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.64); c.lineTo(wx, wristY); c.lineTo(tx, tipY);
      c.quadraticCurveTo(sd * w * 0.33 * span, -h * (0.5 + A.wingFold * 0.05), sd * w * 0.06, -h * 0.4); c.closePath();
      const g = c.createLinearGradient(0, -h * 0.7, tx, -h * 0.5); g.addColorStop(0, mem); g.addColorStop(1, shade(mem, 0.25)); c.fillStyle = g; c.fill();
      c.strokeStyle = shade(col, -0.3); c.lineWidth = w * 0.014; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sd * w * 0.05, -h * 0.64); c.lineTo(wx, wristY); c.lineTo(tx, tipY); c.stroke();
      c.lineWidth = w * 0.006; c.globalAlpha = 0.5;
      for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(wx, wristY); c.lineTo(sd * w * (0.27 + 0.06 * i) * span, -h * (0.52 + 0.02 * i)); c.stroke(); }
      c.globalAlpha = 1; claws(c, wx, wristY, w * 0.025, 3);
    }
    ell(c, 0, -h * 0.55, w * 0.075, h * 0.15); c.fillStyle = bodyGrad(c, 0, -h * 0.55, w * 0.08, col); c.fill();
    for (const [sd, lift] of [[-1, A.legL], [1, A.legR]]) { // chân quặp: duỗi móng ra khi vồ
      c.strokeStyle = col; c.lineWidth = w * 0.02; c.beginPath(); c.moveTo(sd * w * 0.03, -h * 0.42); c.lineTo(sd * w * (0.05 + lift * 0.04), -h * (0.33 - lift * 0.03)); c.stroke();
      claws(c, sd * w * (0.05 + lift * 0.04), -h * (0.33 - lift * 0.03), w * (0.02 + lift * 0.015), 3);
    }
    part(c, 0, -h * 0.7, A.headX * w, A.headY * h, A.headS, A.headRot, () => {
      const hy = -h * 0.76;
      c.beginPath(); c.moveTo(-w * 0.02, hy - h * 0.06); c.quadraticCurveTo(w * 0.01, hy - h * 0.25, w * 0.05, hy - h * 0.3); c.quadraticCurveTo(w * 0.04, hy - h * 0.15, w * 0.03, hy - h * 0.05); c.closePath();
      c.fillStyle = '#e8543b'; c.fill();
      ell(c, 0, hy, w * 0.065, h * 0.075); c.fillStyle = bodyGrad(c, 0, hy, w * 0.065, col); c.fill();
      // mỏ: 2 nửa tách ra khi há (jaw)
      const bg = c.createLinearGradient(0, hy, 0, hy + h * 0.2); bg.addColorStop(0, '#f2d27a'); bg.addColorStop(1, '#a8781e');
      for (const sd of [-1, 1]) {
        const o = sd * A.jaw * w * 0.018;
        c.beginPath(); c.moveTo(o, hy + h * 0.02); c.lineTo(sd * w * 0.035 + o, hy + h * 0.02); c.lineTo(o * 2, hy + h * 0.2); c.closePath(); c.fillStyle = bg; c.fill();
      }
      if (A.jaw > 0.1) { c.fillStyle = '#4a0d0d'; c.beginPath(); c.moveTo(-A.jaw * w * 0.016, hy + h * 0.03); c.lineTo(A.jaw * w * 0.016, hy + h * 0.03); c.lineTo(0, hy + h * 0.18); c.closePath(); c.fill(); }
      eyes(c, w * 0.035, hy - h * 0.015, w * 0.016, A, col, 0);
    });
  });
}

const DRAW = { trex, raptor, trike, ptero };

/** Vẽ 1 khủng long vào ctx tại khung B (gốc = giữa chân). A: tư thế (xem P0). */
export function drawDino(ctx, key, B, A) {
  A = { ...P0, ...A };
  ctx.save();
  ctx.translate(B.x, B.y);
  if (A.crouch) ctx.scale(1 + A.crouch * 0.04, 1 - A.crouch * 0.08);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ell(ctx, 0, key === 'ptero' ? B.h * 0.25 : 0, B.w * 0.36, B.h * 0.045); ctx.fill();
  DRAW[key](ctx, B.w, B.h, A);
  ctx.restore();
}

// ---------------- Biên đạo động tác ----------------
const clamp01 = x => Math.max(0, Math.min(1, x));
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);
const easeIn = x => Math.pow(clamp01(x), 2);
const easeInOut = x => { x = clamp01(x); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
/** Đường cong 0 → 1 → 0: lên trong [a,b], giữ tới c, về 0 tại d. */
const env = (x, a, b, c, d) => (x <= a || x >= d ? 0 : x < b ? easeOut((x - a) / (b - a)) : x <= c ? 1 : 1 - easeInOut((x - c) / (d - c)));
export const STRIKE_LEAD = 0.22; // động tác ra đòn bắt đầu trước thời điểm trúng 0,22 s → hình "chạm" đúng lúc chốt né/đỡ

/**
 * Tư thế từng bộ phận + biến đổi toàn thân theo giai đoạn (đi tới / chờ / gồng / ra đòn / thu về / choáng / gục).
 * @returns { A, sx, ox, oy, rot, focusV (điểm phóng to theo chiều cao 0..1), shake, stomp (vừa dậm chân) }
 */
export function dinoPose(d, clock, t, W, H) {
  const key = d.key, A = { ...P0, t };
  let sx = 1, ox = 0, oy = 0, rot = 0, focusV = 0.6, shake = 0, stomp = false;
  // nền: thở, đảo mắt, đuôi ve vẩy, cánh vỗ
  A.bob = Math.sin(t * 2.2) * 0.008; A.look = Math.sin(t * 0.7) * 0.4; A.tail = Math.sin(t * 1.4) * 0.35;
  A.headRot = Math.sin(t * 0.9) * 0.04; A.jaw = 0.12 + 0.08 * Math.max(0, Math.sin(t * 0.8)) ** 8 * 6; // thỉnh thoảng nhe răng
  A.wing = Math.sin(t * 6); A.armL = A.armR = Math.sin(t * 1.7) * 0.08;
  const walk = (speed, liftAmt = 1) => { // chu kỳ bước: 2 chân luân phiên, thân nhún, đầu gật
    const ph = t * speed, s = Math.sin(ph);
    A.legL = Math.max(0, s) * liftAmt; A.legR = Math.max(0, -s) * liftAmt;
    A.bob = Math.abs(s) * 0.025; A.headY = Math.abs(s) * 0.012; A.headRot = s * 0.05; A.tail = -s * 0.5;
    stomp = Math.abs(s) < 0.12;
  };
  const dir = d.attack?.dir || 0, kind = d.attack?.kind;
  if (d.phase === 'enter') {
    walk(key === 'raptor' ? 9 : key === 'trike' ? 5 : 6.5);
    if (key === 'ptero') { A.wing = Math.sin(t * 9); A.legL = A.legR = 0; A.bob = Math.sin(t * 9) * 0.02; }
  } else if (d.phase === 'counter') { // choáng: đầu gục, lảo đảo, mắt nheo, hàm trễ
    A.headY = 0.05; A.headRot = Math.sin(t * 7) * 0.18; A.headX = Math.sin(t * 5) * 0.03; A.jaw = 0.55; A.squint = 0.8; A.wing = Math.sin(t * 3) * 0.4;
    rot = Math.sin(t * 5) * 0.04; A.tail = 0; A.armL = A.armR = -0.3;
  } else if (d.phase === 'down') { // gục: khuỵu chân, nghiêng đổ, đầu rũ
    const k = easeInOut(d.t / 1.2);
    A.crouch = k; A.headY = 0.1 * k; A.headRot = 0.5 * k; A.jaw = 0.7; A.squint = 1; A.wingFold = k; A.wing = -k;
    rot = 0.85 * k * (key === 'ptero' ? -1 : 1); oy = H * 0.06 * k;
  }

  // gồng đòn (k: 0 → 1) rồi ra đòn (s: thời gian kể từ lúc bắt đầu vung, chạm tại STRIKE_LEAD)
  let k = -1, s = -1;
  if (d.phase === 'windup') { const rem = d.windup - d.t; if (rem > STRIKE_LEAD) k = clamp01(d.t / (d.windup - STRIKE_LEAD)); else { k = 1; s = STRIKE_LEAD - rem; } }
  else if (d.hitAt != null && clock - d.hitAt < 1.2 && ['attack', 'recover', 'counter'].includes(d.phase)) s = STRIKE_LEAD + (clock - d.hitAt);
  if (k >= 0 || s >= 0) {
    A.glow = d.phase === 'windup' || d.phase === 'attack' ? 1 : 0;
    const w = k >= 0 ? easeInOut(k) : 1;                                // lấy đà
    const tr = Math.sin(t * 40) * 0.5 + 0.5;                             // run bần bật khi gồng
    const L = s >= 0 ? env(s, 0, STRIKE_LEAD, STRIKE_LEAD + 0.12, 0.95) : 0; // lao tới → giữ → thu về
    const hitBack = d.phase === 'counter' ? 1 : 0;
    switch (kind) {
      case 'bite': { // ngửa đầu, há dần, nghiêng sang bên → phóng đầu sang phía người chơi đứng, ĐỚP khép hàm
        // lấy đà: ngả đầu ra sau & sang phía ngược lại, run bần bật → lao tới + hạ đầu xuống ngang mặt người chơi
        A.headY = -0.12 * w * (1 - L) + 0.2 * L; A.headX = dir * 0.06 * w * (1 - L) - dir * 0.32 * L; A.headRot = (dir * 0.3 * w + Math.sin(t * 25) * 0.04 * w) * (1 - L);
        A.headS = 1 - 0.12 * w + 1.6 * L; A.jaw = s < 0 ? 0.25 + 0.6 * w + tr * 0.05 : s < STRIKE_LEAD - 0.03 ? 1 : 1 - easeOut((s - STRIKE_LEAD + 0.03) / 0.08) * 0.95;
        A.armL = A.armR = 0.5 * w; A.legL = key === 'raptor' ? 0.4 * w : 0; A.tail = dir * 0.8 * w; A.crouch = 0.4 * w * (1 - L);
        sx = 1 - 0.06 * w * (1 - L) + 0.12 * L; ox = dir * W * 0.04 * w * (1 - L) - dir * W * 0.05 * L; oy = -H * 0.02 * w * (1 - L); focusV = 0.85;
        if (hitBack) { A.headX *= 0.3; A.headS = 1 + 0.2 * (1 - L); }
        break;
      }
      case 'charge': { // cúi đầu chĩa sừng, chân cào đất, khịt → lao cả thân sang bên
        A.headY = 0.1 * w; A.headS = 1 + 0.12 * w + 0.3 * L; A.jaw = 0.3 * w + 0.2 * Math.max(0, Math.sin(t * 9)) * w * (1 - L); A.headRot = Math.sin(t * 9) * 0.06 * w * (1 - L);
        const paw = s < 0 ? Math.max(0, Math.sin(t * 11)) * Math.min(1, w * 1.6) : 0;
        A.legL = -dir < 0 ? paw : 0; A.legR = -dir > 0 ? paw : 0; stomp = s < 0 && paw < 0.1 && w > 0.3;
        if (s >= 0) { const g = Math.sin(t * 20); A.legL = Math.max(0, g); A.legR = Math.max(0, -g); A.bob = Math.abs(g) * 0.03; }
        sx = 1 + 0.65 * L; ox = dir * W * 0.04 * w * (1 - L) - dir * W * 0.3 * L; oy = H * 0.05 * L; focusV = 0.5; A.crouch = 0.6 * w * (1 - L);
        break;
      }
      case 'toss': { // cúi sát đất rồi HẤT sừng lên
        A.headY = 0.14 * w * (1 - L) - 0.16 * L; A.headRot = 0.16 * Math.sin(t * 12) * w * (1 - L) - 0.1 * L; A.headS = 1 + 0.15 * w + 0.5 * L;
        A.jaw = 0.5 * L; sx = 1 + 0.35 * L; oy = -H * 0.06 * L; focusV = 0.5; A.crouch = 0.7 * w * (1 - L);
        break;
      }
      case 'pounce': { // hạ thấp người, giương móng → BẬT nhảy vồ thẳng vào mặt
        A.crouch = w * (1 - L); A.armL = A.armR = 0.9 * w + 0.4 * L; ox = Math.sin(t * 16) * W * 0.012 * w * (1 - L); A.jaw = 0.4 * w + 0.6 * L; A.tail = -0.9 * w;
        A.legL = A.legR = L; A.headS = 1 + 0.3 * L;
        sx = 1 - 0.05 * w * (1 - L) + 1.0 * L; oy = H * 0.03 * w * (1 - L) + H * 0.1 * L; focusV = 0.86; // bật lên, mặt lao thẳng vào giữa màn hình
        break;
      }
      case 'dive': { // bay vọt lên, xoè cánh hết cỡ → cụp cánh BỔ NHÀO xuống mặt
        A.wing = s < 0 ? Math.sin(t * 14) * 0.6 + 0.4 * w : -0.6; A.wingFold = L; A.jaw = 0.3 * w + 0.7 * L; A.legL = A.legR = L;
        A.headS = 1 + 0.4 * L; sx = 1 + 1.3 * L; oy = -H * 0.14 * w * (1 - L) + H * 0.05 * L; focusV = 0.65;
        break;
      }
      case 'rocks': { // vỗ cánh mạnh, giật đầu mỗi lần ném
        A.wing = Math.sin(t * 16); const flick = s >= 0 ? Math.max(0, Math.sin((s - STRIKE_LEAD) * 9)) : 0;
        A.headY = 0.04 * flick; A.headS = 1 + 0.25 * flick; A.jaw = 0.4 + 0.5 * flick; oy = -H * 0.04 * w;
        break;
      }
      case 'roar': { // ngửa cổ hít hơi, phình ngực → chồm đầu tới GẦM, há hết cỡ
        A.headY = -0.15 * w * (1 - L) + 0.08 * L; A.headRot = Math.sin(t * 30) * 0.03 * L; A.headS = 1 - 0.12 * w + 0.6 * L;
        A.jaw = s < 0 ? 0.2 + 0.4 * w : 1; A.armL = A.armR = 0.6 * w; A.tail = 0.6 * Math.sin(t * 8) * w; A.bob = 0.02 * w;
        sx = 1 + 0.06 * w + 0.08 * L; oy = -H * 0.03 * w * (1 - L); focusV = 0.85; A.armL = A.armR = 0.9 * w; shake = s >= STRIKE_LEAD ? 14 * (1 - clamp01((s - STRIKE_LEAD) / 0.6)) : 2 * w;
        break;
      }
      case 'tail': { // xoay người lấy đà, đuôi vung rộng → XOAY quật đuôi
        A.tail = -1 * w + 2 * L; A.headX = 0.06 * w * (1 - L) - 0.08 * L; A.headRot = 0.15 * w - 0.3 * L; A.jaw = 0.3 * w;
        rot = 0.22 * w - 0.4 * L; ox = W * 0.03 * w - W * 0.05 * L; A.legL = 0.4 * w * (1 - L);
        break;
      }
    }
    if (hitBack && L > 0) A.squint = 0.5;
  }
  if (d.recoil) { A.headRot += 0.25 * d.recoil * (d.recoil > 0.5 ? 1 : -1); A.headY -= 0.03 * d.recoil; A.jaw = Math.max(A.jaw, 0.7 * d.recoil); A.squint = Math.max(A.squint, d.recoil); sx *= 1 - 0.04 * d.recoil; }
  if (key === 'ptero' && d.phase !== 'down') { A.legL = Math.max(A.legL, 0); A.legR = Math.max(A.legR, 0); }
  return { A, sx, ox, oy, rot, focusV, shake, stomp };
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
