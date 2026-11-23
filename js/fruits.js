// GAME "CHÉM TRÁI CÂY": trái cây rơi từ trên xuống, người chơi vung tay (lưỡi chém) cắt ngang trái để ghi điểm.
// Tránh bom (mất 1 mạng), chém trái vàng (khế) +5 giây. Chém liên tiếp nhiều trái trong một nhát = combo.
// 2 người: cùng chém chung một bầu trời, ai nhiều điểm hơn thắng. Bom không trừ mạng mà −5 điểm + "choáng" 1,2 giây.
// Thuần logic (đơn vị: pixel khung vẽ W×H, thời gian giây) → test được bằng Node.
import { rng } from './game.js';

export const FRUIT_TYPES = [
  { key: 'watermelon', name: 'Dưa hấu', r: 0.078, pts: 1 },
  { key: 'orange', name: 'Cam', r: 0.052, pts: 1 },
  { key: 'apple', name: 'Táo', r: 0.05, pts: 1 },
  { key: 'mango', name: 'Xoài', r: 0.056, pts: 1 },
  { key: 'dragon', name: 'Thanh long', r: 0.06, pts: 2 },
];

export const FRUIT_CFG = {
  duration: 75,                 // giây mỗi lượt
  lives: 3,                     // chém trúng bom 3 lần là hết lượt
  minSpeed: 0.7,                // (PH) tay phải đi nhanh hơn 0.7 × chiều cao màn hình mỗi giây mới tính là "chém"
  hitPad: 0.012,                // (PH) nới vùng trúng thêm 1.2% chiều cao màn hình — chơi bằng người thật cần dễ hơn ngón tay
  comboWindow: 0.3,             // các trái bị cùng một tay chém trong 0.3s = 1 nhát
  spawnEvery: e => Math.max(0.55, 1.35 - 0.012 * e),          // (PH) nhịp rơi nhanh dần
  perSpawn: e => 1 + Math.floor(Math.min(2, e / 22)),         // (PH) 1 → 3 trái mỗi đợt
  gravity: e => Math.min(0.62, 0.3 + 0.004 * e),              // (PH) × H / s²: rơi chậm lúc đầu (~2s từ đỉnh xuống đáy)
  bombProb: e => (e < 8 ? 0 : Math.min(0.18, 0.05 + 0.002 * e)),
  goldProb: 0.035,
  maxObjects: 9,
  duo: { bombPenalty: 5, stunSec: 1.2, extraPerSpawn: 1, maxObjects: 12 }, // luật khi 2 người chơi
};

/** Khoảng cách từ điểm (cx,cy) tới đoạn thẳng A→B. */
export function segDist(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / L2)) : 0;
  return Math.hypot(ax + t * dx - cx, ay + t * dy - cy);
}

export class FruitGame {
  constructor({ W, H, seed = Date.now(), cfg = {}, players = 1 }) {
    this.cfg = { ...FRUIT_CFG, ...cfg };
    Object.assign(this, { W, H });
    this.players = players >= 2 ? 2 : 1; this.duo = this.players === 2;
    this.p = Array.from({ length: this.players }, () => ({ score: 0, sliced: 0, bestCombo: 0, stunUntil: -1 }));
    this.rand = rng(seed);
    this.objs = []; this.nextId = 1; this.events = [];
    this.time = this.cfg.duration; this.elapsed = 0; this.spawnT = 0.6;
    this.score = 0; this.lives = this.cfg.lives; this.sliced = 0; this.missed = 0; this.bestCombo = 0;
    this.combo = new Map(); // tay → { n, last }
    this.over = false;
  }
  drain() { const e = this.events; this.events = []; return e; }

