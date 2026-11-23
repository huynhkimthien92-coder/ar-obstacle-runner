// node --test tests/  — kiểm thử nhận diện động tác bằng landmark giả lập (không cần camera)
import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionTracker } from '../js/motion.js';

const W = 400, H = 800;
/** Tạo 33 landmark của một người đứng: tâm hông (cx, hipY), thân dài torso px. */
function body({ cx = 200, hipY = 520, torso = 160, handsUp = false, feet = true } = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: cx, y: hipY, v: 0.99 }));
  const shY = hipY - torso;
  const set = (i, x, y, v = 0.99) => { pts[i] = { x, y, v }; };
  set(0, cx, shY - torso * 0.45);                         // mũi
  set(11, cx + 40, shY); set(12, cx - 40, shY);           // vai
  set(23, cx + 25, hipY); set(24, cx - 25, hipY);         // hông
  set(15, cx + 60, handsUp ? shY - torso * 0.8 : hipY - 10); set(16, cx - 60, handsUp ? shY - torso * 0.8 : hipY - 10);
  const ankleY = hipY + torso * 1.5;
  set(27, cx + 25, ankleY, feet ? 0.99 : 0.1); set(28, cx - 25, ankleY, feet ? 0.99 : 0.1);
  const raw = pts.map(p => ({ x: p.x / W, y: p.y / H, v: p.v }));
  return [pts, raw];
}

function calibrated() {
  const m = new MotionTracker();
  m.beginCalibration();
  let t = 0;
  for (let i = 0; i < 40; i++) { const [p, r] = body(); m.update(p, r, W, H, (t += 33)); }
  return [m, t];
}

test('hiệu chỉnh xong sau khi đứng yên', () => {
  const [m] = calibrated();
  assert.equal(m.state.calibrated, true);
  assert.equal(m.state.distance.hint, 'ok');
});

test('nhảy: hông nâng 25% thân → airborne, hạ xuống → hết', () => {
  let [m, t] = calibrated();
  let [p, r] = body({ hipY: 520 - 160 * 0.25 });
  m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.airborne, true);
  [p, r] = body(); m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.airborne, false);
});

test('rung nhẹ 5% thân không bị tính là nhảy', () => {
  let [m, t] = calibrated();
  for (let i = 0; i < 30; i++) { const [p, r] = body({ hipY: 520 + Math.sin(i) * 8 }); m.update(p, r, W, H, (t += 33)); }
  assert.equal(m.state.airborne, false);
  assert.equal(m.state.ducking, false);
});

test('ngồi: vai hạ 35% thân → ducking', () => {
  let [m, t] = calibrated();
  // ngồi xổm: hông hạ 30%, thân ngắn lại → vai hạ ~35%
  const [p, r] = body({ hipY: 520 + 48, torso: 160 - 8 });
  m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.ducking, true);
  assert.equal(m.state.airborne, false);
});

test('đổi làn theo vị trí hông, có trễ ở ranh giới', () => {
  let [m, t] = calibrated();
  const step = cx => { const [p, r] = body({ cx }); m.update(p, r, W, H, (t += 33)); return m.state.lane; };
  assert.equal(step(200), 1);
  assert.equal(step(W / 3 - 5), 1);   // trong vùng trễ → giữ làn giữa
  assert.equal(step(W / 3 - 30), 0);  // qua hẳn → làn trái
  assert.equal(step(W / 3 + 5), 0);   // quay lại sát ranh giới → vẫn trái
  assert.equal(step(350), 2);
});

test('giơ 2 tay', () => {
  let [m, t] = calibrated();
  const [p, r] = body({ handsUp: true }); m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.handsUp, true);
});

test('không thấy chân → gợi ý lùi xa', () => {
  const m = new MotionTracker();
  const [p, r] = body({ feet: false }); m.update(p, r, W, H, 0);
  assert.equal(m.state.distance.hint, 'farther');
});

test('baseline trôi (người tiến/lùi chậm) không gây nhảy giả', () => {
  let [m, t] = calibrated();
  for (let i = 0; i < 300; i++) { const [p, r] = body({ hipY: 520 - i * 0.15 }); m.update(p, r, W, H, (t += 33)); }
  assert.equal(m.state.airborne, false, 'hông đi lên chậm 45px trong 10s phải được baseline hấp thụ');
});

test('trạng thái "nhảy" kéo dài bất thường → tự hiệu chỉnh lại', () => {
  let [m, t] = calibrated();
  for (let i = 0; i < 60; i++) { const [p, r] = body({ hipY: 470 }); m.update(p, r, W, H, (t += 33)); }
  assert.equal(m.state.airborne, false);
});

/** Người đứng gần: chỉ thấy đầu + vai (hông ở ngoài khung). */
function upper({ cx = 200, shY = 500, shW = 120 } = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: cx, y: H + 200, v: 0.05 }));
  const set = (i, x, y, v = 0.99) => { pts[i] = { x, y, v }; };
  set(0, cx, shY - shW * 0.9);
  set(11, cx + shW / 2, shY); set(12, cx - shW / 2, shY);
  set(15, cx + 70, shY + 160, 0.6); set(16, cx - 70, shY + 160, 0.6);
  const raw = pts.map(p => ({ x: p.x / W, y: p.y / H, v: p.v }));
  return [pts, raw];
}

test('đứng gần, không thấy hông: vẫn hiệu chỉnh, nhảy và ngồi được theo vai', () => {
  const m = new MotionTracker(); m.mode = 'near';
  m.beginCalibration();
  let t = 0;
  for (let i = 0; i < 40; i++) { const [p, r] = upper(); m.update(p, r, W, H, (t += 33)); }
  assert.equal(m.state.calibrated, true);
  assert.equal(m.state.hipsSeen, false);
  assert.equal(m.state.distance.hint, 'ok'); // vai rộng 120/400 = 0.3 khung
  let [p, r] = upper({ shY: 500 - 0.25 * 168 }); m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.airborne, true, 'vai nâng 25% thân ước lượng → nhảy');
  [p, r] = upper(); m.update(p, r, W, H, (t += 33));
  [p, r] = upper({ shY: 500 + 0.35 * 168 }); m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.ducking, true, 'vai hạ 35% → ngồi');
});

test('đứng gần: quá gần / quá xa được nhắc đúng', () => {
  const m = new MotionTracker(); m.mode = 'near';
  let [p, r] = upper({ shW: 240 }); m.update(p, r, W, H, 0);
  assert.equal(m.state.distance.hint, 'farther');
  [p, r] = upper({ shW: 40 }); m.update(p, r, W, H, 33);
  assert.equal(m.state.distance.hint, 'closer');
});

test('mất dấu < 0.6s: giữ nguyên trạng thái; lâu hơn mới tính mất người', () => {
  let [m, t] = calibrated();
  let [p, r] = body({ hipY: 520 - 160 * 0.25 }); m.update(p, r, W, H, (t += 33));
  assert.equal(m.state.airborne, true);
  m.update(null, null, W, H, (t += 300));
  assert.equal(m.state.present, true); assert.equal(m.state.coasting, true);
  assert.equal(m.state.airborne, true, 'đang nhảy mà mờ hình → vẫn tính đang nhảy');
  m.update(null, null, W, H, (t += 500));
  assert.equal(m.state.present, false);
});
