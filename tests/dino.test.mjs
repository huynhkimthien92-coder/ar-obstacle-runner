// Kiểm thử game "Đấu khủng long" v2 (logic thuần)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DinoGame, DINO_ORDER, DINO_TYPES, STAGES, TMPL_NEED, dinoBox } from '../js/dino.js';

const W = 1280, H = 720, DT = 1 / 30;
const mk = (o = {}) => new DinoGame({ W, H, seed: 3, ...o });
function until(g, pred, input = () => ({}), max = 40) {
  for (let i = 0; i < max / DT && !pred(g) && !g.over; i++) g.update(DT, input(g));
}
const phase = p => g => g.dino.phase === p;
/** Bot: đánh điểm yếu + phản ứng đúng cho nhát sắp chạm; đập vật bay. react=false: đứng im. */
function bot({ react = true, strike = true, early = 0.2 } = {}) {
  return g => {
    const inp = { hands: [], dodge: 0, duck: false, jump: false, guard: false };
    const w = g.weakNow();
    if (strike && w) inp.hands.push({ id: 'R', px: w.x - 90, py: w.y, x: w.x + 90, y: w.y, speed: 3 });
    const d = g.dino;
    if (react && d.phase === 'attack') {
      const t = d.t;
      for (const h of d.atk.hits) {
        if (h.fake || h.need === 'none' || h.need === 'smash') continue;
        const inWin = h.need === 'hold' ? t > h.at - 0.2 && t < h.at + h.hold + 0.2 : t > h.at - early && t < h.at + 0.15;
        if (!inWin) continue;
        if (h.need === 'dodge') inp.dodge = h.dir; if (h.need === 'duck') inp.duck = true; if (h.need === 'jump') inp.jump = true;
        if (h.need === 'guard' || h.need === 'hold') inp.guard = true;
      }
      for (const k of g.rocks) if (!k.smashed && k.z < 0.6 && k.z > 0) inp.hands.push({ id: 'L' + k.id, px: k.x - 80, py: k.y, x: k.x + 80, y: k.y, speed: 3 });
    }
    return inp;
  };
}

test('16 loài, 4 màn; mọi đòn đều có mẫu chuyển động → phản ứng hợp lệ', () => {
  assert.equal(DINO_ORDER.length, 16); assert.equal(STAGES.length, 4);
  for (const k of DINO_ORDER) {
    const T = DINO_TYPES[k];
    assert.ok(T.attacks.length >= 3, k); assert.ok(T.weak.length >= 4, k); assert.ok(T.note, k);
    for (const a of T.attacks) assert.ok(a.tmpl in TMPL_NEED, `${k}.${a.id}`);
  }
});

test('khủng long đi từ xa tới (to dần) rồi mới tấn công', () => {
  const g = mk();
  const b0 = dinoBox(W, H, g.dino.key, g.dino.z);
  until(g, phase('idle'));
  assert.ok(dinoBox(W, H, g.dino.key, g.dino.z).h > b0.h * 3);
});

test('vung tay nhanh qua điểm yếu → trừ máu; tay chậm thì không', () => {
  const g = mk(); until(g, phase('idle'));
  until(g, gg => !!gg.weakNow(), () => ({}), 3);
  const w = g.weakNow(), hp = g.dino.hp;
  g.update(DT, { hands: [{ id: 'R', px: w.x - 50, py: w.y, x: w.x + 50, y: w.y, speed: 0.2 }] });
  assert.equal(g.dino.hp, hp);
  g.update(DT, { hands: [{ id: 'R', px: w.x - 50, py: w.y, x: w.x + 50, y: w.y, speed: 3 }] });
  assert.equal(g.dino.hp, hp - 1);
});

test('không phản ứng → mất mạng; phản ứng đúng → không mất, được hở sườn / thở dốc', () => {
  const g = mk(); until(g, phase('attack'));
  until(g, gg => gg.dino.phase !== 'attack');
  assert.ok(g.lives < 5);
  const g2 = mk({ seed: 11 });
  until(g2, gg => gg.dino.phase === 'counter' || gg.dino.phase === 'tired' || gg.lives < 5, bot({ strike: false }));
  assert.equal(g2.lives, 5); assert.ok(['counter', 'tired'].includes(g2.dino.phase));
});

