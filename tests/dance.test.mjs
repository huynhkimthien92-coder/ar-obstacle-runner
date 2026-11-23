// Kiểm thử game "Vũ hội công chúa" (logic thuần)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChart, DanceGame, danceBeat, POSES } from '../js/dance.js';

const song = (o = {}) => ({ bpm: 120, offset: 0.2, downbeat: 0, duration: 90, energy: new Float32Array(200).fill(0.5), ...o });

test('tempo nhảy luôn trong 68–140 BPM', () => {
  for (const bpm of [60, 70, 90, 120, 140, 174, 200]) { const b = 60 / danceBeat(bpm); assert.ok(b >= 68 && b <= 140, `${bpm} → ${b}`); }
});

test('bài nhảy: lượt 8 phách nối tiếp, khó dần, có lượt nghỉ và lượt FINISH cuối bài', () => {
  const ch = buildChart(song(), { seed: 3 });
  const T = ch.turns;
  assert.ok(T.length >= 8);
  assert.ok(T[0].t0 >= 2.5 && T[0].n === 2);
  for (let i = 1; i < T.length; i++) assert.ok(Math.abs(T[i].t0 - T[i - 1].end) < 1e-6);
  assert.ok(T.some(t => t.kind === 'break'));
  assert.equal(T[T.length - 1].kind, 'finish'); assert.ok(T[T.length - 1].n >= 6);
  assert.ok(Math.max(...T.filter(t => t.kind === 'normal').map(t => t.n)) >= 5);
  assert.ok(T[T.length - 1].end <= 90 - 1 + 1e-6);
});

test('dãy động tác: không lặp liền nhau, NGỒI tối đa 1 lần và không ở đầu/cuối', () => {
  const ch = buildChart(song({ duration: 300 }), { seed: 9, difficulty: 'hard' });
  for (const t of ch.turns) {
    for (let i = 1; i < t.seq.length; i++) assert.notEqual(t.seq[i], t.seq[i - 1]);
    const dn = t.seq.filter(p => p === 'DN').length; assert.ok(dn <= 1);
    if (t.seq.length) { assert.notEqual(t.seq[0], 'DN'); if (t.kind !== 'finish') assert.notEqual(t.seq[t.seq.length - 1], 'DN'); }
    for (const p of t.seq) assert.ok(p in POSES);
  }
});

test('điệp khúc (năng lượng cao) khó hơn đoạn nhỏ', () => {
  const e = new Float32Array(400).fill(0.2); for (let i = 100; i < 200; i++) e[i] = 0.95;
  const ch = buildChart(song({ energy: e, duration: 160 }), { seed: 2, difficulty: 'hard' });
  const quiet = ch.turns.find(t => t.i === 3), loud = ch.turns.find(t => t.kind === 'normal' && t.energy > 0.7 && t.i >= 3);
  assert.ok(loud && quiet && loud.lvl > quiet.lvl);
});

/** "Người chơi": làm đúng từng động tác (giữ 0,2 s) rồi vỗ tay lệch `off` giây so với phách cuối. */
function play(ch, { off = 0, skipLast = false, lagMs = 0, noClap = false } = {}) {
  const g = new DanceGame({ chart: ch, lagMs }), dt = 1 / 30, ev = [];
  for (let t = 0; t < ch.duration + 2 && !g.over; t += dt) {
    const u = g.turn; let pose = null; const claps = [];
    if (u && u.kind !== 'break' && t >= u.t0) {
      const k = Math.floor((t - u.t0) / 0.35); // đổi động tác mỗi 0,35 s, xen tư thế nghỉ
      const want = (k % 2 === 0) ? u.seq[u.idx] : null;
      if (!(skipLast && u.idx === u.n - 1)) pose = want ?? null;
      const ct = u.finishAt + lagMs / 1000 + off;
      if (!noClap && t <= ct && t + dt > ct) claps.push(ct);
    }
    g.update(t, pose, claps); ev.push(...g.drain());
  }
  return { g, ev };
}

test('làm đủ động tác + vỗ đúng phách → PERFECT; lệch 0,1 s → GREAT; lệch 0,25 s → BAD', () => {
  const ch = buildChart(song({ duration: 60 }), { seed: 4 });
  const n = ch.turns.filter(t => t.kind !== 'break').length;
  assert.equal(play(ch).g.counts.PERFECT, n);
  assert.equal(play(ch, { off: 0.1 }).g.counts.GREAT, n);
  assert.equal(play(ch, { off: -0.25 }).g.counts.BAD, n);
});

test('thiếu động tác hoặc không vỗ tay → MISS', () => {
  const ch = buildChart(song({ duration: 40 }), { seed: 4 });
  const n = ch.turns.filter(t => t.kind !== 'break').length;
  assert.equal(play(ch, { skipLast: true }).g.counts.MISS, n);
  assert.equal(play(ch, { noClap: true }).g.counts.MISS, n);
});

test('bù độ trễ TV: vỗ muộn đúng bằng độ trễ vẫn PERFECT', () => {
  const ch = buildChart(song({ duration: 40 }), { seed: 4 });
  const { g } = play(ch, { lagMs: 250 });
  assert.equal(g.counts.MISS, 0); assert.ok(g.counts.PERFECT > 0);
});

test('chuỗi PERFECT bật FEVER (điểm ×2), hạng S', () => {
  const ch = buildChart(song({ duration: 120 }), { seed: 4 });
  const { g, ev } = play(ch);
  assert.ok(ev.some(e => e.kind === 'fever')); assert.equal(g.rank, 'S'); assert.ok(g.maxCombo >= 5);
  assert.ok(ev.some(e => e.kind === 'end'));
});

test('giữ 1 tư thế không tính 2 bước liên tiếp (phải đổi tư thế)', () => {
  const ch = { turns: [{ i: 0, kind: 'normal', t0: 0, beat: 0.5, beats: 8, n: 2, seq: ['L', 'R'], finishAt: 3.5, end: 4, lvl: 1 }], duration: 5 };
  const g = new DanceGame({ chart: ch });
  for (let t = 0; t < 1; t += 0.03) g.update(t, 'L', []);
  assert.equal(g.turn.idx, 1);
  for (let t = 1; t < 2; t += 0.03) g.update(t, 'R', []);
  assert.equal(g.turn.idx, 2);
});
