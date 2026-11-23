// Lọc "người giả": khung xương phải giống người, và phải xuất hiện ổn định mới tính.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plausiblePerson, PresenceGate } from '../js/personcheck.js';

const AR = 16 / 9;
/** Người đứng thẳng nhìn camera, toạ độ chuẩn hoá. cx/cy = giữa vai; sw = nửa bề rộng vai theo bề ngang khung. */
function person({ cx = 0.5, cy = 0.35, sw = 0.05, v = 0.95, face = 0.9 } = {}) {
  const shPx = sw * 2 * AR; // bề rộng vai theo đơn vị chiều cao khung
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: cy + 0.3, v: 0.2 }));
  const set = (i, x, y, vv = v) => { lm[i] = { x, y, v: vv }; };
  set(0, cx, cy - shPx * 0.6);
  for (let i = 1; i <= 10; i++) set(i, cx + ((i % 2) - 0.5) * sw * 0.6, cy - shPx * 0.65, face);
  set(11, cx + sw, cy); set(12, cx - sw, cy);
  set(13, cx + sw * 1.2, cy + shPx * 0.8); set(14, cx - sw * 1.2, cy + shPx * 0.8);
  set(23, cx + sw * 0.6, cy + shPx * 1.6); set(24, cx - sw * 0.6, cy + shPx * 1.6);
  return lm;
}

test('người thật đứng thẳng → hợp lệ', () => {
  assert.equal(plausiblePerson(person(), AR).ok, true);
  assert.equal(plausiblePerson(person({ sw: 0.02 }), AR).ok, true); // đứng xa
});

test('mặt / vai mờ (đồ vật) → loại', () => {
  assert.equal(plausiblePerson(person({ v: 0.4 }), AR).ok, false);
  assert.equal(plausiblePerson(person({ face: 0.2 }), AR).ok, false);
});

test('đầu nằm dưới vai / thân sai tỉ lệ → loại', () => {
  const a = person(); a[0] = { ...a[0], y: 0.5 };
  assert.equal(plausiblePerson(a, AR).ok, false);
  const b = person(); b[23] = { ...b[23], y: 0.36 }; b[24] = { ...b[24], y: 0.36 };
  assert.equal(plausiblePerson(b, AR).ok, false);
  const c = person(); c[23] = { ...c[23], x: 0.8 }; c[24] = { ...c[24], x: 0.2 }; // hông rộng gấp 6 lần vai
  assert.equal(plausiblePerson(c, AR).ok, false);
});

test('có mặt nạ: ngoài vùng người → loại, trong vùng người → giữ', () => {
  const w = 64, h = 36, empty = { w, h, data: new Float32Array(w * h).fill(0.1) }, full = { w, h, data: new Float32Array(w * h).fill(0.9) };
  assert.equal(plausiblePerson(person(), AR, empty).ok, false);
  assert.equal(plausiblePerson(person(), AR, full).ok, true);
});

test('cổng xác nhận: lóe lên ngắn không tính; đứng ổn định 0,45 s mới tính', () => {
  const g = new PresenceGate(), lm = person();
  const at = (t0, t1, x) => { let r = null; for (let t = t0; t <= t1; t += 100) r = g.update(x, t, AR); return r; };
  assert.equal(at(0, 200, lm), null);        // lóe lên 0,2 s
  assert.equal(at(300, 1000, null), null);   // biến mất lâu → làm lại
  assert.equal(at(1100, 1400, lm), null);    // mới 0,3 s
  assert.ok(at(1500, 1600, lm));             // 0,5 s liên tục → có người
  assert.equal(at(1700, 1900, null), null);  // khuất ngắn
  assert.ok(at(2000, 2000, lm));             // quay lại ngay vẫn được tính, không phải chờ
});

test('cổng xác nhận: khung xương rung loạn (đồ vật) → không tính', () => {
  const g = new PresenceGate();
  let got = null;
  for (let t = 0; t <= 2000; t += 66) got = g.update(person({ cx: 0.3 + ((t / 66) % 2) * 0.3 }), t, AR) || got;
  assert.equal(got, null);
});

test('máy chậm (nhận diện 2 lần/giây) vẫn xác nhận được người thật', () => {
  const g = new PresenceGate(); let got = null;
  for (let t = 0; t <= 3000; t += 500) got = g.update(person(), t, AR) || got;
  assert.ok(got);
});