  _spawn() {
    const c = this.cfg, e = this.elapsed;
    const n = c.perSpawn(e) + (this.duo ? c.duo.extraPerSpawn : 0);
    const maxO = this.duo ? c.duo.maxObjects : c.maxObjects;
    for (let i = 0; i < n && this.objs.length < maxO; i++) {
      const roll = this.rand();
      let kind = 'fruit', type = FRUIT_TYPES[Math.floor(this.rand() * FRUIT_TYPES.length)];
      if (roll < c.bombProb(e)) { kind = 'bomb'; type = { key: 'bomb', r: 0.055, pts: 0 }; }
      else if (roll < c.bombProb(e) + c.goldProb) { kind = 'gold'; type = { key: 'gold', r: 0.05, pts: 5 }; }
      const r = type.r * this.H;
      this.objs.push({
        id: this.nextId++, kind, type: type.key, pts: type.pts, r,
        x: this.W * (0.12 + 0.76 * this.rand()), y: -r - this.rand() * this.H * 0.15,
        vx: (this.rand() - 0.5) * this.W * 0.08, vy: this.H * (0.04 + 0.12 * this.rand()),
        rot: this.rand() * Math.PI * 2, vr: (this.rand() - 0.5) * 3, sliced: false,
      });
    }
  }

  /**
   * @param hands [{ id, pid, x, y, px, py, speed }] — vị trí lưỡi chém hiện tại & trước đó (px), tốc độ theo đơn vị H/giây;
   *              pid = người chơi 0 / 1 (mặc định 0)
   */
  update(dt, hands = []) {
    if (this.over) return;
    const c = this.cfg, H = this.H;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt; this.time -= dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this._spawn(); this.spawnT = c.spawnEvery(this.elapsed); }
    const g = c.gravity(this.elapsed) * H;
    for (const o of this.objs) { o.vy += g * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt; }

    const now = this.elapsed;
    for (const h of hands) {
      const pid = Math.min(this.players - 1, h.pid || 0), P = this.p[pid];
      if (!(h.speed >= c.minSpeed) || h.px == null || P.stunUntil > now) continue;
      for (const o of this.objs) {
        if (o.sliced) continue;
        if (segDist(h.px, h.py, h.x, h.y, o.x, o.y) > o.r + c.hitPad * H) continue;
        o.sliced = true;
        const angle = Math.atan2(h.y - h.py, h.x - h.px);
        if (o.kind === 'bomb') {
          if (this.duo) {
            const lost = Math.min(P.score, c.duo.bombPenalty);
            P.score -= lost; P.stunUntil = now + c.duo.stunSec; this.combo.delete(h.id);
            this.events.push({ kind: 'bomb', o, pid, lost });
            break; // choáng: nhát này dừng luôn
          }
          this.lives--; this.events.push({ kind: 'bomb', o, pid });
          if (this.lives <= 0) this._end('bomb');
          continue;
        }
        const st = this.combo.get(h.id);
        const cnt = st && now - st.last <= c.comboWindow ? st.n + 1 : 1;
        this.combo.set(h.id, { n: cnt, last: now, pid });
        this.sliced++; P.sliced++;
        this.score += o.pts; P.score += o.pts;
        if (o.kind === 'gold') { this.time += 5; this.events.push({ kind: 'gold', o, angle, pid }); }
        else this.events.push({ kind: 'slice', o, angle, combo: cnt, pid });
      }
    }
    // kết thúc combo: thưởng thêm bằng số trái trong nhát (từ 3 trái)
    for (const [id, st] of this.combo) {
      if (now - st.last > c.comboWindow) {
        if (st.n >= 3) {
          const P = this.p[st.pid || 0];
          this.score += st.n; P.score += st.n; P.bestCombo = Math.max(P.bestCombo, st.n);
          this.bestCombo = Math.max(this.bestCombo, st.n); this.events.push({ kind: 'combo', n: st.n, hand: id, pid: st.pid || 0 });
        }
        this.combo.delete(id);
      }
    }
    // trái chạm đáy: rơi mất (không trừ mạng — chơi bằng người thật nên chỉ phạt bom)
    this.objs = this.objs.filter(o => {
      if (o.sliced) return false;
      if (o.y - o.r > H) { if (o.kind !== 'bomb') { this.missed++; this.events.push({ kind: 'miss', o }); } return false; }
      return true;
    });
    if (this.time <= 0) { this.time = 0; this._end('time'); }
  }

  /** 2 người: chỉ số người thắng (0/1), -1 = hoà. */
  winner() { if (!this.duo) return 0; const [a, b] = this.p; return a.score === b.score ? -1 : a.score > b.score ? 0 : 1; }
  stunned(pid) { return (this.p[pid]?.stunUntil ?? -1) > this.elapsed; }

  _end(reason) { if (this.over) return; this.over = true; this.endReason = reason; this.events.push({ kind: 'over', reason }); }
}