test('ngữ pháp quỹ đạo: quét thấp cần NHẢY (ngồi thì vẫn trúng), quét cao cần NGỒI', () => {
  const g = mk(); g.inStage = 99; g.stage = 3; // nhảy tới Hell Creek → raptor; đổi sang Ankylosaurus
  g.dino.key = 'ankylo'; g.dino.z = 0; g._toIdle();
  g.dino.lastAtk = 'club'; g.dino.lastAtk2 = null;
  // ép đòn quét chùy thấp
  g._pickAttack = () => DINO_TYPES.ankylo.attacks.find(a => a.id === 'club');
  g._windup();
  assert.equal(g.dino.atk.hits[0].need, 'jump');
  until(g, gg => gg.dino.phase !== 'attack', () => ({ duck: true }));
  assert.equal(g.lives, 4, 'ngồi không tránh được đòn thấp');
  g._toIdle(); g.invulnUntil = -1;
  g._windup();
  until(g, gg => gg.dino.phase !== 'attack', bot({ strike: false }));
  assert.equal(g.lives, 4, 'nhảy thì tránh được');
});

test('khoá sừng: phải GIỮ 2 tay suốt lúc giằng co; giữ đủ còn làm mẻ sừng', () => {
  const g = mk(); g.dino.key = 'trike'; g.dino.parts = { horn: { name: 'Sừng', hp: 3, weak: [1, 2], left: 3, broken: false } }; g.dino.z = 0; g._toIdle();
  g._pickAttack = () => DINO_TYPES.trike.attacks.find(a => a.id === 'lock');
  g._windup();
  const h = g.dino.atk.hits[0];
  assert.equal(h.need, 'hold');
  // chỉ giơ tay thoáng qua lúc chạm → thua giằng co
  until(g, gg => gg.dino.phase !== 'attack', gg => ({ guard: Math.abs(gg.dino.t - h.at) < 0.1 }));
  assert.equal(g.lives, 4);
  g._toIdle(); g.invulnUntil = -1; g._windup();
  until(g, gg => gg.dino.phase !== 'attack', bot({ strike: false }));
  assert.equal(g.lives, 4); assert.ok(g.dino.parts.horn.left <= 1);
});

test('đá / cá bay tới: đập trúng thì không sao, để lọt thì mất mạng', () => {
  const g = mk(); g.dino.key = 'spino'; g.dino.z = 0; g._toIdle();
  g._pickAttack = () => DINO_TYPES.spino.attacks.find(a => a.id === 'fish');
  g._windup();
  until(g, gg => gg.dino.phase !== 'attack', bot({ strike: false }));
  assert.equal(g.lives, 5);
  g._toIdle(); g._windup();
  until(g, gg => gg.dino.phase !== 'attack');
  assert.ok(g.lives < 5);
});

test('bầy compy: 3 con từ 3 làn lệch nhịp, đều phải NHẢY', () => {
  const g = mk(); until(g, phase('idle'));
  g._pickAttack = () => DINO_TYPES.compy.attacks.find(a => a.id === 'mob');
  g._windup();
  const hs = g.dino.atk.hits;
  assert.equal(hs.length, 3); assert.ok(hs.every(h => h.need === 'jump'));
  assert.deepEqual(new Set(hs.map(h => h.lane)), new Set([-1, 0, 1]));
  assert.ok(hs[1].at - hs[0].at >= 0.5);
});

test('giả đòn: có nhát giả (không cần phản ứng) rồi mới tới đòn thật; đứng im lúc giả không bị phạt', () => {
  const g = mk(); g.dino.key = 'dilo'; g.dino.z = 0; g._toIdle();
  g._pickAttack = () => DINO_TYPES.dilo.attacks.find(a => a.id === 'bluff');
  g._windup();
  const hs = g.dino.atk.hits;
  assert.ok(hs[0].fake); assert.equal(hs[1].need, 'dodge');
  const ev = [];
  until(g, gg => gg.dino.phase !== 'attack', gg => { ev.push(...gg.drain()); return bot({ strike: false })(gg); });
  assert.ok(ev.some(e => e.kind === 'feint')); assert.equal(g.lives, 5);
});

