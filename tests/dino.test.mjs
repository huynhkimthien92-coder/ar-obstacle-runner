// Kiểm thử game "Đấu khủng long" (logic thuần)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DinoGame, DINO_ORDER, dinoBox } from '../js/dino.js';

const W = 1280, H = 720, DT = 1 / 30;
const mk = (o = {}) => new DinoGame({ W, H, seed: 3, ...o });
/** Chạy tới pha `phase` (không làm gì). */
function until(g, phase, input = () => ({}), max = 30) {
  for (let i = 0; i < max / DT && g.dino.phase !== phase && !g.over; i++) g.update(DT, input(g));
}
/** Bot: đánh điểm yếu đang hiện + phản ứng đúng đòn. react=false thì đứng im. */
function bot(react = true, strike = true) {
  return g => {
    const inp = { hands: [], dodge: 0, duck: false, guard: false };
    const w = g.weakNow();
    if (strike && w) inp.hands.push({ id: 'R', px: w.x - 90, py: w.y, x: w.x + 90, y: w.y, speed: 3 });
    const d = g.dino;
    if (react && (d.phase === 'windup' && d.t > d.windup - 0.25 || d.phase === 'attack')) {
      const A = d.attack;
      if (A.need === 'move') inp.dodge = A.dir; if (A.need === 'duck') inp.duck = true; if (A.need === 'guard') inp.guard = true;
    }
    if (react && d.phase === 'attack' && d.attack.need === 'smash') for (const k of g.rocks) if (!k.smashed && k.z < 0.6 && k.z > 0) inp.hands.push({ id: 'L' + k.id, px: k.x - 80, py: k.y, x: k.x + 80, y: k.y, speed: 3 });
    return inp;
  };
}

test('khủng long đi từ xa tới (to dần) rồi mới bắt đầu đánh', () => {
  const g = mk();
  const b0 = dinoBox(W, H, g.dino.key, g.dino.z);
  until(g, 'idle');
  const b1 = dinoBox(W, H, g.dino.key, g.dino.z);
  assert.ok(b1.h > b0.h * 3, `${b0.h} → ${b1.h}`);
  assert.equal(g.lives, 5);
});

test('vung tay qua điểm yếu → trừ máu khủng long, +điểm; tay chậm thì không', () => {
  const g = mk(); until(g, 'idle');
  for (let i = 0; i < 30 && !g.weakNow(); i++) g.update(DT, {});
  const w = g.weakNow(); assert.ok(w);
  const hp = g.dino.hp;
  g.update(DT, { hands: [{ id: 'R', px: w.x - 50, py: w.y, x: w.x + 50, y: w.y, speed: 0.2 }] });
  assert.equal(g.dino.hp, hp);
  g.update(DT, { hands: [{ id: 'R', px: w.x - 50, py: w.y, x: w.x + 50, y: w.y, speed: 3 }] });
  assert.equal(g.dino.hp, hp - 1); assert.ok(g.score >= 10);
});

test('có báo trước rồi mới tấn công; không phản ứng → mất mạng', () => {
  const g = mk(); until(g, 'windup');
  const ev = g.drain().find(e => e.kind === 'windup'); assert.ok(ev && ev.attack.label);
  until(g, 'recover');
  assert.equal(g.lives, 4);
});

test('né đúng hướng → không mất mạng, khủng long hở sườn (điểm yếu vàng x2)', () => {
  const g = mk(); until(g, 'windup');
  assert.equal(g.dino.attack.need, 'move'); // raptor mở màn bằng cắn
  until(g, 'counter', bot(true, false));
  assert.equal(g.lives, 5);
  const w = g.weakNow(); assert.ok(w?.gold);
  const hp = g.dino.hp;
  g.update(DT, { hands: [{ id: 'R', px: w.x - 60, py: w.y, x: w.x + 60, y: w.y, speed: 3 }] });
  assert.equal(g.dino.hp, hp - 2);
});

test('né SAI hướng vẫn bị cắn', () => {
  const g = mk(); until(g, 'windup');
  const dir = g.dino.attack.dir;
  until(g, 'recover', () => ({ dodge: -dir }));
  assert.equal(g.lives, 4);
});

test('bù độ trễ màn hình: phản ứng muộn đúng bằng độ trễ vẫn tính là né được', () => {
  const g = mk({ lagMs: 300 }); until(g, 'windup');
  const A = g.dino.attack;
  until(g, 'attack');
  const hitAt = g.clock;
  until(g, 'counter', gg => ({ dodge: gg.clock > hitAt + 0.25 ? A.dir : 0 }), 3);
  assert.equal(g.dino.phase, 'counter'); assert.equal(g.lives, 5);
});

test('bot đánh + phản ứng đúng hạ được cả 4 loại khủng long mà không chết', () => {
  const g = mk(); const seen = new Set();
  for (let i = 0; i < 400 / DT && g.kills < 4 && !g.over; i++) { g.update(DT, bot()(g)); seen.add(g.dino.key); }
  assert.equal(g.kills, 4, `hạ ${g.kills}, còn ${g.lives} mạng`);
  assert.ok(g.lives >= 4); assert.deepEqual([...seen].slice(0, 4), DINO_ORDER);
});

test('đứng im không làm gì → thua', () => {
  const g = mk();
  for (let i = 0; i < 200 / DT && !g.over; i++) g.update(DT, {});
  assert.equal(g.over, true); assert.equal(g.lives, 0);
});

test('vòng 2 khủng long trâu hơn, đánh nhanh hơn', () => {
  const g = mk();
  for (let i = 0; i < 600 / DT && g.wave < 5 && !g.over; i++) g.update(DT, bot()(g));
  assert.equal(g.level, 2);
  assert.ok(g.dino.maxHp > 6 && g.dino.windup < 1.15);
});
