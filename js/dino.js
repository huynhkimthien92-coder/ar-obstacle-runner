// GAME "ĐẤU KHỦNG LONG": khủng long tiến tới, quay mặt thẳng vào màn hình (góc nhìn thứ nhất: người chơi chính là "camera").
// Người chơi vung tay đánh vào ĐIỂM YẾU đang sáng trên người khủng long. Khi nó gồng lên chuẩn bị tấn công (có báo trước),
// phải PHẢN ỨNG ĐÚNG: né sang bên (cắn / húc), ngồi xuống (quật đuôi, lao vồ), giơ 2 tay đỡ (gầm sóng âm), đập đá bay tới.
// Đỡ / né thành công → khủng long hở sườn: điểm yếu VÀNG to, đánh trúng x2 sát thương.
// Hạ gục → con tiếp theo. Vô tận, mỗi vòng 4 con mạnh dần. Thuần logic → test bằng Node.
import { rng } from './game.js';
import { segDist } from './fruits.js';

/** Điểm yếu tính theo khung hình khủng long: u = ngang (−0.5..0.5), v = cao (0 = chân, 1 = đỉnh đầu). */
export const DINO_TYPES = {
  raptor: { gold: [0, 0.6], name: 'Raptor', hp: 6, windup: 1.15, rest: [2.0, 2.8], attacks: ['bite', 'bite', 'pounce'], color: '#e0782b',
    weak: [[0, 0.86], [0, 0.6], [-0.2, 0.55], [0.2, 0.55], [0, 0.42]] },
  trike: { gold: [0, 0.55], name: 'Khủng long ba sừng', hp: 9, windup: 1.3, rest: [2.2, 3.0], attacks: ['charge', 'toss', 'charge'], color: '#5f86a8',
    weak: [[0, 0.62], [-0.28, 0.72], [0.28, 0.72], [0, 0.4], [-0.18, 0.3], [0.18, 0.3]] },
  ptero: { gold: [0, 0.62], name: 'Thằn lằn bay', hp: 7, windup: 1.2, rest: [2.0, 2.8], attacks: ['dive', 'rocks', 'dive'], color: '#8a5bc4',
    weak: [[0, 0.62], [0, 0.8], [-0.32, 0.66], [0.32, 0.66], [0, 0.48]] },
  trex: { gold: [0, 0.55], name: 'T-Rex', hp: 14, windup: 1.35, rest: [2.2, 3.2], attacks: ['bite', 'roar', 'tail', 'bite'], color: '#5b8a3a', boss: true,
    weak: [[0, 0.84], [-0.13, 0.9], [0.13, 0.9], [0, 0.55], [-0.15, 0.48], [0.15, 0.48]] },
};
export const DINO_ORDER = ['raptor', 'trike', 'ptero', 'trex'];

/** Đòn tấn công → cách phản ứng. need: move (kèm dir), duck, guard, smash (đập đá bằng tay). */
export const ATTACKS = {
  bite:   { label: 'CẮN!',        need: 'move' },
  pounce: { label: 'VỒ!',         need: 'duck' },
  charge: { label: 'HÚC!',        need: 'move' },
  toss:   { label: 'HẤT SỪNG!',   need: 'duck' },
  dive:   { label: 'LAO XUỐNG!',  need: 'duck' },
  tail:   { label: 'QUẬT ĐUÔI!',  need: 'duck' },
  roar:   { label: 'GẦM!',        need: 'guard' },
  rocks:  { label: 'NÉM ĐÁ!',     need: 'smash' },
};

export const DINO_CFG = {
  lives: 5,
  enterSec: 2.4,          // khủng long đi từ xa tới
  forgiveSec: 0.35,       // phản ứng sớm hơn lúc đòn trúng tối đa chừng này vẫn tính
  lateSec: 0.12,          // … và muộn hơn (sau khi đã bù độ trễ màn hình)
  weakLife: 1.7,          // điểm yếu tồn tại bao lâu rồi chuyển chỗ
  weakGap: 0.25,          // nghỉ giữa 2 điểm yếu
  weakR: 0.075,           // bán kính điểm yếu (× H)
  counterSec: 1.3,        // thời gian hở sườn sau khi đỡ / né thành công
  counterR: 0.11,
  minSpeed: 0.8,          // tay nhanh hơn 0.8 × H mỗi giây mới tính là đòn đánh
  rockCount: 3, rockSec: 1.5, rockR: 0.06, rockHitZ: 0.75,  // đá bay tới: đập được khi đã bay gần (z < 0.75)
  invulnSec: 1.0,
  downSec: 1.8,
  levelHp: 0.4, levelSpeed: 0.88, // mỗi vòng: máu +40%, thời gian gồng / nghỉ ×0.88
};

