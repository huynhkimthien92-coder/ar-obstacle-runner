// Kiểm thử logic game + "bot hoàn hảo" để chứng minh mọi chunk trong bản đồ đều có lời giải.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { T, TUTORIAL, CHUNKS } from '../js/levels.js';

const DT = 1 / 30;

/** Bot: nhìn chướng ngại vật sắp tới và chọn làn / động tác như người chơi giỏi. */
function bot(g, p) {
  const horizon = g.speed * 0.9; // nhìn trước 0.9s
  const ahead = g.obstacles.filter(o => !o.done && o.z > -0.5 && o.z < horizon);
  const blockedNow = lane => ahead.some(o => o.z < g.speed * 0.5 && (o.type === T.WALL) && (o.lane === lane));
  const fireIn = lane => ahead.some(o => o.z < g.speed * 0.5 && o.type === T.FIRE && (o.lane === lane || o.lane === -1));
  // ưu tiên làn không có tường, rồi không có lửa
  if (blockedNow(p.lane) || fireIn(p.lane)) {
    const cands = [0, 1, 2].filter(l => !blockedNow(l)).sort((a, b) => (fireIn(a) - fireIn(b)) || Math.abs(a - p.lane) - Math.abs(b - p.lane));
    if (cands.length) p.lane = cands[0];
  }
  const near = ahead.filter(o => o.z < g.speed * 0.15);
  p.airborne = near.some(o => o.type === T.HURDLE || (o.type === T.FIRE && (o.lane === -1 || o.lane === p.lane)));
  p.ducking = !p.airborne && near.some(o => o.type === T.BAR);
  p.handsUp = ahead.some(o => o.type === T.STAR && o.z < g.speed * 0.2);
  // nhặt xu/sao khi không có nguy hiểm trong làn đó
  const want = ahead.find(o => (o.type === T.COIN || o.type === T.STAR) && o.z < g.speed * 0.4);
  if (want && want.lane >= 0 && !blockedNow(want.lane) && !fireIn(want.lane)) p.lane = want.lane;
  return p;
}

function run(seed, seconds, policy) {
  const g = new Game({ seed });
  const p = { lane: 1, airborne: false, ducking: false, handsUp: false, oneHandUp: false };
  let t = 0;
  for (let i = 0; i < seconds / DT && !g.over; i++) { t += DT * 1000; policy(g, p); g.update(DT, t, p); g.drain(); }
  return g;
}

test('đứng im thì sớm thua (chướng ngại vật thực sự nguy hiểm)', () => {
  const g = run(1, 120, () => {});
  assert.equal(g.over, true);
  assert.equal(g.lives, 0);
});

test('bot hoàn hảo sống sót 4 phút trên 20 seed khác nhau', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = run(seed, 240, bot);
    assert.equal(g.hits, 0, `seed ${seed}: bot bị đâm ${g.hits} lần ở ${Math.floor(g.traveled)}m`);
    assert.ok(g.traveled > 1500, `seed ${seed}: đi được ${g.traveled}`);
  }
});

test('tutorial chạy đúng thứ tự và có chữ hướng dẫn', () => {
  const g = new Game({ seed: 3 });
  const p = { lane: 1 };
  for (let i = 0; i < 5; i++) g._spawnChunk(1);
  const ids = [...new Set(g.obstacles.map(o => o.chunk))];
  assert.deepEqual(ids, TUTORIAL.slice(0, 5).map(c => c.id));
  assert.ok(g.obstacles.some(o => o.hint));
  void p;
});

test('khoảng cách tối thiểu giữa 2 động tác bắt buộc ≥ 1.2s trong mọi chunk', () => {
  for (const tier of Object.values(CHUNKS)) for (const ch of tier) {
    const req = ch.events.filter(e => [T.HURDLE, T.BAR, T.FIRE, T.WALL].includes(e.type)).map(e => e.t);
    const times = [...new Set(req)].sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 1.2 - 1e-9, `${ch.id}: ${times[i - 1]}→${times[i]}`);
  }
});

test('bù trễ: nhảy sớm 200ms vẫn qua rào; sớm 600ms thì không', () => {
  for (const [early, expectHit] of [[200, 0], [600, 1]]) {
    const g = new Game({ seed: 1, tutorial: false });
    g.obstacles = [{ id: 1, type: T.HURDLE, lane: -1, pos: 10, z: 10, done: false }];
    g.spawnPos = 1e9;
    const p = { lane: 1, airborne: false, ducking: false };
    let t = 0;
    const arrive = (10 / g.speed) * 1000;
    while (!g.obstacles[0]?.done && t < 5000) {
      t += 10;
      p.airborne = t >= arrive - early - 150 && t <= arrive - early; // nhảy 150ms rồi đáp
      g.update(0.01, t, p);
    }
    assert.equal(g.hits, expectHit, `nhảy sớm ${early}ms`);
  }
});

test('ngôi sao chỉ ăn được khi giơ tay', () => {
  const mk = hands => {
    const g = new Game({ seed: 1, tutorial: false });
    g.obstacles = [{ id: 1, type: T.STAR, lane: 1, pos: 2, z: 2, done: false }]; g.spawnPos = 1e9;
    const p = { lane: 1, handsUp: hands };
    for (let t = 0; t < 1000; t += 33) g.update(0.033, t, p);
    return g.stars;
  };
  assert.equal(mk(true), 1);
  assert.equal(mk(false), 0);
});

test('bị đâm có thời gian bất tử, hết mạng thì game over', () => {
  const g = new Game({ seed: 1, tutorial: false });
  g.spawnPos = 1e9;
  g.obstacles = [5, 6, 30, 60].map((pos, i) => ({ id: i, type: T.WALL, lane: 1, pos, z: pos, done: false }));
  const p = { lane: 1 };
  for (let t = 0; t < 20000 && !g.over; t += 33) g.update(0.033, t, p);
  assert.equal(g.hits, 3, 'tường thứ 2 nằm trong thời gian bất tử');
  assert.equal(g.over, true);
});

test('bù độ trễ TV 300ms: nhảy lúc NHÌN THẤY rào chạm vạch (trễ 300ms) vẫn qua', () => {
  for (const [lag, expectHit] of [[300, 0], [0, 1]]) {
    const g = new Game({ seed: 1, tutorial: false, cfg: { displayLagMs: lag } });
    g.obstacles = [{ id: 1, type: T.HURDLE, lane: -1, pos: 10, z: 10, done: false }];
    g.spawnPos = 1e9;
    const p = { lane: 1, airborne: false, ducking: false };
    const arrive = (10 / g.speed) * 1000, seen = arrive + 300; // TV hiện muộn 300ms
    for (let t = 0; t < 5000 && !g.obstacles[0]?.done; t += 10) {
      p.airborne = t >= seen + 40 && t <= seen + 450; // người phản ứng theo hình trên TV
      g.update(0.01, t, p);
    }
    assert.equal(g.hits, expectHit, `lag ${lag}`);
  }
});
