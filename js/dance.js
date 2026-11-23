// GAME "VŨ HỘI CÔNG CHÚA" — kiểu Audition (chế độ Choreography) chơi bằng cơ thể.
// Mỗi lượt 8 phách: dãy động tác hiện ra, 3 nàng công chúa nhảy mẫu (phách 1–4); người chơi làm lần lượt từng động tác
// (bất kỳ lúc nào trong lượt), rồi VỖ TAY đúng PHÁCH CUỐI khi "hạt nhịp" chạy tới vạch (thay phím Space của Audition).
// Thiếu động tác hoặc không vỗ → MISS. Chấm theo độ lệch vỗ tay: PERFECT / GREAT / COOL / BAD / MISS.
// Nhạc: bài có sẵn (tổng hợp) hoặc nhạc người dùng tự chọn → nhận nhịp (beat.js) → tự sinh bài nhảy theo năng lượng bài.
// Thuần logic → test bằng Node.
import { rng } from './game.js';

/** 6 động tác (theo phía màn hình người chơi nhìn thấy) + chốt vỗ tay. */
export const POSES = {
  L:  { icon: '⬅', name: 'Dang tay trái', color: '#ff6fa8' },
  R:  { icon: '➡', name: 'Dang tay phải', color: '#6fc8ff' },
  UL: { icon: '↖', name: 'Giơ tay trái', color: '#ffb347' },
  UR: { icon: '↗', name: 'Giơ tay phải', color: '#9b8cff' },
  UP: { icon: '⬆', name: 'Giơ 2 tay', color: '#7dffb0' },
  DN: { icon: '⬇', name: 'Ngồi xuống', color: '#ffd23f' },
  T:  { icon: '↔', name: 'Dang 2 tay', color: '#ff9de2' },
};
/**
 * Chế độ BÉ (4–6 tuổi): 3 động tác to, đối xứng (không cần phân biệt trái/phải), gọi bằng hình ảnh quen thuộc + giọng đọc.
 * Bé giơ 1 tay hay 2 tay đều được tính "cây cao"; dang 1 hay 2 tay đều là "máy bay".
 */
export const KID_POSES = {
  UP: { emoji: '🌳', label: 'Cao như cây', say: 'Giơ hai tay lên thật cao như cái cây!' },
  T:  { emoji: '✈️', label: 'Máy bay', say: 'Dang hai tay ra như máy bay!' },
  DN: { emoji: '🐸', label: 'Ếch ngồi', say: 'Ngồi xuống như chú ếch!' },
};
const KID_ACCEPT = { UP: ['UP', 'UL', 'UR'], T: ['T', 'L', 'R'], DN: ['DN'] };
export const KID_GRADE = { PERFECT: 'TUYỆT VỜI!', GREAT: 'GIỎI LẮM!', COOL: 'ĐƯỢC RỒI!', BAD: 'ĐƯỢC RỒI!', MISS: 'CỐ LÊN NHÉ!' };
export const KID_CFG = { maxTurns: 14, breakEvery: 4, perfect: 0.3, holdSec: 0.2 };
export const GRADES = ['PERFECT', 'GREAT', 'COOL', 'BAD', 'MISS'];
export const DANCE_CFG = {
  turnBeats: 8,
  // cửa sổ chấm vỗ tay (giây) — nới hơn bàn phím vì chuyển động thân người + camera
  win: { PERFECT: 0.075, GREAT: 0.13, COOL: 0.2, BAD: 0.3 },
  pts: { PERFECT: 400, GREAT: 250, COOL: 150, BAD: 50, MISS: 0 },
  fever: { PERFECT: 25, GREAT: 15, COOL: 8, BAD: 0, MISS: -30 },
  feverTurns: 2,
  holdSec: 0.12,            // giữ động tác 0,12 s mới tính (lọc rung khung xương)
  maxN: { easy: 4, normal: 5, hard: 6 },
  breakEvery: 5,            // cứ 5 lượt có 1 lượt "solo công chúa" để nghỉ
};

