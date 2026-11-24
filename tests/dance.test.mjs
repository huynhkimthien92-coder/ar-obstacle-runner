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

test('màn tập: giữ đúng động tác 0,6 s thì qua; làm sai lâu quá thì bỏ qua; vỗ tay đo được độ trễ', async () => {
  const { DancePractice, PRACTICE_STEPS } = await import('../js/dance.js');
  const pr = new DancePractice({ beat: 0.5, offset: 1, cfg: { giveUpSec: 5 } });
  let t = 0; const tick = (pose, claps = [], mt = 0) => { pr.update(t, pose, claps, mt); t += 1 / 30; };
  for (let k = 0; k < 25; k++) tick('L');
  assert.equal(pr.step, 'R'); assert.equal(pr.res[0], true);
  for (let k = 0; k < 6 * 30; k++) tick(null); // không làm R → sau 5 s bỏ qua
  assert.equal(pr.step, 'UL'); assert.equal(pr.res[1], false);
  for (const P of ['UL', 'UR', 'UP', 'T', 'DN', 'SPIN']) for (let k = 0; k < 25; k++) tick(P);
  assert.equal(pr.step, 'CLAP');
  // vỗ tay trễ đều 0,12 s so với phách
  let mt = 3.0; pr.update(t, null, [], mt);
  const T = pr.clapTargets(); assert.equal(T.length, 8);
  for (const x of T) { pr.update(t, null, [x + 0.12], x + 0.13); }
  pr.update(t, null, [], T[7] + 1);
  assert.ok(pr.done); assert.ok(Math.abs(pr.lag - 0.12) < 1e-9);
  const ev = pr.drain(); assert.equal(ev.filter(e => e.kind === 'clap').length, 8); assert.equal(ev.at(-1).kind, 'done');
  assert.equal(PRACTICE_STEPS.length, 9);
});

test('chế độ bé: ~14 lượt, mũi tên ⬅ ➡ ⬆ ⬇ + xoay, 3 lượt đầu không ngồi/xoay, ngồi/xoay không 2 lượt liền', async () => {
  const { buildChart } = await import('../js/dance.js');
  const song = { bpm: 112, offset: 1, downbeat: 0, duration: 88, energy: null };
  for (let seed = 1; seed < 30; seed++) {
    const ch = buildChart(song, { difficulty: 'kid', seed });
    assert.ok(ch.kid); assert.ok(ch.turns.length <= 14 && ch.turns.length >= 10);
    const play = ch.turns.filter(u => u.kind !== 'break');
    for (const u of play) { assert.ok(u.n >= 1 && u.n <= 2); assert.ok(u.seq.every(p => ['UP', 'L', 'R', 'DN', 'SPIN'].includes(p))); assert.ok(u.seq.filter(p => p === 'SPIN').length <= 1); }
    for (const u of ch.turns.slice(0, 3)) assert.ok(!u.seq.includes('DN') && !u.seq.includes('SPIN'));
    assert.ok(ch.turns.some(u => u.seq.includes('L')) && ch.turns.some(u => u.seq.includes('R')));
    let prev = null; for (const u of play) { for (const x of ['DN', 'SPIN']) if (u.seq[0] === x) assert.notEqual(prev, x); prev = u.seq.at(-1); }
    assert.equal(ch.turns.at(-1).kind, 'finish'); assert.deepEqual(ch.turns.at(-1).seq, ['UP']);
    assert.ok(ch.turns.at(-1).end < 75, 'bài cho bé ~1 phút');
  }
});

test('chế độ bé: giơ 1 tay = ⬆, tay trái hơi chếch lên vẫn là ⬅; vỗ sớm không phạt; không vỗ vẫn được khen; vỗ gần nhịp = TUYỆT VỜI', async () => {
  const { buildChart, DanceGame, kidMatch } = await import('../js/dance.js');
  assert.ok(kidMatch('UP', 'UL') && kidMatch('L', 'UL') && kidMatch('R', 'R') && !kidMatch('L', 'R') && !kidMatch('DN', 'UP') && kidMatch('SPIN', 'SPIN'));
  const ch = buildChart({ bpm: 112, offset: 1, downbeat: 0, duration: 88 }, { difficulty: 'kid', seed: 3 });
  const g = new DanceGame({ chart: ch });
  const play = (u, { pose, clap }) => {
    const alt = { UP: 'UR', L: 'UL', R: 'UR', DN: 'DN', SPIN: 'SPIN' };
    let t = u.t0 + 0.01, k = 0;
    for (; t < u.t0 + u.beat * 2; t += 1 / 30) g.update(t, null, t > u.t0 + 0.3 && t < u.t0 + 0.34 ? [t] : []); // vỗ sớm → bỏ qua
    for (const p of u.seq) { for (let j = 0; j < 12; j++, t += 1 / 30) g.update(t, pose ? alt[p] : null); for (let j = 0; j < 4; j++, t += 1 / 30) g.update(t, null); k++; }
    let sent = false; for (; t < u.end + 0.02; t += 1 / 30) { const c = clap != null && !sent && t >= u.finishAt + clap; if (c) sent = true; g.update(t, null, c ? [u.finishAt + clap] : []); }
  };
  const T = ch.turns.filter(u => u.kind !== 'break');
  play(T[0], { pose: true, clap: 0.2 }); assert.equal(T[0] && g.counts.PERFECT, 1);
  play(T[1], { pose: true, clap: null }); assert.equal(g.counts.COOL, 1);
  play(T[2], { pose: true, clap: 0.4 }); assert.equal(g.counts.GREAT, 1);
  play(T[3], { pose: false, clap: 0 }); assert.equal(g.counts.MISS, 1);
  assert.ok(g.stars >= 2);
});