/** Khung hình khủng long trên màn hình theo độ xa z (1 = chân trời, 0 = sát mặt). Dùng chung cho logic & vẽ. */
export function dinoBox(W, H, type, z = 0, sway = 0) {
  const s = 0.16 + 0.84 * (1 - z) * (1 - z) * 0.35 + 0.84 * (1 - z) * 0.65; // xa nhỏ, gần to (cong nhẹ cho cảm giác lao tới)
  const fly = type === 'ptero';
  const h = H * (type === 'trike' ? 0.62 : fly ? 0.55 : 0.8) * s;
  const w = h * (type === 'trike' ? 1.45 : fly ? 1.9 : type === 'trex' ? 0.95 : 0.8);
  const horizon = H * 0.42, ground = H * 0.97;
  const yFeet = horizon + (ground - horizon) * (fly ? 0.75 : 1) * Math.min(1, s * 1.05) - (fly ? H * 0.05 * (1 - z) : 0);
  return { x: W / 2 + sway * W * 0.06 * s, y: yFeet, w, h, s };
}

export class DinoGame {
  constructor({ W, H, seed = Date.now(), lagMs = 0, cfg = {} }) {
    this.cfg = { ...DINO_CFG, ...cfg };
    Object.assign(this, { W, H, lagMs });
    this.rand = rng(seed);
    this.clock = 0; this.events = []; this.over = false;
    this.lives = this.cfg.lives; this.score = 0; this.combo = 0; this.bestCombo = 0; this.kills = 0;
    this.hits = 0; this.blocks = 0; this.hurt = 0;
    this.level = 1; this.wave = 0; this.invulnUntil = -1;
    this.hist = []; // lịch sử phản ứng { t, dodge, duck, guard }
    this.rocks = [];
    this._nextDino();
  }
  drain() { const e = this.events; this.events = []; return e; }
  get mult() { return 1 + Math.min(3, Math.floor(this.combo / 5)); }

  _nextDino() {
    const key = DINO_ORDER[this.wave % DINO_ORDER.length];
    if (this.wave > 0 && this.wave % DINO_ORDER.length === 0) this.level++;
    this.wave++;
    const T = DINO_TYPES[key], c = this.cfg, lv = this.level - 1;
    const sp = Math.pow(c.levelSpeed, lv);
    this.dino = {
      key, name: T.name, maxHp: Math.round(T.hp * (1 + c.levelHp * lv)), windup: T.windup * Math.max(0.6, sp), rest: T.rest.map(r => r * Math.max(0.55, sp)),
      phase: 'enter', t: 0, z: 1, sway: 0, flash: 0, recoil: 0, attack: null, attackIdx: 0, weak: null, weakT: 0, lastWeak: -1,
    };
    this.dino.hp = this.dino.maxHp;
    this.events.push({ kind: 'enter', key, name: T.name, wave: this.wave, level: this.level, boss: !!T.boss });
  }

  _weakPos(w) {
    const d = this.dino, B = dinoBox(this.W, this.H, d.key, d.z, d.sway);
    return { x: B.x + w.u * B.w, y: B.y - w.v * B.h };
  }
  /** Điểm yếu đang hiện (toạ độ màn hình) — để vẽ. */
  weakNow() {
    const w = this.dino.weak;
    if (!w) return null;
    return { ...this._weakPos(w), r: (w.gold ? this.cfg.counterR : this.cfg.weakR) * this.H, gold: w.gold, life: w.life, age: w.age };
  }