/** Tempo nhảy: kéo về 68–140 BPM (nhạc nhanh thì nhảy nửa nhịp, nhạc rất chậm thì gấp đôi). */
export function danceBeat(bpm) {
  let b = 60 / bpm;
  while (60 / b > 140) b *= 2;
  while (60 / b < 68) b /= 2;
  return b;
}

/**
 * Sinh bài nhảy.
 * @param song { bpm, offset, downbeat, duration, energy (Float32Array theo phách gốc) }
 * @returns turns: [{ i, kind: 'normal'|'break'|'finish', t0, beat, beats, n, seq: [poseId], finishAt, lvl, energy }]
 */
export function buildChart(song, { difficulty = 'normal', seed = 1 } = {}) {
  if (difficulty === 'kid') return buildKidChart(song, seed);
  const c = DANCE_CFG, rand = rng(seed), beat = danceBeat(song.bpm), raw = 60 / song.bpm;
  const ratio = beat / raw;                                     // 1 phách nhảy = bao nhiêu phách gốc
  // phách đầu ô nhịp đầu tiên sau ≥ 2,5 s (đoạn dạo đầu)
  let t0 = song.offset + (song.downbeat || 0) * raw;
  while (t0 < 2.5) t0 += 4 * raw;
  const maxN = c.maxN[difficulty] || 5, turns = [];
  const energyAt = (a, b) => {
    const e = song.energy; if (!e || !e.length) return 0.5;
    const i0 = Math.max(0, Math.floor((a - song.offset) / raw)), i1 = Math.min(e.length, Math.ceil((b - song.offset) / raw));
    let s = 0; for (let i = i0; i < i1; i++) s += e[i]; return i1 > i0 ? s / (i1 - i0) : 0.5;
  };
  let prev = [], i = 0;
  const finishLen = 16 * beat;
  while (t0 + c.turnBeats * beat <= song.duration - 1) {
    const isFinish = t0 + c.turnBeats * beat + finishLen > song.duration - 1 && t0 + finishLen <= song.duration - 1 && i >= 3;
    const beats = isFinish ? 16 : c.turnBeats, end = t0 + beats * beat, en = energyAt(t0, end);
    const isBreak = !isFinish && i > 0 && (i + 1) % c.breakEvery === 0;
    // cấp độ: tăng dần theo lượt + điệp khúc (năng lượng cao) khó hơn
    const lvl = Math.min(6, 1 + Math.floor(i / 3) + (en > 0.7 ? 1 : 0));
    let n = isFinish ? Math.min(8, maxN + 2) : Math.max(2, Math.min(maxN, 1 + lvl));
    if (i === 0) n = 2;
    const seq = isBreak ? [] : genSeq(rand, n, lvl, prev);
    turns.push({ i, kind: isFinish ? 'finish' : isBreak ? 'break' : 'normal', t0, beat, beats, n: seq.length, seq, finishAt: end - beat, end, lvl, energy: en });
    if (!isBreak) prev = seq;
    t0 = end; i++;
    if (isFinish) break;
  }
  return { turns, beat, bpm: song.bpm, duration: song.duration };
}
/**
 * Bài nhảy cho BÉ: ~1 phút, mỗi lượt 1 động tác (từ lượt 7: thỉnh thoảng 2), 3 lượt đầu chỉ "cây" và "máy bay",
 * "ếch ngồi" không lặp 2 lượt liền; cứ 4 lượt nghỉ 1; lượt cuối là "cây cao" + pháo hoa.
 */
