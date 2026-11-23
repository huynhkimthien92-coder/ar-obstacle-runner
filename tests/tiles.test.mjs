// Kiểm thử game "Ô an toàn" + bộ theo dõi nhiều người
import test from 'node:test';
import assert from 'node:assert/strict';
import { TileGame, TileGeom } from '../js/tiles.js';
import { PlayerTracker } from '../js/players.js';

const DT = 1 / 30;

test('lưới ô: tâm mỗi ô tra ngược đúng về chính ô đó (3 hàng × 4 cột và dải 1 hàng)', () => {
  for (const [rows, cols] of [[3, 4], [1, 3]]) {
    const g = new TileGeom(1280, 720, rows, cols, 600);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ce = g.center(r, c);
      assert.deepEqual(g.locate(ce.x, ce.y), { r, c });
    }
    assert.deepEqual(g.locate(-500, 99999), { r: rows - 1, c: 0 }, 'ngoài lưới → kẹp vào ô mép');
  }
});

/** Chạy ván; policy(tg, pos) quyết định vị trí từng người mỗi frame. */
function run(ids, policy, maxSec = 600, seed = 7) {
  const tg = new TileGame({ rows: 3, cols: 4, seed });
  const pos = new Map(ids.map(id => [id, { r: 1, c: 1 }]));
  tg.start(ids);
  let t = 0;
  for (let i = 0; i < maxSec / DT && !tg.over; i++) { t += DT * 1000; policy(tg, pos); tg.update(DT, t, pos); tg.drain(); }
  return tg;
}
const smart = (tg, pos) => { // trong lúc di chuyển: mỗi người tìm 1 ô xanh còn trống
  if (tg.phase !== 'move') return;
  const taken = new Set();
  for (const [id, q] of pos) {
    if (tg.colorAt(q.r, q.c) === 'g' && !taken.has(`${q.r},${q.c}`)) { taken.add(`${q.r},${q.c}`); continue; }
    for (let r = 0; r < tg.rows; r++) for (let c = 0; c < tg.cols; c++) {
      if (tg.colorAt(r, c) === 'g' && !taken.has(`${r},${c}`)) { pos.set(id, { r, c }); taken.add(`${r},${c}`); r = 99; break; }
    }
  }
};

test('1 người luôn tìm ô xanh: sống qua 25 vòng; đứng im thì sớm thua', () => {
  const g1 = run(['a'], smart, 200);
  assert.equal(g1.over, false); assert.ok(g1.roster[0].survived >= 25, `qua ${g1.roster[0].survived} vòng`);
  assert.equal(g1.roster[0].lives, 3);
  const g2 = run(['a'], () => {}, 200);
  assert.equal(g2.over, true); assert.ok(g2.score < 10, `đứng im mà qua ${g2.score} vòng`);
});

test('luôn đủ ô xanh cho mọi người còn sống, kể cả vòng khó', () => {
  const tg = new TileGame({ rows: 3, cols: 4, seed: 3 });
  tg.start([1, 2, 3, 4]);
  for (let r = 1; r <= 40; r++) { tg.round = r; tg._pattern([0, 1, 2, 3]); assert.ok(tg.tiles.filter(x => x === 'g').length >= 4, `vòng ${r}`); }
});

test('nhiều người: ai đứng im bị loại, người tìm ô xanh thắng', () => {
  const tg = run([1, 2], (tg, pos) => { const keep = pos.get(2); smart(tg, pos); pos.set(2, keep); });
  assert.equal(tg.over, true); assert.equal(tg.winner, 1);
  assert.equal(tg.roster.find(p => p.id === 2).alive, false);
});

test('không thấy người lúc hết giờ = không đứng trên ô xanh', () => {
  const tg = new TileGame({ rows: 1, cols: 3, seed: 1 }); tg.start(['a']);
  let t = 0; const pos = new Map();
  while (tg.phase !== 'result') { t += 33; tg.update(0.033, t, pos); }
  assert.equal(tg.roster[0].lastResult, 'missing'); assert.equal(tg.roster[0].lives, 2);
});

test('bù độ trễ: chốt kết quả muộn đúng bằng lagMs', () => {
  const tg = new TileGame({ rows: 1, cols: 3, seed: 1, lagMs: 300 }); tg.start(['a']);
  const pos = new Map([['a', { r: 0, c: 0 }]]);
  let t = 0, moveStart = null, checkAt = null;
  while (tg.phase !== 'result') { t += 10; const ph = tg.phase; tg.update(0.01, t, pos); if (ph === 'reveal' && tg.phase === 'move') moveStart = t; if (tg.phase === 'result') checkAt = t; }
  assert.ok(Math.abs(checkAt - moveStart - (tg.moveDur * 1000 + 300)) <= 20);
});

// ---- bộ theo dõi người ----
function person(cx, ankles = true) {
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: 0.5, v: 0.9 }));
  lm[11] = { x: cx + 0.04, y: 0.35, v: 0.9 }; lm[12] = { x: cx - 0.04, y: 0.35, v: 0.9 };
  lm[23] = { x: cx + 0.03, y: 0.55, v: 0.9 }; lm[24] = { x: cx - 0.03, y: 0.55, v: 0.9 };
  lm[27] = { x: cx + 0.03, y: 0.9, v: ankles ? 0.9 : 0.1 }; lm[28] = { x: cx - 0.03, y: 0.9, v: ankles ? 0.9 : 0.1 };
  lm[0] = { x: cx, y: 0.25, v: 0.9 };
  return lm;
}
const map = p => ({ x: p.x * 1000, y: p.y * 600, v: p.v });

test('theo dõi: giữ đúng ID khi 2 người di chuyển, thứ tự MediaPipe trả về bị đảo', () => {
  const tr = new PlayerTracker(4); let t = 0;
  tr.update([person(0.3), person(0.7)], map, 1000, 600, (t += 33));
  const left = tr.list.find(p => p.c.x < 500).id, right = tr.list.find(p => p.c.x > 500).id;
  for (let i = 0; i < 20; i++) {
    const a = person(0.3 + i * 0.005), b = person(0.7 - i * 0.005);
    tr.update(i % 2 ? [a, b] : [b, a], map, 1000, 600, (t += 33));
  }
  assert.ok(tr.list.find(p => p.id === left).c.x < tr.list.find(p => p.id === right).c.x);
  assert.equal(tr.list.length, 2);
});

test('theo dõi: người đã đăng ký khuất 3s rồi quay lại vẫn giữ ID cũ', () => {
  const tr = new PlayerTracker(4); let t = 0;
  tr.update([person(0.4)], map, 1000, 600, (t += 33));
  const id = tr.list[0].id; tr.setKeep([id]);
  for (let i = 0; i < 90; i++) tr.update([], map, 1000, 600, (t += 33));
  assert.equal(tr.list[0].present, false);
  tr.update([person(0.75)], map, 1000, 600, (t += 33)); // quay lại ở chỗ khác
  assert.equal(tr.list.filter(p => p.present).length, 1);
  assert.equal(tr.list.find(p => p.present).id, id);
});

test('theo dõi: chân từ mắt cá; không thấy chân thì ước lượng từ hông', () => {
  const tr = new PlayerTracker(4);
  tr.update([person(0.5)], map, 1000, 600, 33);
  assert.equal(tr.list[0].feetSeen, true); assert.ok(Math.abs(tr.list[0].feet.y - 540) < 2);
  const tr2 = new PlayerTracker(4);
  tr2.update([person(0.5, false)], map, 1000, 600, 33);
  assert.equal(tr2.list[0].feetSeen, false); assert.ok(tr2.list[0].feet.y > 600 * 0.55);
});
