// GAME "Ô AN TOÀN": sàn nhà được chia lưới ô. Mỗi vòng ô xanh/đỏ đổi ngẫu nhiên; hết giờ mà đứng trên ô đỏ (hố lửa) là mất mạng.
// Nhiều người chơi cùng lúc: ai hết mạng thì bị loại, người cuối cùng còn lại thắng. Chơi 1 người: sống càng nhiều vòng càng cao điểm.
// Thuần logic (không DOM) → test được bằng Node.
import { rng } from './game.js';

export const TILES = {
  revealSec: 0.9,                     // hiệu ứng xáo ô trước mỗi vòng
  resultSec: 1.8,                     // hiện kết quả vòng
  moveSec: r => Math.max(2.0, 5.0 - 0.25 * (r - 1)),   // (PH) thời gian di chuyển: 5s → tối thiểu 2s
  redFrac: r => Math.min(0.8, 0.34 + 0.05 * (r - 1)),  // (PH) tỉ lệ ô đỏ: 34% → tối đa 80%
  reshuffleFrom: 6,                   // từ vòng 6: giữa chừng ô đổi màu 1 lần (phải di chuyển lại)
  occupiedRedProb: 0.8,               // ô đang có người đứng thường hoá đỏ → buộc phải di chuyển
  livesSolo: 3, livesMulti: 2,
};

/** Hình học lưới ô trên màn hình (phối cảnh sàn) + tra ngược: điểm chân (x,y) → ô (r,c). */
export class TileGeom {
  /**
   * @param rows 3 khi thấy được chân (lưới trước/sau), 1 khi chỉ thấy nửa người (dải ô ngang)
   * @param groundY y của chân người chơi lúc hiệu chỉnh
   */
  constructor(W, H, rows, cols, groundY) {
    Object.assign(this, { W, H, rows, cols });
    if (rows > 1) {
      // chân người chơi lúc bắt đầu nằm ở HÀNG GIỮA → bước tới / lùi đều đổi được hàng
      this.yNear = Math.min(H * 0.995, groundY + H * 0.12);
      this.yFar = Math.max(H * 0.3, groundY - H * 0.15);
      this.wNear = W * 0.98; this.wFar = W * 0.62;
    } else {
      this.yNear = H * 0.985; this.yFar = H * 0.8; this.wNear = this.wFar = W * 0.98;
    }
    this._rows();
  }
  /** Lưới ẢO để vẽ ở kiểu "Khung cảnh game": to, đẹp, không phụ thuộc camera; vị trí chân thật được ánh xạ sang đây. */
  static virtual(W, H, rows, cols) {
    const g = Object.create(TileGeom.prototype);
    Object.assign(g, { W, H, rows, cols });
    if (rows > 1) Object.assign(g, { yFar: H * 0.44, yNear: H * 0.97, wFar: W * 0.52, wNear: W * 0.96 });
    else Object.assign(g, { yFar: H * 0.7, yNear: H * 0.97, wFar: W * 0.8, wNear: W * 0.94 });
    g._rows();
    return g;
  }
  _rows() {
    // ranh giới hàng: ô gần cao hơn ô xa (phối cảnh) — tỉ lệ 0.78 mỗi hàng
    const ws = Array.from({ length: this.rows }, (_, i) => Math.pow(0.78, this.rows - 1 - i)); // i=0 xa nhất
    const sum = ws.reduce((a, b) => a + b, 0);
    this.rowY = [this.yFar];
    let acc = this.yFar;
    for (const w of ws) { acc += (this.yNear - this.yFar) * w / sum; this.rowY.push(acc); }
  }
  /** Toạ độ liên tục (u: 0..cols, v: 0..rows) của điểm chân — để đặt người mượt trên lưới ảo. */
  locateF(x, y) {
    let v;
    if (this.rows === 1) v = 0.7;
    else {
      const yy = Math.min(this.yNear - 0.01, Math.max(this.yFar, y));
      let i = 0; while (i < this.rows - 1 && yy >= this.rowY[i + 1]) i++;
      v = i + (yy - this.rowY[i]) / (this.rowY[i + 1] - this.rowY[i]);
    }
    const yy = this.rowY[Math.min(this.rows - 1, Math.floor(v))];
    const hw = this.halfW(Math.min(this.yNear, Math.max(this.yFar, y))), x0 = this.W / 2 - hw;
    const u = Math.min(this.cols - 0.001, Math.max(0, (x - x0) / (2 * hw) * this.cols));
    void yy;
    return { u, v };
  }
  pointAt(u, v) {
    const r = Math.min(this.rows - 1, Math.floor(v)), y = this.rowY[r] + (v - r) * (this.rowY[r + 1] - this.rowY[r]);
    return { x: this.xAt(u, y), y, persp: this.halfW(y) / this.halfW(this.yNear) };
  }
  halfW(y) { const k = (y - this.yFar) / Math.max(1, this.yNear - this.yFar); return (this.wFar + (this.wNear - this.wFar) * k) / 2; }
  xAt(c, y) { const hw = this.halfW(y); return this.W / 2 - hw + (2 * hw) * c / this.cols; }
  quad(r, c) {
    const y0 = this.rowY[r], y1 = this.rowY[r + 1];
    return [[this.xAt(c, y0), y0], [this.xAt(c + 1, y0), y0], [this.xAt(c + 1, y1), y1], [this.xAt(c, y1), y1]];
  }
  center(r, c) { const y = (this.rowY[r] + this.rowY[r + 1]) / 2; return { x: (this.xAt(c, y) + this.xAt(c + 1, y)) / 2, y, w: this.xAt(c + 1, y) - this.xAt(c, y), h: this.rowY[r + 1] - this.rowY[r] }; }
  /** Ngoài lưới thì kẹp vào ô gần nhất (đứng sát mép vẫn tính ô mép). */
  locate(x, y) {
    let r = this.rows - 1;
    for (let i = 0; i < this.rows; i++) if (y < this.rowY[i + 1]) { r = i; break; }
    if (this.rows === 1) r = 0;
    const yy = Math.min(this.yNear, Math.max(this.yFar, y));
    const hw = this.halfW(yy), x0 = this.W / 2 - hw;
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - x0) / (2 * hw) * this.cols)));
    return { r, c };
  }
}