function buildKidChart(song, seed) {
  const K = KID_CFG, rand = rng(seed), beat = danceBeat(song.bpm), raw = 60 / song.bpm, turnBeats = DANCE_CFG.turnBeats;
  let t0 = song.offset + (song.downbeat || 0) * raw;
  while (t0 < 2.5) t0 += 4 * raw;
  const turns = []; let prev = null;
  for (let i = 0; i < K.maxTurns && t0 + turnBeats * beat <= song.duration - 1; i++) {
    const last = i === K.maxTurns - 1 || t0 + 2 * turnBeats * beat > song.duration - 1;
    const isBreak = !last && i > 0 && (i + 1) % K.breakEvery === 0;
    let seq = [];
    if (last) seq = ['UP'];
    else if (!isBreak) {
      const pool = i < 3 ? ['UP', 'T'] : ['UP', 'T', 'DN'];
      const n = i >= 6 && i % 3 === 0 ? 2 : 1;
      while (seq.length < n) {
        const p = pool[Math.floor(rand() * pool.length)];
        if (p === seq[seq.length - 1] || (seq.length === 0 && p === prev) || (p === 'DN' && prev === 'DN')) continue;
        seq.push(p);
      }
      prev = seq[seq.length - 1];
    }
    const end = t0 + turnBeats * beat;
    turns.push({ i, kind: last ? 'finish' : isBreak ? 'break' : 'normal', t0, beat, beats: turnBeats, n: seq.length, seq, finishAt: end - beat, end, lvl: 1, energy: 0.5 });
    t0 = end;
    if (last) break;
  }
  return { turns, beat, bpm: song.bpm, duration: song.duration, kid: true };
}
/** Bé làm động tác `pose` có tính là `target` không (chế độ bé dễ tính hơn). */
export function kidMatch(target, pose) { return !!pose && (KID_ACCEPT[target] || [target]).includes(pose); }

/** Dãy động tác: không lặp liền nhau, NGỒI tối đa 1 lần / lượt và không ở đầu/cuối, cấp thấp chỉ dùng 3 động tác dễ. */
function genSeq(rand, n, lvl, prev) {
  const pool = lvl <= 1 ? ['L', 'R', 'UP'] : lvl <= 2 ? ['L', 'R', 'UP', 'UL', 'UR'] : ['L', 'R', 'UP', 'UL', 'UR', 'DN'];
  for (let tries = 0; tries < 20; tries++) {
    const seq = [];
    let dn = 0;
    while (seq.length < n) {
      const p = pool[Math.floor(rand() * pool.length)];
      if (p === seq[seq.length - 1]) continue;
      if (p === 'DN' && (dn || seq.length === 0 || seq.length === n - 1)) continue;
      if (p === 'DN') dn++;
      seq.push(p);
    }
    if (seq.join() !== prev.join()) return seq;
  }
  return pool.slice(0, n);
}

export class DanceGame {
  constructor({ chart, lagMs = 0, cfg = {} }) {
    this.cfg = { ...DANCE_CFG, ...cfg };
    this.chart = chart; this.lagMs = lagMs;
    this.events = []; this.over = false;
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.perfectChain = 0; this.fever = 0; this.feverLeft = 0;
    this.counts = Object.fromEntries(GRADES.map(g => [g, 0]));
    this.ti = -1; this.cur = null; this.lastGrade = null;
    this.hold = { pose: null, since: 0 };
  }
  drain() { const e = this.events; this.events = []; return e; }
  get turn() { return this.cur; }
  /** Thứ hạng cuối bài theo độ chính xác có trọng số. */
  get accuracy() { const w = { PERFECT: 1, GREAT: 0.8, COOL: 0.55, BAD: 0.2, MISS: 0 }; const tot = GRADES.reduce((s, g) => s + this.counts[g], 0); return tot ? GRADES.reduce((s, g) => s + w[g] * this.counts[g], 0) / tot : 0; }
  /** Chế độ bé: luôn có ít nhất 1 sao. */
  get stars() { const a = this.accuracy; return a >= 0.75 ? 3 : a >= 0.45 ? 2 : 1; }
  get rank() { const a = this.accuracy; return a >= 0.92 ? 'S' : a >= 0.8 ? 'A' : a >= 0.65 ? 'B' : a >= 0.45 ? 'C' : 'D'; }