  _spawnWeak(gold = false) {
    const list = DINO_TYPES[this.dino.key].weak;
    let i = Math.floor(this.rand() * list.length);
    if (i === this.dino.lastWeak) i = (i + 1) % list.length;
    this.dino.lastWeak = i;
    const [u, v] = gold ? DINO_TYPES[this.dino.key].gold : list[i];
    this.dino.weak = { u, v, gold, age: 0, life: gold ? this.cfg.counterSec : this.cfg.weakLife };
  }

  /**
   * @param input { hands: [{id,x,y,px,py,speed}], dodge: −1|0|1, duck, guard, present }
   */
  update(dt, input = {}) {
    if (this.over) return;
    dt = Math.min(dt, 0.1);
    const c = this.cfg, d = this.dino;
    this.clock += dt; d.t += dt;
    this.hist.push({ t: this.clock, dodge: input.dodge || 0, duck: !!input.duck, guard: !!input.guard });
    while (this.hist.length && this.clock - this.hist[0].t > 3) this.hist.shift();
    d.flash = Math.max(0, d.flash - dt * 4); d.recoil = Math.max(0, d.recoil - dt * 3);
    d.sway = Math.sin(this.clock * 0.9) * (d.phase === 'windup' ? 0.2 : 1);
    const hands = (input.hands || []).filter(h => h.speed >= c.minSpeed && h.px != null);

    if (d.phase === 'enter') {
      d.z = Math.max(0, 1 - d.t / c.enterSec);
      if (d.t >= c.enterSec) this._toIdle();
    } else if (d.phase === 'idle' || d.phase === 'counter') {
      this._weakUpdate(dt, hands);
      if (d.hp <= 0) return this._down();
      if (d.phase === 'counter' && d.t >= c.counterSec) this._toIdle();
      else if (d.phase === 'idle' && d.t >= d.restFor) this._windup();
    } else if (d.phase === 'windup') {
      if (d.t >= d.windup) { d.phase = 'attack'; d.t = 0; d.hitAt = this.clock; this.events.push({ kind: 'strike', attack: d.attack }); }
    } else if (d.phase === 'attack') {
      const A = d.attack;
      if (A.need === 'smash') this._rocksUpdate(dt, hands);
      else if (this.clock >= d.hitAt + this.lagMs / 1000 + c.lateSec) this._resolve(this._reacted(A, d.hitAt));
    } else if (d.phase === 'recover') {
      if (d.t >= 0.7) this._toIdle();
    } else if (d.phase === 'down') {
      if (d.t >= c.downSec) this._nextDino();
    }
  }

  _toIdle() {
    const d = this.dino;
    d.phase = 'idle'; d.t = 0; d.weak = null; d.weakT = 0.2;
    d.restFor = d.rest[0] + (d.rest[1] - d.rest[0]) * this.rand();
  }

  _windup() {
    const d = this.dino, T = DINO_TYPES[d.key];
    const kind = T.attacks[d.attackIdx++ % T.attacks.length];
    const A = { kind, ...ATTACKS[kind] };
    if (A.need === 'move') A.dir = this.rand() < 0.5 ? -1 : 1; // hướng người chơi phải né tới
    d.attack = A; d.phase = 'windup'; d.t = 0; d.weak = null;
    this.events.push({ kind: 'windup', attack: A, windup: d.windup });
  }

  /** Người chơi có phản ứng đúng trong cửa sổ [đòn trúng − forgive, đòn trúng + trễ màn hình + late] không. */
  _reacted(A, hitAt) {
    const c = this.cfg, t0 = hitAt - c.forgiveSec, t1 = hitAt + this.lagMs / 1000 + c.lateSec;
    return this.hist.some(h => h.t >= t0 && h.t <= t1 && (
      A.need === 'move' ? h.dodge === A.dir :
      A.need === 'duck' ? h.duck :
      A.need === 'guard' ? h.guard : false));
  }

  _resolve(ok) {
    const d = this.dino;
    if (ok) {
      this.blocks++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += 5 * this.mult;
      this.events.push({ kind: 'dodged', attack: d.attack });
      d.phase = 'counter'; d.t = 0; this._spawnWeak(true); // hở sườn!
    } else {
      this._hurt(d.attack);
      d.phase = 'recover'; d.t = 0;
    }
  }