export class TileGame {
  constructor({ rows, cols, seed = Date.now(), lagMs = 0, cfg = {} }) {
    this.cfg = { ...TILES, ...cfg };
    Object.assign(this, { rows, cols, lagMs });
    this.rand = rng(seed);
    this.n = rows * cols;
    this.tiles = new Array(this.n).fill('g');
    this.round = 0; this.phase = 'idle'; this.phaseT = 0; this.events = []; this.over = false;
    this.roster = []; this.winner = null; this.reshuffled = false;
  }

  /** Người có mặt lúc bắt đầu sẽ được đăng ký vào ván. */
  start(ids) {
    const lives = ids.length > 1 ? this.cfg.livesMulti : this.cfg.livesSolo;
    this.roster = ids.map((id, i) => ({ id, n: i + 1, lives, alive: true, survived: 0, lastResult: null }));
    this.solo = ids.length <= 1;
    this._nextRound();
  }

  get alive() { return this.roster.filter(p => p.alive); }
  get score() { return this.solo ? (this.roster[0]?.survived ?? 0) : 0; } // chơi 1 người: số vòng sống sót
  get timeLeft() { return this.phase === 'move' ? Math.max(0, this.moveDur - this.phaseT) : 0; }
  idx(r, c) { return r * this.cols + c; }
  colorAt(r, c) { return this.tiles[this.idx(r, c)]; }
  drain() { const e = this.events; this.events = []; return e; }

  _nextRound() {
    this.round++; this.phase = 'reveal'; this.phaseT = 0; this.reshuffled = false;
    this.moveDur = this.cfg.moveSec(this.round);
    this.pendingOccupied = null;
    this.events.push({ kind: 'round', round: this.round });
  }

  /** Sinh ô đỏ/xanh; ô đang có người đứng hay bị đỏ để buộc di chuyển; luôn đủ ô xanh cho số người còn sống. */
  _pattern(occupied) {
    const n = this.n, reds = new Set();
    const minGreen = Math.max(1, Math.min(n - 1, this.alive.length));
    const target = Math.min(n - minGreen, Math.round(n * this.cfg.redFrac(this.round)));
    for (const k of occupied) if (reds.size < target && this.rand() < this.cfg.occupiedRedProb) reds.add(k);
    const pool = [...Array(n).keys()].filter(k => !reds.has(k));
    while (reds.size < target && pool.length) reds.add(pool.splice(Math.floor(this.rand() * pool.length), 1)[0]);
    this.tiles = [...Array(n).keys()].map(k => (reds.has(k) ? 'r' : 'g'));
  }

  /**
   * @param pos Map id → {r,c} | null (null = không thấy người đó)
   */
  update(dt, tMs, pos) {
    if (this.over || this.phase === 'idle') return;
    this.phaseT += dt;
    const occupied = () => this.alive.map(p => pos.get(p.id)).filter(Boolean).map(q => this.idx(q.r, q.c));
    if (this.phase === 'reveal') {
      if (this.phaseT >= this.cfg.revealSec) { this._pattern(occupied()); this.phase = 'move'; this.phaseT = 0; this.events.push({ kind: 'go' }); }
    } else if (this.phase === 'move') {
      if (!this.reshuffled && this.round >= this.cfg.reshuffleFrom && this.phaseT >= this.moveDur * 0.45) {
        this.reshuffled = true; this._pattern(occupied()); this.phaseT = Math.max(this.phaseT, this.moveDur * 0.35);
        this.events.push({ kind: 'reshuffle' });
      }
      // hết giờ + bù độ trễ màn hình (người chơi thấy đồng hồ về 0 muộn hơn lagMs)
      if (this.phaseT >= this.moveDur + this.lagMs / 1000) this._check(pos);
    } else if (this.phase === 'result') {
      if (this.phaseT >= this.cfg.resultSec) {
        if (this._isOver()) { this.over = true; this.phase = 'over'; this.events.push({ kind: 'over', winner: this.winner }); }
        else this._nextRound();
      }
    }
  }

  _check(pos) {
    for (const p of this.alive) {
      const q = pos.get(p.id);
      const burn = !q || this.colorAt(q.r, q.c) === 'r'; // không thấy người lúc chốt = không đứng trên ô xanh
      p.lastResult = q ? (burn ? 'burn' : 'safe') : 'missing'; p.lastTile = q;
      if (burn) { p.lives--; if (p.lives <= 0) p.alive = false; this.events.push({ kind: 'burn', id: p.id, tile: q, out: !p.alive }); }
      else { p.survived++; this.events.push({ kind: 'safe', id: p.id, tile: q }); }
    }
    this.phase = 'result'; this.phaseT = 0;
  }

  _isOver() {
    if (this.solo) return this.alive.length === 0;
    if (this.alive.length <= 1) { this.winner = this.alive[0]?.id ?? null; return true; }
    return false;
  }
}
