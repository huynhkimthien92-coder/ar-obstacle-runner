import test from 'node:test';
import assert from 'node:assert/strict';
import { FruitGame, segDist } from '../js/fruits.js';

const W = 1280, H = 720;
const mk = (objs, cfg = {}) => {
  const g = new FruitGame({ W, H, seed: 1, cfg: { spawnEvery: () => 999, ...cfg } });
  g.spawnT = 999; g.objs = objs.map((o, i) => ({ id: i + 1, kind: 'fruit', type: 'orange', pts: 1, r: 40, vx: 0, vy: 0, rot: 0, vr: 0, sliced: false, ...o }));
  g.cfg.gravity = () => 0;
  return g;
};
const swipe = (x0, y0, x1, y1, speed = 2) => [{ id: 'R', px: x0, py: y0, x: x1, y: y1, speed }];

test('khoảng cách điểm tới đoạn thẳng', () => {
  assert.equal(segDist(0, 0, 10, 0, 5, 3), 3);
  assert.equal(segDist(0, 0, 10, 0, 15, 0), 5);
});

test('vung tay nhanh cắt ngang trái → chém được, +điểm', () => {
  const g = mk([{ x: 600, y: 300 }]);
  g.update(0.016, swipe(500, 300, 700, 310));
  assert.equal(g.score, 1); assert.equal(g.sliced, 1);
  assert.equal(g.drain().filter(e => e.kind === 'slice').length, 1);
});

test('tay để yên / di chậm qua trái → không chém', () => {
  const g = mk([{ x: 600, y: 300 }]);
  g.update(0.016, swipe(590, 300, 610, 300, 0.2));
  assert.equal(g.sliced, 0);
});

test('chém trúng bom → mất mạng; 3 bom → hết lượt', () => {
  const g = mk([{ x: 300, y: 300, kind: 'bomb' }, { x: 600, y: 300, kind: 'bomb' }, { x: 900, y: 300, kind: 'bomb' }]);
  g.update(0.016, swipe(200, 300, 1000, 300));
  assert.equal(g.lives, 0); assert.equal(g.over, true); assert.equal(g.endReason, 'bomb');
});

test('một nhát cắt 3 trái = combo, thưởng thêm 3 điểm', () => {
  const g = mk([{ x: 300, y: 300 }, { x: 600, y: 300 }, { x: 900, y: 300 }]);
  g.update(0.016, swipe(200, 300, 1000, 300));
  for (let i = 0; i < 30; i++) g.update(0.016, []);
  assert.equal(g.score, 3 + 3); assert.equal(g.bestCombo, 3);
});

test('trái vàng +5 giây', () => {
  const g = mk([{ x: 600, y: 300, kind: 'gold', pts: 5 }]);
  const t0 = g.time; g.update(0.016, swipe(500, 300, 700, 300));
  assert.ok(g.time > t0 + 4.9);
});

test('trái rơi từ trên xuống, chạm đáy thì mất (không trừ mạng); hết giờ thì kết thúc', () => {
  const g = new FruitGame({ W, H, seed: 5, cfg: { duration: 20 } });
  let topSpawn = true, maxObjs = 0;
  for (let i = 0; i < 25 * 60; i++) {
    g.update(1 / 60, []);
    for (const o of g.objs) if (o.y < -o.r * 0.99 && o.vy < 0) topSpawn = false;
    maxObjs = Math.max(maxObjs, g.objs.length);
  }
  assert.ok(topSpawn); assert.ok(g.missed > 5); assert.equal(g.lives, 3);
  assert.equal(g.over, true); assert.equal(g.endReason, 'time');
  assert.ok(maxObjs <= g.cfg.maxObjects);
});

test('bot vung tay theo trái gần nhất ghi được nhiều điểm trong 60s', () => {
  const g = new FruitGame({ W, H, seed: 9, cfg: { duration: 60 } });
  let hx = W / 2, hy = H / 2;
  for (let i = 0; i < 61 * 30 && !g.over; i++) {
    const target = g.objs.filter(o => o.kind !== 'bomb' && o.y > 0).sort((a, b) => b.y - a.y)[0];
    let hands = [];
    if (target) { const px = hx, py = hy; hx = target.x + 80; hy = target.y; hands = [{ id: 'R', px: target.x - 80, py: target.y, x: hx, y: hy, speed: 3 }]; void px; void py; }
    g.update(1 / 30, hands);
  }
  assert.ok(g.score > 40, `điểm ${g.score}`);
});