  /**
   * @param t      thời gian bài hát (giây, đã trừ độ trễ loa)
   * @param pose   động tác đang làm (POSES key) hoặc null
   * @param claps  mảng thời điểm vỗ tay (theo thời gian bài) phát sinh từ lần gọi trước
   */
  update(t, pose = null, claps = []) {
    if (this.over) return;
    const c = this.cfg, T = this.chart.turns, lag = this.lagMs / 1000;
    // sang lượt mới
    while (this.ti + 1 < T.length && t >= T[this.ti + 1].t0 - 0.05) {
      if (this.cur && !this.cur.judged && this.cur.kind !== 'break') this._judge(null);
      this.ti++; this.cur = { ...T[this.ti], idx: 0, done: [], judged: false, clap: null };
      if (this.feverLeft > 0 && this.cur.kind !== 'break') this.feverLeft--;
      this.events.push({ kind: 'turn', turn: this.cur });
    }
    const u = this.cur;
    if (!u) return;
    // giữ động tác đủ lâu mới tính
    if (pose !== this.hold.pose) this.hold = { pose, since: t };
    const kid = !!this.chart.kid;
    const steady = pose && t - this.hold.since >= (kid ? KID_CFG.holdSec : c.holdSec) ? pose : null;
    const match = kid ? kidMatch(u.seq[u.idx], steady) : steady === u.seq[u.idx];
    if (u.kind !== 'break' && !u.judged && u.idx < u.n && match && this.hold.used !== this.hold.since) {
      this.hold.used = this.hold.since;          // mỗi lần giữ chỉ tính 1 bước (đổi tư thế rồi mới tính bước kế)
      u.done[u.idx] = true; u.idx++;
      this.events.push({ kind: 'step', i: u.idx - 1, pose: steady, complete: u.idx === u.n });
    }
    // vỗ tay: chỉ vỗ trong cửa sổ quanh phách cuối
    const W = kid ? u.beat * 0.9 : Math.max(u.beat * 0.45, c.win.BAD + 0.05);
    if (u.kind !== 'break' && !u.judged) {
      for (const ct of claps) {
        if (kid && u.idx < u.n) continue; // bé vỗ tay sớm khi chưa làm động tác → bỏ qua, không phạt
        const d = ct - (u.finishAt + lag);
        if (Math.abs(d) <= W) { this._judge(d); break; }
      }
      if (!u.judged && t > u.finishAt + lag + W) this._judge(null);
    }
    if (this.ti === T.length - 1 && t > u.end + 1) { this.over = true; this.events.push({ kind: 'end', rank: this.rank }); }
  }

  _judge(delta) {
    const c = this.cfg, u = this.cur;
    u.judged = true;
    let g = 'MISS';
    if (this.chart.kid) { // bé: làm được động tác là được khen; vỗ tay gần nhịp thì "tuyệt vời"
      g = u.idx < u.n ? 'MISS' : delta == null ? 'COOL' : Math.abs(delta) <= KID_CFG.perfect ? 'PERFECT' : 'GREAT';
    } else if (delta != null && u.idx >= u.n) {
      const a = Math.abs(delta);
      g = a <= c.win.PERFECT ? 'PERFECT' : a <= c.win.GREAT ? 'GREAT' : a <= c.win.COOL ? 'COOL' : a <= c.win.BAD ? 'BAD' : 'MISS';
    }
    u.grade = g; this.lastGrade = g; this.counts[g]++;
    const ok = g !== 'MISS' && g !== 'BAD';
    this.combo = ok ? this.combo + 1 : 0; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.perfectChain = g === 'PERFECT' ? this.perfectChain + 1 : 0;
    const mult = (this.feverLeft > 0 ? 2 : 1) * (u.kind === 'finish' ? 3 : 1);
    const gain = Math.round((c.pts[g] * Math.max(1, u.n) / 3 + (ok ? this.combo * 20 : 0) + (this.perfectChain > 1 ? this.perfectChain * 50 : 0)) * mult);
    this.score += gain;
    let feverStart = false;
    if (this.feverLeft <= 0) {
      this.fever = Math.max(0, Math.min(100, this.fever + c.fever[g]));
      if (this.fever >= 100) { this.fever = 0; this.feverLeft = c.feverTurns; feverStart = true; }
    }
    this.events.push({ kind: 'judge', grade: g, delta, gain, chain: this.perfectChain, combo: this.combo, finish: u.kind === 'finish', incomplete: delta != null && u.idx < u.n });
    if (feverStart) this.events.push({ kind: 'fever' });
  }
}

