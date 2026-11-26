// Lọc "người giả": khung xương phải giống người, và phải xuất hiện ổn định mới tính.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plausiblePerson, keepPerson, PresenceGate } from '../js/personcheck.js';

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

test('người ĐANG chơi mà mặt mờ (cúi, xoay lưng, giơ tay che mặt) → vẫn giữ; người MỚI mặt mờ → chưa nhận', () => {
  const noFace = () => { const lm = person({ face: 0.1 }); lm[0].v = 0.1; return lm; };
  assert.equal(plausiblePerson(noFace(), AR).ok, false); // kiểm tra chặt: loại
  assert.equal(keepPerson(noFace(), AR).ok, true);       // kiểm tra dễ: giữ
  // người mới chỉ có khung mặt mờ: cổng không bao giờ xác nhận
  const g0 = new PresenceGate(); let got = null;
  for (let t = 0; t <= 2000; t += 66) got = g0.update(noFace(), t, AR, false) || got;
  assert.equal(got, null);
  // đã chơi rồi: 3 giây liền mặt mờ vẫn bám, không rớt khung nào
  const g = new PresenceGate();
  for (let t = 0; t <= 600; t += 66) g.update(person(), t, AR, true);
  let lost = 0;
  for (let t = 666; t <= 3600; t += 66) if (!g.update(noFace(), t, AR, false)) lost++;
  assert.equal(lost, 0);
});

test('mất dấu ngắn (ra khỏi khung 2 s) rồi quay lại gần chỗ cũ → nhận lại ngay, không chờ 0,45 s', () => {
  const g = new PresenceGate();
  for (let t = 0; t <= 600; t += 66) g.update(person(), t, AR, true);
  for (let t = 666; t <= 2600; t += 66) g.update(null, t, AR);
  const lm = person({ cx: 0.55 }); lm[0].v = 0.2; // quay lại, mặt chưa rõ hẳn
  assert.ok(g.update(lm, 2666, AR, false));
});

test('mất dấu quá lâu (> 3 s) thì phải rõ mặt + đứng ổn định lại mới nhận (chặn đồ vật)', () => {
  const g = new PresenceGate();
  for (let t = 0; t <= 600; t += 66) g.update(person(), t, AR, true);
  for (let t = 666; t <= 4500; t += 66) g.update(null, t, AR);
  assert.equal(g.update(person(), 4566, AR, true), null);
  let got = null; for (let t = 4632; t <= 5200; t += 66) got = g.update(person(), t, AR, true) || got;
  assert.ok(got);
});

test('kiểm tra dễ vẫn loại thứ không phải người (không thấy vai / quá nhỏ)', () => {
  const lm = person(); lm[11].v = 0.1; lm[12].v = 0.1; lm[23].v = 0.1;
  assert.equal(keepPerson(lm, AR).ok, false);
  assert.equal(keepPerson(person({ sw: 0.004 }), AR).ok, false);
});

test('người vừa đi khỏi, đồ vật đứng đúng chỗ đó (không bao giờ rõ mặt) → tối đa 10 s là bị bỏ', () => {
  const g = new PresenceGate();
  for (let t = 0; t <= 600; t += 66) g.update(person(), t, AR, true);
  const obj = () => { const lm = person({ face: 0.1 }); lm[0].v = 0.1; return lm; };
  let last = null; for (let t = 666; t <= 12000; t += 66) last = g.update(obj(), t, AR, false);
  assert.equal(last, null);
});
