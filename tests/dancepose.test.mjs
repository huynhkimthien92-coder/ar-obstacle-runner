import test from 'node:test';
import assert from 'node:assert/strict';
import { DancePoseDetector, armClass, armAngle, bodyScale } from '../js/dancepose.js';

// Người đứng chính diện trên màn hình 1280×720: vai cách 100 px, thân 160 px. Tay trên 70 px, cẳng tay 65 px.
function body({ l = 0, r = 0, le = 0, re = 0, dx = 0, s = 1 } = {}) { // l/r: góc tay (độ, 0 = buông, 90 = ngang, 180 = giơ) bên trái / phải màn hình
  const P = Array.from({ length: 33 }, () => ({ x: 640, y: 300, v: 0.95 }));
  const cx = 640 + dx, sy = 300;
  P[0] = { x: cx, y: sy - 70 * s, v: 0.99 };
  P[11] = { x: cx - 50 * s, y: sy, v: 0.99 }; P[12] = { x: cx + 50 * s, y: sy, v: 0.99 }; // 11 = trái màn hình (đã lật gương)
  P[23] = { x: cx - 35 * s, y: sy + 160 * s, v: 0.99 }; P[24] = { x: cx + 35 * s, y: sy + 160 * s, v: 0.99 };
  const arm = (sh, el, wr, ang, bend, side) => {
    const a = ang * Math.PI / 180, b = (ang + bend) * Math.PI / 180, S = P[sh];
    P[el] = { x: S.x + side * Math.sin(a) * 70 * s, y: S.y + Math.cos(a) * 70 * s, v: 0.95 };
    P[wr] = { x: P[el].x + side * Math.sin(b) * 65 * s, y: P[el].y + Math.cos(b) * 65 * s, v: 0.95 };
    for (const k of side < 0 ? [17, 19, 21] : [18, 20, 22]) P[k] = { x: P[wr].x, y: P[wr].y + 8 * s, v: 0.9 };
  };
  arm(11, 13, 15, l, le, -1); arm(12, 14, 16, r, re, 1);
  return P;
}
const run = (det, P, n = 3, duck = false) => { let r; for (let i = 0; i < n; i++) r = det.update(P, duck); return r; };

test('6 động tác cơ bản', () => {
  const d = new DancePoseDetector();
  assert.equal(run(d, body({ l: 90, r: 10 })), 'L');
  assert.equal(run(d, body({ l: 10, r: 90 })), 'R');
  assert.equal(run(d, body({ l: 150, r: 10 })), 'UL');
  assert.equal(run(d, body({ l: 10, r: 150 })), 'UR');
  assert.equal(run(d, body({ l: 170, r: 175 })), 'UP');
  assert.equal(run(d, body({ l: 10, r: 10 }), 3, true), 'DN');
  assert.equal(run(d, body({ l: 10, r: 10 })), null);
});

test('giơ 2 tay hơi chụm vào giữa đầu vẫn là UP; dang tay hơi chếch lên/xuống vẫn là L/R', () => {
  const d = new DancePoseDetector();
  assert.equal(run(d, body({ l: 200, r: 195 })), 'UP');
  assert.equal(run(d, body({ l: 70, r: 5 })), 'L');
  assert.equal(run(d, body({ l: 115, r: 5 })), 'L');
});

test('tay co (không duỗi) lúc dang ngang thì không tính L', () => {
  const d = new DancePoseDetector();
  assert.notEqual(run(d, body({ l: 90, le: 150, r: 5 })), 'L');
});

test('cổ tay ra khỏi khung (mờ) khi giơ cao → dùng khuỷu tay', () => {
  const d = new DancePoseDetector(), P = body({ l: 170, r: 172 });
  P[15].v = 0.1; P[16].v = 0.1; P[19].v = P[20].v = P[17].v = P[18].v = 0.1;
  assert.equal(run(d, P), 'UP');
});

test('trễ: dao động quanh ranh giới không làm tư thế chớp', () => {
  const d = new DancePoseDetector(); run(d, body({ l: 90, r: 5 }));
  const seq = [60, 54, 61, 53, 59, 55].map(a => d.update(body({ l: a, r: 5 }), false));
  assert.ok(seq.every(x => x === 'L'), seq.join());
});

test('đứng nghiêng (vai hẹp lại) vẫn nhận đúng nhờ thước theo thân', () => {
  const d = new DancePoseDetector(), P = body({ l: 90, r: 8 });
  P[11].x += 30; P[12].x -= 30; // vai còn 40 px
  assert.equal(run(d, P), 'L');
  assert.ok(bodyScale(P).s >= 0.55 * 159);
});

test('khung hình đơn lẻ nhiễu không đổi tư thế (cần ổn định 2 khung)', () => {
  const d = new DancePoseDetector(); run(d, body({ l: 170, r: 172 }));
  assert.equal(d.update(body({ l: 90, r: 5 }), false), 'UP');
  assert.equal(d.update(body({ l: 170, r: 172 }), false), 'UP');
});

test('vỗ tay: chạm tay → 1 lần, giữ chạm không đếm thêm, mở ra rồi vỗ lại → lần 2', () => {
  const d = new DancePoseDetector(); const out = [];
  const frames = [[40, 40], [25, 25], [8, 8], [8, 8], [8, 8], [40, 40], [60, 60], [40, 40], [8, 8]];
  // góc lệch so với giữa: hai tay giơ trước ngực, khoảng cách = 2*x
  frames.forEach(([a], i) => {
    const P = body({ l: 30, r: 30 }); const y = 360;
    P[15] = { x: 640 - a, y, v: 0.95 }; P[16] = { x: 640 + a, y, v: 0.95 }; P[19] = { ...P[15] }; P[20] = { ...P[16] }; P[17] = { ...P[15] }; P[18] = { ...P[16] };
    const r = d.clap(P, i * 33); if (r != null) out.push(r);
  });
  assert.equal(out.length, 2, JSON.stringify(out));
  assert.equal(out[0], 2 * 33);
});

test('vỗ tay rất nhanh (2 tay chưa kịp sát nhau trong khung nào) vẫn bắt được, mốc = khung gần nhất', () => {
  const d = new DancePoseDetector(); const out = [];
  [80, 75, 30, 72, 80].forEach((a, i) => {
    const P = body({ l: 30, r: 30 });
    P[15] = { x: 640 - a, y: 360, v: 0.95 }; P[16] = { x: 640 + a, y: 360, v: 0.95 }; for (const k of [17, 19]) P[k] = { ...P[15] }; for (const k of [18, 20]) P[k] = { ...P[16] };
    const r = d.clap(P, i * 33); if (r != null) out.push(r);
  });
  assert.deepEqual(out, [66]);
});

test('tay buông 2 bên hông không bị tính là vỗ tay', () => {
  const d = new DancePoseDetector(); let n = 0;
  for (let i = 0; i < 20; i++) if (d.clap(body({ l: 5, r: 5 }), i * 33) != null) n++;
  assert.equal(n, 0);
});

test('dang cả 2 tay = T (máy bay)', () => {
  const d = new DancePoseDetector();
  assert.equal(run(d, body({ l: 90, r: 95 })), 'T');
});