// ---------------- Màn TẬP: học từng động tác + đo độ trễ vỗ tay ----------------
export const PRACTICE_STEPS = ['L', 'R', 'UL', 'UR', 'UP', 'DN', 'CLAP'];
export const PRACTICE_CFG = { holdSec: 0.6, hintSec: 6, giveUpSec: 16, clapCountIn: 4, clapN: 8, minClaps: 4 };

/**
 * Tập lần lượt 6 động tác (giữ đúng 0,6 s là qua; quá 16 s thì bỏ qua) rồi vỗ tay theo nhịp 8 lần.
 * Kết quả vỗ tay: độ lệch trung vị (giây) giữa lúc bạn vỗ và phách nhạc — dùng bù trễ khi chấm (camera + loa + màn hình).
 */
export class DancePractice {
  constructor({ beat, offset = 0, cfg = {}, steps = PRACTICE_STEPS }) {
    this.c = { ...PRACTICE_CFG, ...cfg }; this.beat = beat; this.offset = offset; this.steps = steps;
    this.i = 0; this.held = 0; this.stepT = null; this.res = steps.map(() => null);
    this.clapStart = null; this.deltas = []; this.lag = null; this.done = false; this.events = [];
  }
  get step() { return this.steps[this.i]; }
  get hint() { return this.stepT != null && this._now - this.stepT > this.c.hintSec; }
  /** Các phách cần vỗ (theo thời gian nhạc). */
  clapTargets() { if (this.clapStart == null) return []; return Array.from({ length: this.c.clapN }, (_, k) => this.clapStart + (this.c.clapCountIn + k) * this.beat); }
  /**
   * @param t     đồng hồ thật (giây)
   * @param pose  động tác đang nhận được
   * @param claps thời điểm vỗ tay theo đồng hồ nhạc
   * @param mt    thời gian nhạc hiện tại
   */
  update(t, pose, claps = [], mt = 0) {
    this._now = t; if (this.done) return;
    if (this.stepT == null) this.stepT = t;
    const dt = this._lt == null ? 0 : Math.min(0.1, t - this._lt); this._lt = t;
    const st = this.step;
    if (st !== 'CLAP') {
      if (pose === st) this.held += dt; else this.held = Math.max(0, this.held - dt * 0.5);
      if (this.held >= this.c.holdSec) this._next(true, t);
      else if (t - this.stepT > this.c.giveUpSec) this._next(false, t);
      return;
    }
    // vỗ tay: bắt đầu ở phách kế tiếp, đếm 4 phách rồi vỗ 8 phách
    if (this.clapStart == null) { const k = Math.ceil((mt - this.offset) / this.beat + 0.5); this.clapStart = this.offset + k * this.beat; }
    const T = this.clapTargets();
    for (const ct of claps) {
      let best = null;
      for (const x of T) if (best == null || Math.abs(ct - x) < Math.abs(ct - best)) best = x;
      if (best != null && Math.abs(ct - best) < this.beat * 0.45) { this.deltas.push(ct - best); this.events.push({ kind: 'clap', delta: ct - best }); }
    }
    if (mt > T[T.length - 1] + this.beat * 0.6) {
      const d = [...this.deltas].sort((a, b) => a - b);
      this.lag = d.length >= this.c.minClaps ? d[Math.floor(d.length / 2)] : null;
      this.res[this.i] = this.lag != null;
      this.done = true; this.events.push({ kind: 'done', lag: this.lag, claps: d.length, ok: this.res.filter(Boolean).length });
    }
  }
  _next(ok, t) { this.res[this.i] = ok; this.events.push({ kind: 'step', step: this.step, ok }); this.i++; this.held = 0; this.stepT = t; }
  get progress() { return this.step === 'CLAP' ? 0 : Math.min(1, this.held / this.c.holdSec); }
  drain() { const e = this.events; this.events = []; return e; }
}