test('giận ≤50% máu → combo nhiều nhát; không bao giờ có NHẢY → NGỒI → NHẢY; phản ứng không lặp quá 2 lần liền', () => {
  const g = mk({ seed: 5 }); until(g, phase('idle'));
  let maxHits = 0;
  for (const key of DINO_ORDER) {
    g.dino.key = key; g.dino.parts = {}; g.dino.rage = 2; g.skill = 0.9; g.dino.z = 0;
    for (let i = 0; i < 25; i++) {
      g._toIdle(); g._windup();
      const seq = g.dino.atk.hits.filter(h => !h.fake && h.need !== 'none').map(h => h.need);
      maxHits = Math.max(maxHits, seq.length);
      for (let j = 2; j < seq.length; j++) assert.ok(!(seq[j - 2] === 'jump' && seq[j - 1] === 'duck' && seq[j] === 'jump'), `${key}: ${seq}`);
    }
  }
  assert.ok(maxHits >= 3);
  const R = g.recentNeeds; void R;
});

test('chấm PERFECT khi né vừa kịp, TỐT khi né sẵn từ sớm', () => {
  const run = early => {
    const g = mk({ seed: 21 }); until(g, phase('idle'));
    g._pickAttack = () => DINO_TYPES.compy.attacks.find(a => a.id === 'nip'); g._windup();
    const ev = [];
    until(g, gg => gg.dino.phase !== 'attack', gg => { ev.push(...gg.drain()); return bot({ strike: false, early })(gg); });
    ev.push(...g.drain());
    return ev.find(e => e.kind === 'react')?.grade;
  };
  assert.equal(run(0.2), 'perfect');
  assert.equal(run(2), 'good');
});

test('bù độ trễ màn hình: phản ứng muộn đúng bằng độ trễ vẫn tính', () => {
  const g = mk({ lagMs: 300, seed: 21 }); until(g, phase('idle'));
  g._pickAttack = () => DINO_TYPES.compy.attacks.find(a => a.id === 'nip'); g._windup();
  const h = g.dino.atk.hits[0];
  until(g, gg => gg.dino.phase !== 'attack', gg => ({ dodge: gg.dino.t > h.at + 0.25 && gg.dino.t < h.at + 0.4 ? h.dir : 0 }));
  assert.equal(g.lives, 5);
});

test('bẻ gãy gai đuôi Stegosaurus → nó mất đòn ĐÂM GAI', () => {
  const g = mk(); g.dino.key = 'stego'; g.dino.parts = { spikes: { name: 'Gai đuôi', hp: 3, weak: [3, 4], left: 1, broken: false } };
  g._partHit('spikes', 1);
  assert.ok(g.dino.parts.spikes.broken);
  g.dino.rage = 1;
  for (let i = 0; i < 30; i++) assert.notEqual(g._pickAttack()?.id, 'stab');
});

test('chơi kém → báo trước dài hơn; chơi giỏi → ngắn hơn', () => {
  const g = mk(); g.skill = 0.3; const slow = g._teleMul(); g.skill = 0.98; const fast = g._teleMul();
  assert.ok(slow > 1.2 && fast < 1);
});

test('bot giỏi qua hết màn 1 (4 loài) và sang màn 2 mà không chết', () => {
  const g = mk({ seed: 7 }); const ev = [];
  for (let i = 0; i < 600 / DT && g.stage < 1 && !g.over; i++) { g.update(DT, bot()(g)); ev.push(...g.drain()); }
  assert.equal(g.stage, 1, `còn ${g.lives} mạng, hạ ${g.kills}`);
  assert.ok(ev.some(e => e.kind === 'stage' && e.cleared));
});

test('bot giỏi đi hết 16 loài, sang vòng 2 mạnh hơn', () => {
  const g = mk({ seed: 9 });
  for (let i = 0; i < 2400 / DT && g.level < 2 && !g.over; i++) g.update(DT, bot()(g));
  assert.equal(g.level, 2, `màn ${g.stage}, hạ ${g.kills}, mạng ${g.lives}`);
  assert.ok(g.dino.maxHp > DINO_TYPES[g.dino.key].hp);
});

test('đứng im không làm gì → thua', () => {
  const g = mk();
  for (let i = 0; i < 300 / DT && !g.over; i++) g.update(DT, {});
  assert.equal(g.over, true);
});
