// Logic game thuần (không DOM): thế giới, spawn theo chunk, va chạm với trạng thái tư thế, điểm.
import { CONFIG } from './config.js';
import { T, HAZARDS, TUTORIAL, CHUNKS, chunkDuration } from './levels.js';

export function rng(seed) { // mulberry32 — có seed để test lặp lại được
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  constructor({ seed = Date.now(), tutorial = true, cfg = {} } = {}) {
    this.cfg = { ...CONFIG.GAME, ...cfg };
    this.seed = seed; this.withTutorial = tutorial;
    this.reset();
  }

  reset() {
    const c = this.cfg;
    this.rand = rng(this.seed);
    this.time = 0; this.rampTime = 0; this.traveled = 0; this.speed = c.speedStart;
    this.lives = c.lives; this.points = 0; this.coins = 0; this.stars = 0;
    this.streak = 0; this.combo = 1; this.dodged = 0; this.hits = 0;
    this.obstacles = []; this.spawnPos = 22; this.tutIdx = this.withTutorial ? 0 : TUTORIAL.length;
    this.lastChunk = null; this.nextId = 1;
    this.invulnUntil = 0; this.over = false; this.events = [];
    this.lastAir = -1e9; this.lastDuck = -1e9; this.lastHands = -1e9;
    this.hint = null; this.hintUntil = 0;
  }

  get score() { return Math.floor(this.traveled) + this.points; }
  get tier() { const d = this.cfg.tierDistance; let t = 1; for (let i = 1; i < d.length; i++) if (this.traveled >= d[i]) t = i; return Math.min(3, t); }
  get inTutorial() { return this.tutIdx < TUTORIAL.length || this.obstacles.some(o => o.tut && !o.done); }

  drain() { const e = this.events; this.events = []; return e; }

  /** player: { lane, airborne, ducking, handsUp, oneHandUp } ; tMs: đồng hồ thực (ms) */
  update(dt, tMs, player) {
    if (this.over) return;
    const c = this.cfg;
    dt = Math.min(dt, 0.1); // tab bị treo → không nhảy cóc qua chướng ngại
    if (player.airborne) this.lastAir = tMs;
    if (player.ducking) this.lastDuck = tMs;
    if (player.handsUp || player.oneHandUp) this.lastHands = tMs;

    this.time += dt;
    if (!this.inTutorial) this.rampTime += dt;
    this.speed = Math.min(c.speedMax, c.speedStart + c.speedRamp * this.rampTime);
    this.traveled += this.speed * dt;

    while (this.spawnPos - this.traveled < c.viewDist) this._spawnChunk(player.lane);

    // TV/máy chiếu hiện hình chậm hơn L ms → người chơi thấy vật chạm vạch muộn hơn L ms → xét va chạm muộn tương ứng
    const plane = -this.speed * (c.displayLagMs || 0) / 1000;
    for (const ob of this.obstacles) {
      ob.z = ob.pos - this.traveled;
      if (ob.hint && !ob.hinted && ob.z < 32) { ob.hinted = true; this.hint = ob.hint; this.hintUntil = tMs + 2200; }
      if (!ob.done && (ob.pendingUntil || ob.z <= plane)) this._resolve(ob, player, tMs);
      if (this.over) break;
    }
    this.obstacles = this.obstacles.filter(o => o.z > Math.min(-10, plane - 4));
    if (this.hint && tMs > this.hintUntil) this.hint = null;
  }

  /**
   * Động tác cần làm kế tiếp cho người chơi đang đứng ở `lane` (để hiện mũi tên lớn + phát âm báo).
   * Trả { action: 'jump'|'duck'|'move'|'hands', dir: -1|1 (khi move), t: giây còn lại, ob } hoặc null.
   */
  nextCue(lane, horizonSec = 1.3) {
    const plane = -this.speed * (this.cfg.displayLagMs || 0) / 1000;
    const win = this.speed * horizonSec;
    let best = null;
    for (const o of this.obstacles) {
      if (o.done || o.taken) continue;
      const dz = o.z - plane;
      if (dz < -1 || dz > win) continue;
      let action = null;
      if (o.type === T.HURDLE || (o.type === T.FIRE && (o.lane === -1 || o.lane === lane))) action = 'jump';
      else if (o.type === T.BAR) action = 'duck';
      else if (o.type === T.WALL && o.lane === lane) action = 'move';
      else if (o.type === T.STAR && o.lane === lane) action = 'hands';
      if (action && (!best || dz < best.dz)) best = { action, dz, ob: o };
    }
    if (!best) return null;
    best.t = Math.max(0, best.dz / this.speed);
    if (best.action === 'move') {
      const blocked = new Set(this.obstacles
        .filter(o => !o.done && (o.type === T.WALL || o.type === T.FIRE) && Math.abs(o.z - best.ob.z) < 3)
        .flatMap(o => (o.lane === -1 ? [0, 1, 2] : [o.lane])));
      const free = [lane - 1, lane + 1].filter(l => l >= 0 && l <= 2 && !blocked.has(l));
      const far = [0, 1, 2].filter(l => !blocked.has(l)).sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0];
      const target = free[0] ?? far ?? (lane === 0 ? 1 : lane - 1);
      best.dir = target < lane ? -1 : 1;
    }
    return best;
  }

  _spawnChunk(playerLane) {
    let ch;
    if (this.tutIdx < TUTORIAL.length) ch = TUTORIAL[this.tutIdx++];
    else {
      const top = this.tier;
      const tier = this.rand() < 0.6 ? top : 1 + Math.floor(this.rand() * top);
      const pool = CHUNKS[tier].filter(x => x !== this.lastChunk);
      ch = pool[Math.floor(this.rand() * pool.length)];
    }
    this.lastChunk = ch;
    const P = playerLane ?? 1;
    const others = [0, 1, 2].filter(l => l !== P);
    if (this.rand() < 0.5) others.reverse();
    const map = { P, X: others[0], Y: others[1], A: -1 };
    const tut = TUTORIAL.includes(ch);
    const start = this.spawnPos - Math.min(0, ...ch.events.map(e => e.t)) * this.speed;
    for (const e of ch.events) {
      this.obstacles.push({
        id: this.nextId++, type: e.type, lane: typeof e.lane === 'number' ? e.lane : map[e.lane],
        pos: start + e.t * this.speed, z: Infinity, done: false, hint: e.hint, chunk: ch.id, tut,
      });
    }
    this.spawnPos = start + (chunkDuration(ch) + this.cfg.chunkGapSec * (tut ? 1.4 : 1)) * this.speed;
  }

  _resolve(ob, p, t) {
    const c = this.cfg;
    const air = p.airborne || t - this.lastAir <= c.forgiveMs;
    const duck = p.ducking || t - this.lastDuck <= c.forgiveMs;
    const hands = t - this.lastHands <= c.forgiveMs + 200;
    const inLane = ob.lane === -1 || ob.lane === p.lane;

    if (!HAZARDS.has(ob.type)) ob.done = true;
    if (ob.type === T.COIN) {
      if (inLane) { ob.taken = true; this.coins++; this.points += c.coinScore * this.combo; this.events.push({ kind: 'coin', ob }); }
      return;
    }
    if (ob.type === T.STAR) {
      if (inLane && hands) { ob.taken = true; this.stars++; this.points += c.starScore * this.combo; this.events.push({ kind: 'star', ob }); }
      else this.events.push({ kind: 'miss-star', ob });
      return;
    }
    if (!HAZARDS.has(ob.type)) return;

    let hit;
    switch (ob.type) {
      case T.WALL: hit = inLane; break;
      case T.FIRE: hit = inLane && !air; break;
      case T.HURDLE: hit = !air; break;
      case T.BAR: hit = !duck; break;
    }
    // Cửa sổ "muộn": người chơi phản ứng SAU khi thấy → nếu chưa né, chờ thêm lateMs rồi mới chốt bị đâm
    if (hit && t >= this.invulnUntil) {
      ob.pendingUntil ||= t + c.lateMs;
      if (t < ob.pendingUntil) return;
    }
    ob.done = true; ob.pendingUntil = 0;
    // chướng ngại vật không ở làn mình (tường/lửa làn khác) thì không tính "né" để combo không ăn gian
    const relevant = inLane;
    if (hit && t < this.invulnUntil) { this.events.push({ kind: 'ghost', ob }); return; }
    if (hit) {
      this.lives--; this.hits++; this.streak = 0; this.combo = 1;
      this.invulnUntil = t + c.invulnMs;
      this.rampTime = Math.max(0, this.rampTime - 6); // bị đâm → chậm lại chút để hồi
      this.events.push({ kind: 'hit', ob });
      if (this.lives <= 0) { this.over = true; this.events.push({ kind: 'over' }); }
    } else if (relevant) {
      this.dodged++; this.streak++;
      this.combo = Math.min(c.comboMax, 1 + Math.floor(this.streak / 4));
      this.points += c.dodgeScore * this.combo;
      this.events.push({ kind: 'dodge', ob, how: ob.type === T.BAR ? 'duck' : (ob.type === T.HURDLE || (ob.type === T.FIRE && air)) ? 'jump' : 'move' });
    }
  }
}