  _hurt(attack) {
    if (this.clock < this.invulnUntil) return;
    this.lives--; this.hurt++; this.combo = 0; this.invulnUntil = this.clock + this.cfg.invulnSec;
    this.events.push({ kind: 'hurt', attack, lives: this.lives });
    if (this.lives <= 0) { this.over = true; this.events.push({ kind: 'over' }); }
  }

  _weakUpdate(dt, hands) {
    const d = this.dino, c = this.cfg;
    if (!d.weak) { d.weakT -= dt; if (d.weakT <= 0 && d.phase === 'idle') this._spawnWeak(false); return; }
    const w = d.weak; w.age += dt;
    const P = this._weakPos(w), r = (w.gold ? c.counterR : c.weakR) * this.H;
    for (const h of hands) {
      if (segDist(h.px, h.py, h.x, h.y, P.x, P.y) > r) continue;
      const dmg = w.gold ? 2 : 1;
      d.hp = Math.max(0, d.hp - dmg); d.flash = 1; d.recoil = 1;
      this.hits++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.score += 10 * dmg * this.mult;
      this.events.push({ kind: 'hit', x: P.x, y: P.y, dmg, gold: w.gold, angle: Math.atan2(h.y - h.py, h.x - h.px) });
      d.weak = null; d.weakT = c.weakGap;
      if (w.gold) { d.phase = 'idle'; d.t = Math.max(0, d.restFor - 0.8); } // đánh xong đòn phản công → sắp tới lượt nó
      return;
    }
    if (w.age >= w.life) { d.weak = null; d.weakT = c.weakGap; if (w.gold) this._toIdle(); }
  }

  _rocksUpdate(dt, hands) {
    const d = this.dino, c = this.cfg;
    if (!d.rocksSpawned) {
      d.rocksSpawned = true; this.rocks = [];
      const from = this._weakPos({ u: 0, v: 0.75 });
      for (let i = 0; i < c.rockCount; i++) {
        // bay từ mỏ khủng long tới 1 điểm trên màn hình; vị trí hiện tại = nội suy theo độ gần (z)
        this.rocks.push({ id: i, fx: from.x, fy: from.y, tx: this.W * (0.2 + 0.6 * this.rand()), ty: this.H * (0.3 + 0.32 * this.rand()), z: 1 + i * 0.28, smashed: false });
      }
    }
    for (const k of this.rocks) { const f = 1 - Math.min(1, Math.max(0, k.z)) ** 2; k.x = k.fx + (k.tx - k.fx) * f; k.y = k.fy + (k.ty - k.fy) * f; k.r = c.rockR * this.H * (0.45 + 1.1 * (1 - Math.min(1, k.z))); }
    let anyHit = false;
    for (const k of this.rocks) {
      if (k.smashed || k.z <= 0) continue;
      k.z -= dt / c.rockSec;
      const r = k.r * 1.15;
      if (k.z < c.rockHitZ) for (const h of hands) {
        if (segDist(h.px, h.py, h.x, h.y, k.x, k.y) <= r) {
          k.smashed = true; this.score += 5 * this.mult; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.events.push({ kind: 'smash', x: k.x, y: k.y }); break;
        }
      }
      if (!k.smashed && k.z <= 0) anyHit = true;
    }
    if (anyHit) this._hurt(d.attack);
    if (this.rocks.every(k => k.smashed || k.z <= 0)) {
      const all = this.rocks.every(k => k.smashed);
      d.rocksSpawned = false; this.rocks = [];
      if (all) { this.blocks++; this.events.push({ kind: 'dodged', attack: d.attack }); d.phase = 'counter'; d.t = 0; this._spawnWeak(true); }
      else { d.phase = 'recover'; d.t = 0; }
    }
  }

  _down() {
    const d = this.dino;
    d.phase = 'down'; d.t = 0; d.weak = null; this.kills++;
    const bonus = 50 * this.level * (DINO_TYPES[d.key].boss ? 2 : 1);
    this.score += bonus;
    this.events.push({ kind: 'down', key: d.key, name: d.name, bonus });
  }
}
