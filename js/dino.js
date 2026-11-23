// GAME "ĐẤU KHỦNG LONG" (v2): góc nhìn thứ nhất, khủng long nhìn thẳng vào màn hình và tấn công người chơi.
// Thiết kế theo nghiên cứu (docs/GDD.md §3d):
//  • NGỮ PHÁP QUỸ ĐẠO thống nhất cho mọi loài: hướng & độ cao của đòn quyết định phản ứng —
//    thấp ngang → NHẢY · ngang đầu/ngực, vồ, bổ nhào → NGỒI · đâm/bổ thẳng → NÉ trái/phải ·
//    đẩy/gầm/luồng gió nước → GIƠ 2 TAY ĐỠ · khoá sừng → GIỮ 2 TAY · vật bay tới → ĐẬP · hồi đòn → ĐÁNH điểm yếu.
//  • Mỗi đòn là 1 chuỗi "nhát" (hit) có thời điểm chạm riêng → đòn đơn, đòn kép, combo, bầy đàn, đá/cá bay tới.
//  • Phase giận (≤50%, ≤25% máu) mở combo & giả đòn; thở dốc sau combo dài; bộ phận bẻ gãy được (sừng, gai đuôi).
//  • Cấm lặp theo PHẢN ỨNG (không chỉ theo đòn), giới hạn NHẢY/NGỒI, không ghép NHẢY → NGỒI → NHẢY.
//  • Độ khó tự chỉnh theo tỉ lệ phản ứng đúng (nhắm ~78%); chấm PERFECT (vừa kịp lúc chạm) / TỐT (đúng nhưng sớm).
//  • 4 màn theo nơi tìm thấy hoá thạch, 16 loài. Thuần logic → test bằng Node.
import { rng } from './game.js';
import { segDist } from './fruits.js';

/** Phản ứng cần làm → màu / icon / chữ (mã hoá 3 lớp: màu + icon + âm thanh, không chỉ dựa vào màu). */
export const RESP = {
  dodge: { color: '#ff3b3b', icon: '⬅', say: 'NÉ' },
  jump:  { color: '#ffd23f', icon: '⬆', say: 'NHẢY' },
  duck:  { color: '#c77dff', icon: '⬇', say: 'NGỒI' },
  guard: { color: '#4da3ff', icon: '🙌', say: 'GIƠ 2 TAY ĐỠ' },
  hold:  { color: '#4da3ff', icon: '🙌', say: 'GIỮ 2 TAY GIẰNG CO' },
  smash: { color: '#ffffff', icon: '👊', say: 'ĐẬP' },
  none:  { color: '#9aa4b8', icon: '✋', say: 'ĐỨNG YÊN' },
};
/** Mẫu chuyển động (dùng chung cho biên đạo) → phản ứng. */
export const TMPL_NEED = {
  bite: 'dodge', chop: 'dodge', charge: 'dodge', peck: 'dodge', leap: 'dodge', ram: 'dodge',
  sweepLow: 'jump', stomp: 'jump', snapLow: 'jump',
  sweepHigh: 'duck', pounce: 'duck', dive: 'duck', swipe: 'duck',
  roar: 'guard', gust: 'guard', wave: 'guard', butt: 'guard',
  lock: 'hold', throw: 'smash', myth: 'none', display: 'none', mob: 'dodge',
};

const A = (id, label, tmpl, o = {}) => ({ id, label, tmpl, tele: 1.1, rec: 1.0, w: 1, ...o });
/**
 * Loài: box (khung trên màn hình: h × H, tỉ lệ rộng/cao, fly/water), hp, rest (nghỉ giữa 2 đòn), weak (điểm yếu u,v),
 * punish (chỗ hở sau khi né / đỡ được — mỗi loài một cách hạ), parts (bộ phận bẻ gãy), attacks.
 * Ghi chú [BC] = có bằng chứng hoá thạch · [GT] = giả thuyết · [TK] = suy đoán thiết kế.
 */
export const DINO_TYPES = {
  // ---- Màn 1: Rừng Jura (Morrison / Bavaria) ----
  compy: { name: 'Compsognathus', note: 'Bé như con gà, lưng sẫm bụng sáng, mặt nạ mắt, đuôi khoang (theo họ hàng Sinosauropteryx) [BC]. Đi bầy là hư cấu [TK].',
    box: { h: 0.4, ar: 0.95 }, hp: 5, rest: [1.6, 2.2], punish: [0, 0.72],
    weak: [[0, 0.82], [0, 0.6], [-0.18, 0.55], [0.18, 0.55]],
    attacks: [A('mob', 'BẦY CẮN CHÂN!', 'mob', { tele: 1.15, adds: { kind: 'compy', n: 3 }, w: 3 }), A('dart', 'LAO VÀO CỔ CHÂN!', 'snapLow', { tele: 0.95, w: 2 }),
      A('nip', 'ĐỚP!', 'bite', { tele: 0.9, rec: 0.7, w: 2, feint: true }), A('lizard', 'CƯỚP THẰN LẰN!', 'throw', { proj: 'lizard', n: 2, w: 1 })] },
  dilo: { name: 'Dilophosaurus', note: 'Hai mào mảnh hình chữ "II" để phô diễn [GT]. KHÔNG có diềm cổ, KHÔNG phun độc — đó là phim [HUYỀN THOẠI].',
    box: { h: 0.72, ar: 0.78 }, hp: 8, rest: [1.8, 2.5], punish: [0, 0.84],
    weak: [[0, 0.86], [-0.1, 0.95], [0.1, 0.95], [0, 0.58], [0, 0.45]],
    attacks: [A('bite', 'CẮN!', 'bite', { tele: 1.0, w: 3, feint: true }), A('bluff', 'PHÔ MÀO DOẠ!', 'bite', { tele: 1.0, w: 2, forceFeint: true }),
      A('double', 'CẮN ĐÔI!', 'bite', { tele: 0.95, w: 1, rage: 1, double: true }), A('myth', 'HUYỀN THOẠI!', 'myth', { tele: 1.6, w: 0.6, once: true })] },
  stego: { name: 'Stegosaurus', note: 'Gai đuôi đâm thủng xương Allosaurus [BC]; ~10% gai bị gãy rồi lành [BC]. Phiến lưng để phô diễn, không phải giáp [GT].',
    box: { h: 0.62, ar: 1.5, quad: true }, hp: 11, rest: [2.0, 2.8], punish: [0, 0.6],
    weak: [[0, 0.62], [-0.2, 0.42], [0.2, 0.42], [0.42, 0.5], [-0.42, 0.5]],
    parts: { spikes: { name: 'Gai đuôi', hp: 3, weak: [3, 4] } },
    attacks: [A('tail', 'QUẤT ĐUÔI GAI!', 'sweepHigh', { tele: 1.25, rec: 2.0, w: 3 }), A('stab', 'ĐÂM GAI!', 'chop', { tele: 1.15, rec: 2.4, w: 2, part: 'spikes' }),
      A('twist', 'XOAY QUẤT ĐÔI!', 'sweepHigh', { tele: 1.2, rec: 1.6, w: 1, rage: 1, follow: 'chop' }), A('plates', 'PHÔ PHIẾN LƯNG', 'display', { tele: 2.2, w: 0.7 })] },
  allo: { name: 'Allosaurus', boss: true, note: 'Sọ nhẹ mà chịu lực tốt: "bổ như rìu" với hàm há rất rộng [GT, Rayfield 2001]. Mẫu "Big Al" có 19 vết thương [BC].',
    box: { h: 0.82, ar: 0.92 }, hp: 14, rest: [1.8, 2.6], punish: [0, 0.84],
    weak: [[0, 0.86], [-0.12, 0.92], [0.12, 0.92], [0, 0.55], [-0.16, 0.48], [0.16, 0.48]],
    attacks: [A('hatchet', 'BỔ RÌU!', 'chop', { tele: 1.05, rec: 1.3, w: 3, feint: true }), A('double', 'BỔ ĐÔI!', 'chop', { tele: 1.0, w: 2, double: true }),
      A('claw', 'CÀO 3 VUỐT!', 'swipe', { tele: 1.0, w: 2 }), A('roar', 'GẦM!', 'roar', { tele: 1.2, w: 1 })] },
  // ---- Màn 2: Sông kỷ Phấn trắng ----
  parasaur: { name: 'Parasaurolophus', note: 'Mào ống cộng hưởng ra tiếng rền trầm, mỗi con một cao độ [GT, mô phỏng CT Sandia].',
    box: { h: 0.78, ar: 1.0 }, hp: 9, rest: [2.0, 2.8], punish: [0, 0.8],
    weak: [[0, 0.84], [0, 0.6], [-0.2, 0.55], [0.2, 0.55]],
    attacks: [A('stampede', 'HOẢNG LOẠN LAO TỚI!', 'charge', { tele: 1.2, w: 3, feint: true }), A('boom', 'RỀN VANG!', 'roar', { tele: 1.4, w: 2 }),
      A('rear', 'ĐỨNG DẬY GIẬM!', 'stomp', { tele: 1.2, w: 2 }), A('herd', 'CẢ ĐÀN CHẠY TỚI!', 'mob', { tele: 1.2, adds: { kind: 'parasaur', n: 3 }, w: 1, rage: 1 })] },
  deino: { name: 'Deinosuchus', note: 'Cá sấu ~10 m, vết cắn trên xương khủng long [BC]. Phục kích ở mép nước [GT].',
    box: { h: 0.5, ar: 1.5, water: true }, hp: 10, rest: [2.0, 2.8], punish: [0, 0.55],
    weak: [[-0.2, 0.75], [0.2, 0.75], [0, 0.55], [0, 0.4]],
    attacks: [A('lunge', 'LAO KHỎI NƯỚC!', 'leap', { tele: 1.35, rec: 1.4, w: 3, feint: true }), A('edge', 'ĐỚP MÉP NƯỚC!', 'snapLow', { tele: 1.1, w: 2 }),
      A('slap', 'QUẬT ĐUÔI TÉ NƯỚC!', 'wave', { tele: 1.2, w: 2 })] },
  pachy: { name: 'Pachycephalosaurus', note: 'Vòm đầu dày, 22% vòm có tổn thương ở đỉnh trán [BC] — húc thẳng hay húc sườn còn tranh cãi [GT].',
    box: { h: 0.58, ar: 0.8 }, hp: 8, rest: [1.6, 2.3], punish: [0, 0.62],
    weak: [[0, 0.62], [-0.16, 0.5], [0.16, 0.5], [0, 0.42]],
    attacks: [A('ram', 'HÚC THẲNG!', 'ram', { tele: 1.1, rec: 1.1, w: 3, feint: true }), A('flank', 'HÚC SƯỜN!', 'ram', { tele: 1.0, w: 2, flank: true }),
      A('stomp', 'DẬM VĂNG ĐÁ!', 'throw', { proj: 'debris', n: 3, w: 1 }), A('double', 'HÚC ĐÔI!', 'ram', { tele: 0.95, w: 1, rage: 1, double: true })] },
  spino: { name: 'Spinosaurus', boss: true, note: 'Ăn cá [BC]. Bơi lặn hay lội rình như diệc — giới khoa học CÒN TRANH CÃI [GT].',
    box: { h: 0.86, ar: 0.95 }, hp: 16, rest: [1.8, 2.6], punish: [0, 0.8],
    weak: [[0, 0.82], [0, 0.6], [-0.18, 0.52], [0.18, 0.52], [0, 0.95]],
    attacks: [A('peck', 'MỔ KIỂU DIỆC!', 'peck', { tele: 1.05, w: 3, feint: true }), A('triple', 'MỔ 3 NHÁT!', 'peck', { tele: 0.9, w: 2, rage: 1, triple: true }),
      A('fish', 'HẤT CÁ!', 'throw', { proj: 'fish', n: 3, w: 2 }), A('sail', 'PHÔ BUỒM!', 'roar', { tele: 1.3, w: 1 }), A('emerge', 'TRỒI TỪ NƯỚC!', 'sweepLow', { tele: 1.25, w: 1 })] },
  // ---- Màn 3: Biển nội địa (Niobrara) ----
  ptero: { name: 'Pteranodon', note: 'Không phải khủng long — thằn lằn bay. Sải cánh tới 7 m mà chỉ 20–35 kg; có mẫu kẹt cá giữa hàm [BC].',
    box: { h: 0.55, ar: 1.9, fly: true }, hp: 8, rest: [1.8, 2.5], punish: [0, 0.62],
    weak: [[0, 0.62], [0, 0.8], [-0.32, 0.66], [0.32, 0.66], [0, 0.48]],
    attacks: [A('dive', 'BỔ NHÀO!', 'dive', { tele: 1.15, w: 3 }), A('skim', 'MỔ LƯỚT!', 'peck', { tele: 1.0, w: 2, feint: true }), A('fish', 'NHẢ CÁ!', 'throw', { proj: 'fish', n: 2, w: 2 })] },
  quetzal: { name: 'Quetzalcoatlus', note: 'Thằn lằn bay cao ngang hươu cao cổ, đi bộ rình mồi như cò [GT, Witton & Naish 2008].',
    box: { h: 0.92, ar: 0.95 }, hp: 10, rest: [2.0, 2.8], punish: [0, 0.9],
    weak: [[0, 0.9], [0, 0.62], [-0.25, 0.55], [0.25, 0.55]],
    attacks: [A('stork', 'RÌNH MỔ!', 'peck', { tele: 1.35, rec: 1.2, w: 3, feint: true }), A('low', 'MỔ THẤP!', 'snapLow', { tele: 1.15, w: 2 }),
      A('takeoff', 'BẬT CẤT CÁNH!', 'gust', { tele: 1.2, w: 1 }), A('swoop', 'SÀ XUỐNG!', 'dive', { tele: 1.1, w: 1, rage: 1 })] },
  mosa: { name: 'Mosasaurus', boss: true, note: 'Bò sát biển, đuôi có vây 2 thuỳ như cá mập [BC, Lindgren 2013]; lưng tối bụng sáng [BC].',
    box: { h: 0.78, ar: 1.15, water: true }, hp: 16, rest: [1.9, 2.6], punish: [0, 0.5],
    weak: [[0, 0.82], [-0.2, 0.75], [0.2, 0.75], [0, 0.5]],
    attacks: [A('breach', 'PHÓNG KHỎI NƯỚC!', 'leap', { tele: 1.3, rec: 1.4, w: 3, feint: true }), A('wave', 'QUẬT ĐUÔI SÓNG!', 'wave', { tele: 1.2, w: 2 }),
      A('surge', 'SÓNG NGẦM QUÉT!', 'sweepLow', { tele: 1.2, w: 1 }), A('ambush', 'LẶN ĐÁNH LỪA!', 'leap', { tele: 1.2, w: 1, rage: 1, forceFeint: true })] },
  // ---- Màn 4: Hell Creek ----
  raptor: { name: 'Velociraptor', note: 'Có lông [BC]. Vuốt liềm để ghim giữ mồi chứ không rạch [GT, Fowler 2011]. Săn bầy có tổ chức chưa được chứng minh — đúng hơn là "đám đông hỗn loạn" [GT].',
    box: { h: 0.8, ar: 0.8 }, hp: 7, rest: [1.6, 2.3], punish: [0, 0.86], env: 'night',
    weak: [[0, 0.86], [0, 0.6], [-0.2, 0.55], [0.2, 0.55], [0, 0.42]],
    attacks: [A('pounce', 'VỒ VÀ GHIM!', 'pounce', { tele: 1.1, w: 3 }), A('mob', 'CẢ BẦY ÙA TỚI!', 'mob', { tele: 1.15, adds: { kind: 'raptor', n: 3 }, w: 3 }),
      A('bite', 'CẮN!', 'bite', { tele: 0.95, w: 2, feint: true })] },
  trike: { name: 'Triceratops', note: 'Diềm bị tổn thương gấp ~10 lần loài họ hàng → khoá sừng đấu nhau [GT, Farke 2009]. Sừng gãy rồi lành [BC].',
    box: { h: 0.62, ar: 1.45, quad: true }, hp: 13, rest: [2.0, 2.8], punish: [0, 0.62],
    weak: [[0, 0.62], [-0.28, 0.72], [0.28, 0.72], [0, 0.4], [-0.18, 0.3], [0.18, 0.3]],
    parts: { horn: { name: 'Sừng', hp: 3, weak: [1, 2] } },
    attacks: [A('charge', 'HÚC LAO!', 'charge', { tele: 1.25, rec: 1.6, w: 3, feint: true }), A('lock', 'KHOÁ SỪNG!', 'lock', { tele: 1.2, hold: 1.3, w: 2 }),
      A('toss', 'HẤT SỪNG!', 'ram', { tele: 1.1, w: 2, part: 'horn' }), A('frill', 'QUÉT DIỀM!', 'sweepHigh', { tele: 1.15, w: 1 })] },
  ankylo: { name: 'Ankylosaurus', note: 'Chùy đuôi đập 7–14 kN, chỉ quét ngang ~100° và gần như không nâng lên được [BC] → đòn thấp, phải NHẢY.',
    box: { h: 0.5, ar: 1.75, quad: true }, hp: 13, rest: [2.0, 2.8], punish: [0, 0.4],
    weak: [[0, 0.42], [-0.3, 0.7], [0.3, 0.7], [0, 0.75]],
    attacks: [A('club', 'QUÉT CHÙY THẤP!', 'sweepLow', { tele: 1.25, rec: 1.8, w: 3 }), A('double', 'QUÉT ĐÔI!', 'sweepLow', { tele: 1.2, w: 1, rage: 1, double: true }),
      A('hip', 'QUÉT HÔNG!', 'charge', { tele: 1.15, w: 2 }), A('dig', 'CÀO ĐẤT!', 'throw', { proj: 'debris', n: 3, w: 1 })] },
  carno: { name: 'Carnotaurus', note: 'Da vảy, không lông [BC]. Đùi đuôi khổng lồ → chạy nhanh nhưng quay đầu kém [GT, Persons & Currie 2011].',
    box: { h: 0.76, ar: 0.85 }, hp: 11, rest: [1.7, 2.4], punish: [0, 0.7],
    weak: [[0, 0.84], [-0.13, 0.92], [0.13, 0.92], [0, 0.55], [0, 0.42]],
    attacks: [A('bull', 'LAO NHƯ BÒ TÓT!', 'charge', { tele: 1.15, rec: 2.3, w: 3, feint: true }), A('butt', 'HÚC SỪNG!', 'butt', { tele: 1.05, w: 2 }),
      A('snaps', 'ĐỚP LIÊN HOÀN!', 'bite', { tele: 0.85, w: 1, triple: true })] },
  trex: { name: 'T-Rex', boss: true, note: 'Lực cắn 8.500–34.500 N, nghiền xương bằng nhiều nhát cắn [BC]. ~60% con trưởng thành có sẹo cắn trên mặt do đấu nhau [BC].',
    box: { h: 0.82, ar: 0.95 }, hp: 20, rest: [1.8, 2.6], punish: [0, 0.84],
    weak: [[0, 0.84], [-0.13, 0.9], [0.13, 0.9], [0, 0.55], [-0.15, 0.48], [0.15, 0.48]],
    attacks: [A('crush', 'CẮN NGHIỀN XƯƠNG!', 'bite', { tele: 1.15, rec: 1.4, w: 3, feint: true }), A('face', 'CẮN MẶT!', 'sweepHigh', { tele: 1.1, w: 2 }),
      A('stomp', 'GIẬM ĐẤT!', 'stomp', { tele: 1.2, w: 2, debris: 2 }), A('roar', 'GẦM!', 'roar', { tele: 1.3, w: 1 })] },
};
export const STAGES = [
  { name: 'Rừng Jura', env: 'forest', roster: ['compy', 'dilo', 'stego', 'allo'] },
  { name: 'Sông kỷ Phấn trắng', env: 'river', roster: ['parasaur', 'deino', 'pachy', 'spino'] },
  { name: 'Biển nội địa', env: 'sea', roster: ['ptero', 'quetzal', 'mosa'] },
  { name: 'Hell Creek', env: 'plains', roster: ['raptor', 'trike', 'ankylo', 'carno', 'trex'] },
];
export const DINO_ORDER = STAGES.flatMap(s => s.roster);

export const DINO_CFG = {
  lives: 5,
  enterSec: 2.2,
  forgiveSec: 0.45,        // phản ứng sớm hơn lúc chạm tối đa chừng này vẫn tính
  perfectSec: 0.32,        // chuyển sang đúng tư thế trong 0,32 s cuối = PERFECT
  lateSec: 0.12,           // muộn hơn lúc chạm (sau khi đã bù trễ màn hình)
  gapSec: 0.55,            // khoảng về tư thế trung tính giữa 2 nhát trong combo
  weakLife: 1.8, weakGap: 0.25, weakR: 0.075, counterR: 0.11,
  minSpeed: 0.8,
  projSec: 1.35, projR: 0.06, projHitZ: 0.75,
  addSec: 1.1,             // con bầy chạy tới mất 1,1 s
  invulnSec: 0.9, downSec: 1.8,
  restEvery: 26, restSec: 3.6,       // sau ~26 s căng thẳng: nghỉ 3,6 s (khủng long thị uy, điểm yếu tha hồ đánh)
  tiredSec: 3.0,
  targetSkill: 0.78,                 // nhắm ~78% phản ứng đúng
  levelHp: 0.35, levelSpeed: 0.9,
};

/** Khung hình khủng long trên màn hình theo độ xa z (1 = chân trời, 0 = sát mặt). Dùng chung cho logic & vẽ. */
export function dinoBox(W, H, key, z = 0, sway = 0) {
  const b = DINO_TYPES[key]?.box || { h: 0.8, ar: 0.9 };
  const s = 0.16 + 0.84 * ((1 - z) * (1 - z) * 0.35 + (1 - z) * 0.65);
  const h = H * b.h * s, w = h * b.ar;
  const horizon = H * 0.42, ground = H * 0.97;
  let yFeet = horizon + (ground - horizon) * Math.min(1, s * 1.05);
  if (b.fly) yFeet = horizon + (ground - horizon) * 0.75 * Math.min(1, s * 1.05) - H * 0.05 * (1 - z);
  if (b.water) yFeet = horizon + (ground - horizon) * Math.min(1, s * 1.05) + h * 0.22; // phần dưới chìm dưới mặt nước
  return { x: W / 2 + sway * W * 0.06 * s, y: yFeet, w, h, s };
}

export class DinoGame {
  constructor({ W, H, seed = Date.now(), lagMs = 0, cfg = {}, stage = 0 }) {
    this.cfg = { ...DINO_CFG, ...cfg };
    Object.assign(this, { W, H, lagMs });
    this.rand = rng(seed);
    this.clock = 0; this.events = []; this.over = false;
    this.lives = this.cfg.lives; this.score = 0; this.combo = 0; this.bestCombo = 0; this.kills = 0;
    this.hits = 0; this.blocks = 0; this.hurt = 0; this.perfects = 0; this.breaks = 0;
    this.level = 1; this.invulnUntil = -1; this.skill = 0.75; this.pressure = 0;
    this.stage = Math.max(0, Math.min(STAGES.length - 1, stage)); this.inStage = 0; this.wave = 0;
    this.hist = []; this.rocks = []; this.adds = []; this.recentNeeds = []; this.seenOnce = new Set();
    this._nextDino();
  }
  drain() { const e = this.events; this.events = []; return e; }
  get mult() { return 1 + Math.min(3, Math.floor(this.combo / 5)); }
  get stageInfo() { return STAGES[this.stage]; }
  get env() { return DINO_TYPES[this.dino.key].env || this.stageInfo.env; }

  _nextDino() {
    const S = STAGES[this.stage];
    if (this.inStage >= S.roster.length) { // qua màn → màn sau (hết 4 màn thì vòng mới mạnh hơn), +1 mạng
      this.inStage = 0; this.stage++;
      if (this.stage >= STAGES.length) { this.stage = 0; this.level++; }
      this.lives = Math.min(this.cfg.lives, this.lives + 1);
      this.events.push({ kind: 'stage', stage: this.stage, name: STAGES[this.stage].name, level: this.level, cleared: true });
    } else if (this.wave === 0) this.events.push({ kind: 'stage', stage: this.stage, name: S.name, level: this.level });
    const key = STAGES[this.stage].roster[this.inStage++];
    this.wave++;
    const T = DINO_TYPES[key], c = this.cfg, lv = this.level - 1;
    this.dino = {
      key, name: T.name, boss: !!T.boss, maxHp: Math.round(T.hp * (1 + c.levelHp * lv)), tempo: Math.max(0.65, Math.pow(c.levelSpeed, lv)),
      phase: 'enter', t: 0, z: 1, sway: 0, flash: 0, recoil: 0, rage: 0, atk: null, cur: null, curTo: 0, weak: null, weakT: 0, lastWeak: -1, lastAtk: null, atkCount: 0,
      parts: Object.fromEntries(Object.entries(T.parts || {}).map(([k, p]) => [k, { ...p, left: p.hp, broken: false }])),
    };
    this.dino.hp = this.dino.maxHp;
    this.rocks = []; this.adds = [];
    this.events.push({ kind: 'enter', key, name: T.name, wave: this.wave, level: this.level, boss: !!T.boss, note: T.note });
  }

  // ---------- điểm yếu ----------
  _pos(u, v) { const d = this.dino, B = dinoBox(this.W, this.H, d.key, d.z, d.sway); return { x: B.x + u * B.w, y: B.y - v * B.h }; }
  weakNow() {
    const w = this.dino.weak;
    if (!w) return null;
    return { ...this._pos(w.u, w.v), r: (w.gold ? this.cfg.counterR : this.cfg.weakR) * this.H * (w.big ? 1.25 : 1), gold: w.gold || w.big, life: w.life, age: w.age, part: w.part };
  }
  _spawnWeak(gold = false, life) {
    const d = this.dino, T = DINO_TYPES[d.key], list = T.weak;
    let i = Math.floor(this.rand() * list.length);
    if (i === d.lastWeak) i = (i + 1) % list.length;
    if (d.rage >= 1 && list.length > 2 && i === 0) i = 1 + Math.floor(this.rand() * (list.length - 1)); // giận: điểm yếu dời chỗ
    d.lastWeak = i;
    const part = !gold ? Object.entries(d.parts).find(([, p]) => !p.broken && p.weak.includes(i))?.[0] || null : null;
    const [u, v] = gold ? T.punish : list[i];
    d.weak = { u, v, gold, part, big: d.phase === 'tired', age: 0, life: life ?? (gold ? 1.3 : this.cfg.weakLife) };
  }
  _weakUpdate(dt, hands) {
    const d = this.dino, c = this.cfg;
    if (!d.weak) { d.weakT -= dt; if (d.weakT <= 0 && ['idle', 'rest', 'tired'].includes(d.phase)) this._spawnWeak(false, d.phase === 'tired' ? 1.2 : undefined); return; }
    const w = d.weak; w.age += dt;
    const P = this._pos(w.u, w.v), r = (w.gold ? c.counterR : c.weakR) * this.H * (w.big ? 1.25 : 1);
    for (const h of hands) {
      if (segDist(h.px, h.py, h.x, h.y, P.x, P.y) > r) continue;
      const dmg = w.gold || w.big ? 2 : 1;
      d.hp = Math.max(0, d.hp - dmg); d.flash = 1; d.recoil = 1;
      this.hits++; this._comboUp();
      this.score += 10 * dmg * this.mult;
      this.events.push({ kind: 'hit', x: P.x, y: P.y, dmg, gold: w.gold || w.big, angle: Math.atan2(h.y - h.py, h.x - h.px) });
      if (w.part) this._partHit(w.part, 1, P);
      d.weak = null; d.weakT = c.weakGap;
      if (w.gold && d.phase === 'counter') { d.phase = 'idle'; d.t = 0; d.restFor = 0.8; }
      this._rageCheck();
      return;
    }
    if (w.age >= w.life) { d.weak = null; d.weakT = c.weakGap; if (w.gold && d.phase === 'counter') this._toIdle(); }
  }
  _partHit(id, n, P) {
    const p = this.dino.parts[id];
    if (!p || p.broken) return;
    p.left -= n;
    if (p.left <= 0) {
      p.broken = true; this.breaks++; this.score += 40 * this.mult;
      this.events.push({ kind: 'break', part: id, name: p.name, x: P?.x ?? this.W / 2, y: P?.y ?? this.H * 0.4 });
    }
  }
  _rageCheck() {
    const d = this.dino, f = d.hp / d.maxHp;
    const r = f <= 0.25 ? 2 : f <= 0.5 ? 1 : 0;
    if (r > d.rage && d.hp > 0) { d.rage = r; this.events.push({ kind: 'rage', level: r }); }
  }
  _comboUp() { this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo); }

  // ---------- chọn đòn: trọng số + cấm lặp theo phản ứng ----------
  _needOf(a) { return a.tmpl === 'mob' ? (a.adds.kind === 'compy' ? 'jump' : 'dodge') : TMPL_NEED[a.tmpl]; }
  _pickAttack(exclude = new Set()) {
    const d = this.dino, T = DINO_TYPES[d.key], R = this.recentNeeds;
    const allowed = a => !(a.part && d.parts[a.part]?.broken) && (a.rage || 0) <= d.rage && !(a.once && this.seenOnce.has(d.key + a.id));
    const ok = T.attacks.filter(a => {
      if (!allowed(a) || exclude.has(a.id)) return false;
      const need = this._needOf(a);
      if (a.id === d.lastAtk && d.lastAtk2 === a.id) return false;                       // 1 đòn ≤ 2 lần liên tiếp
      if (R.length >= 2 && R[R.length - 1] === need && R[R.length - 2] === need && need !== 'smash') return false; // 1 phản ứng ≤ 2 lần liền
      if ((need === 'jump' || need === 'duck') && R.slice(-6).filter(n => n === 'jump' || n === 'duck').length >= 3) return false; // đỡ mỏi chân
      return true;
    });
    const pool = ok.length ? ok : T.attacks.filter(a => allowed(a) && !exclude.has(a.id));
    if (!pool.length) return null;
    const wt = a => a.w * (a.rage ? 1.4 : 1);
    let r = this.rand() * pool.reduce((s, a) => s + wt(a), 0);
    for (const a of pool) { r -= wt(a); if (r <= 0) return a; }
    return pool[pool.length - 1];
  }
  /** Các nhát của 1 đòn; t0 = mốc (theo đồng hồ đòn) để bắt đầu gồng nhát đầu. */
  _hitsFor(a, t0, teleMul) {
    const need = TMPL_NEED[a.tmpl], tele = a.tele * teleMul, hits = [];
    const dirR = () => (this.rand() < 0.5 ? -1 : 1);
    if (a.tmpl === 'mob') { // bầy: ≤3 con, 3 làn, lệch nhịp 0,5 s. Compy cắn chân → NHẢY; con lớn từ trái/phải → NÉ sang bên kia; từ giữa → NGỒI (raptor vồ) / NÉ
      const lanes = [-1, 0, 1].sort(() => this.rand() - 0.5).slice(0, a.adds.n);
      lanes.forEach((lane, i) => {
        const k = a.adds.kind;
        const hn = k === 'compy' ? 'jump' : lane === 0 ? (k === 'parasaur' ? 'dodge' : 'duck') : 'dodge';
        hits.push({ need: hn, dir: hn === 'dodge' ? (lane === 0 ? dirR() : -lane) : 0, tmpl: 'mob', lane, add: k, at: t0 + tele + i * 0.55, tele: i ? 0.55 : tele });
      });
      return hits;
    }
    if (a.tmpl === 'throw') { // vật bay tới: mỗi vật một nhát ĐẬP, cách nhau 0,45 s
      const xs = [0.25, 0.5, 0.75].sort(() => this.rand() - 0.5);
      for (let i = 0; i < a.n; i++) hits.push({ need: 'smash', tmpl: 'throw', proj: a.proj, lane: xs[i % 3], at: t0 + tele + i * 0.45, tele: i ? 0.45 : tele });
      return hits;
    }
    const base = { need, dir: need === 'dodge' ? dirR() : 0, tmpl: a.tmpl, at: t0 + tele, tele, hold: a.hold || 0, flank: !!a.flank };
    hits.push(base);
    const reps = a.triple ? 3 : a.double ? 2 : 1;
    for (let i = 1; i < reps; i++) { // đòn kép / liên hoàn: cùng phản ứng, đổi hướng, báo trước ngắn hơn
      const prev = hits[hits.length - 1];
      hits.push({ ...base, dir: need === 'dodge' ? -prev.dir : 0, at: prev.at + this.cfg.gapSec + 0.35 * teleMul, tele: 0.35 * teleMul + this.cfg.gapSec });
    }
    if (a.follow) { // vd. Stegosaurus xoay quất đuôi rồi đâm gai
      const prev = hits[hits.length - 1], fn = TMPL_NEED[a.follow];
      hits.push({ need: fn, dir: fn === 'dodge' ? dirR() : 0, tmpl: a.follow, at: prev.at + this.cfg.gapSec + 0.5 * teleMul, tele: 0.5 * teleMul + this.cfg.gapSec });
    }
    if (a.debris) { const prev = hits[hits.length - 1]; for (let i = 0; i < a.debris; i++) hits.push({ need: 'smash', tmpl: 'throw', proj: 'debris', lane: [0.3, 0.7][i % 2], at: prev.at + 0.75 + i * 0.45, tele: 0.75 }); }
    return hits;
  }
  _teleMul() {
    const d = this.dino, c = this.cfg;
    const adapt = Math.max(0.82, Math.min(1.3, 1 + (c.targetSkill - this.skill) * 1.1)); // chơi kém → báo trước dài hơn
    return adapt * d.tempo * (d.rage === 2 ? 0.85 : d.rage === 1 ? 0.93 : 1);
  }
  _windup() {
    const d = this.dino, c = this.cfg, tm = this._teleMul();
    const a = this._pickAttack();
    if (!a) { this._toIdle(); return; }
    const hits = [];
    let label = a.label, feint = false;
    // giả đòn: chỉ cho NÉ / ĐỠ (không giả NHẢY/NGỒI); khi giận + chơi tốt, hoặc loài "doạ giả"; ≤ 1 lần / 4 đòn
    const canFeint = a.forceFeint || (a.feint && d.rage >= 1 && this.skill > 0.6 && this.rand() < 0.3 && d.atkCount - (d.lastFeint ?? -9) >= 4);
    if (canFeint && ['dodge', 'guard'].includes(TMPL_NEED[a.tmpl])) {
      feint = true; d.lastFeint = d.atkCount;
      const ft = a.tele * tm * 0.8;
      hits.push({ need: 'none', fake: true, tmpl: a.tmpl, dir: this.rand() < 0.5 ? -1 : 1, at: ft, tele: ft });
      hits.push(...this._hitsFor(a, ft + 0.15, tm * 0.65)); // tín hiệu "nhả đòn" → đòn thật tới ngay sau
    } else hits.push(...this._hitsFor(a, 0, tm));
    // combo khi giận: ghép thêm 1 (giận) – 2 (điên) đòn đơn, có khoảng trung tính + luật chuyển tiếp thoải mái
    const solo = ['mob', 'throw', 'lock', 'myth', 'display'];
    const extra = solo.includes(a.tmpl) ? 0 : d.rage >= 2 ? 2 : d.rage >= 1 && this.skill > 0.55 ? 1 : 0;
    const used = new Set([a.id]);
    for (let i = 0; i < extra; i++) {
      const prev = hits[hits.length - 1];
      const b = this._pickAttack(used);
      if (!b || solo.includes(b.tmpl)) break;
      const bn = TMPL_NEED[b.tmpl], seq = hits.filter(h => !h.fake).map(h => h.need);
      if (seq.length >= 2 && seq[seq.length - 2] === 'jump' && seq[seq.length - 1] === 'duck' && bn === 'jump') break; // cấm NHẢY → NGỒI → NHẢY
      const gap = c.gapSec + (prev.need === 'duck' && bn === 'jump' ? 0.5 : 0);             // sau NGỒI phải có thời gian đứng dậy
      hits.push(...this._hitsFor(b, prev.at + gap, tm * 0.7)); used.add(b.id); label += ' → ' + b.label;
    }
    hits.forEach((h, i) => { h.i = i; h.done = false; });
    d.atk = { id: a.id, label, tmpl: a.tmpl, hits, rec: a.rec, combo: hits.filter(h => !h.fake).length, feint, ok: 0, fail: 0, t0clock: this.clock };
    if (a.once) this.seenOnce.add(d.key + a.id);
    d.lastAtk2 = d.lastAtk; d.lastAtk = a.id; d.atkCount++;
    d.phase = 'attack'; d.t = 0; d.weak = null; d.cur = hits[0]; d.curTo = hits[0].at;
    for (const h of hits) if (!h.fake && h.need !== 'none') this.recentNeeds.push(h.need);
    this.recentNeeds = this.recentNeeds.slice(-8);
    this.events.push({ kind: 'windup', attack: { label, need: hits[0].need, dir: hits[0].dir, tmpl: a.tmpl, id: a.id }, hits: hits.length });
    if (TMPL_NEED[a.tmpl] === 'none' && !hits.some(h => !h.fake && h.need !== 'none')) for (const h of hits) h.need = 'none';
  }

  _toIdle() {
    const d = this.dino, R = DINO_TYPES[d.key].rest;
    d.phase = 'idle'; d.t = 0; d.weak = null; d.weakT = 0.2; d.atk = null; d.cur = null;
    d.restFor = (R[0] + (R[1] - R[0]) * this.rand()) * (d.rage === 2 ? 0.75 : d.rage ? 0.88 : 1);
  }

  /** Phản ứng đúng? → null (sai) | 'perfect' | 'good'. Khoá sừng: giữ 2 tay ≥ 60% thời gian giằng co. */
  _judge(h, contact) {
    const c = this.cfg, lag = this.lagMs / 1000;
    const test = s => (h.need === 'dodge' ? s.dodge === h.dir : h.need === 'duck' ? s.duck : h.need === 'jump' ? s.jump : h.need === 'guard' || h.need === 'hold' ? s.guard : true);
    if (h.need === 'hold') {
      const win = this.hist.filter(s => s.t >= contact && s.t <= contact + h.hold + lag);
      const f = win.length ? win.filter(test).length / win.length : 0;
      return f >= 0.6 ? (f >= 0.85 ? 'perfect' : 'good') : null;
    }
    const t0 = contact - c.forgiveSec, t1 = contact + lag + c.lateSec;
    const firstOk = this.hist.find(s => s.t >= t0 && s.t <= t1 && test(s));
    if (!firstOk) return null;
    // PERFECT: chuyển sang đúng tư thế ngay trước lúc chạm; đã đứng sẵn từ sớm = TỐT
    const prev = [...this.hist].reverse().find(s => s.t < firstOk.t);
    if (prev && test(prev)) return 'good';
    return firstOk.t >= contact - c.perfectSec ? 'perfect' : 'good';
  }

  /** @param input { hands, dodge: −1|0|1, duck, jump, guard, present } */
  update(dt, input = {}) {
    if (this.over) return;
    dt = Math.min(dt, 0.1);
    const c = this.cfg, d = this.dino;
    this.clock += dt; d.t += dt;
    this.hist.push({ t: this.clock, dodge: input.dodge || 0, duck: !!input.duck, jump: !!input.jump, guard: !!input.guard });
    while (this.hist.length && this.clock - this.hist[0].t > 4) this.hist.shift();
    d.flash = Math.max(0, d.flash - dt * 4); d.recoil = Math.max(0, d.recoil - dt * 3);
    d.sway = Math.sin(this.clock * 0.9) * (d.phase === 'attack' ? 0.2 : 1);
    const hands = (input.hands || []).filter(h => h.speed >= c.minSpeed && h.px != null);
    if (!['enter', 'down', 'rest', 'tired'].includes(d.phase)) this.pressure += dt;

    if (d.phase === 'enter') {
      d.z = Math.max(0, 1 - d.t / c.enterSec);
      if (d.t >= c.enterSec) this._toIdle();
    } else if (['idle', 'counter', 'rest', 'tired'].includes(d.phase)) {
      this._weakUpdate(dt, hands);
      if (d.hp <= 0) return this._down();
      if (d.phase === 'counter' && d.t >= d.counterFor) this._toIdle();
      else if ((d.phase === 'rest' && d.t >= c.restSec) || (d.phase === 'tired' && d.t >= c.tiredSec)) { this.pressure = 0; this._toIdle(); }
      else if (d.phase === 'idle' && d.t >= d.restFor) {
        if (this.pressure > c.restEvery) { d.phase = 'rest'; d.t = 0; this.events.push({ kind: 'rest' }); } // nhịp nghỉ: thị uy
        else this._windup();
      }
    } else if (d.phase === 'attack') {
      this._attackUpdate(hands);
    } else if (d.phase === 'recover') {
      if (d.t >= 0.7) this._toIdle();
    } else if (d.phase === 'down') {
      if (d.t >= c.downSec) this._nextDino();
    }
  }

  _attackUpdate(hands) {
    const d = this.dino, c = this.cfg, A = d.atk, lag = this.lagMs / 1000, t = d.t;
    const cur = A.hits.find(h => !h.struck) || A.hits[A.hits.length - 1];
    d.cur = cur; d.curTo = cur.at - t; d.prevHit = A.hits.filter(h => h.struck).pop() || null;
    // vật bay & con bầy: sinh ra để tới đúng lúc chạm
    for (const h of A.hits) {
      if (h.need === 'smash' && !h.spawned && t >= h.at - c.projSec) {
        h.spawned = true; d.lastStrike = { hit: h, at: this.clock + 0.22 };
        const from = this._pos(0, 0.78);
        this.rocks.push({ id: h.i, hit: h, kind: h.proj || 'rock', fx: from.x, fy: from.y, tx: this.W * h.lane, ty: this.H * (0.32 + 0.28 * this.rand()), z: 1, x: from.x, y: from.y, r: 0, smashed: false });
      }
      if (h.add && !h.spawned && t >= h.at - c.addSec) { h.spawned = true; this.adds.push({ hit: h, kind: h.add, lane: h.lane, z: 1 }); }
    }
    for (const k of this.rocks) {
      if (k.smashed || k.z <= 0) continue;
      k.z = Math.max(0, (k.hit.at - t) / c.projSec);
      const f = 1 - Math.min(1, k.z) ** 2;
      k.x = k.fx + (k.tx - k.fx) * f; k.y = k.fy + (k.ty - k.fy) * f; k.r = c.projR * this.H * (0.45 + 1.1 * (1 - Math.min(1, k.z)));
      if (k.z < c.projHitZ) for (const h of hands) if (segDist(h.px, h.py, h.x, h.y, k.x, k.y) <= k.r * 1.15) {
        k.smashed = true; k.hit.done = k.hit.struck = true; A.ok++; this._good(k.hit, k.z < 0.3 ? 'perfect' : 'good'); this.events.push({ kind: 'smash', x: k.x, y: k.y, proj: k.kind }); break;
      }
      if (!k.smashed && k.z <= 0 && !k.hit.done) { k.hit.done = k.hit.struck = true; A.fail++; this._bad(k.hit); }
    }
    for (const a of this.adds) a.z = Math.max(0, (a.hit.at - t) / c.addSec);
    this.adds = this.adds.filter(a => a.hit.at - t > -0.6);
    // chốt từng nhát khi đã qua lúc chạm + trễ màn hình + lateSec (khoá sừng: + thời gian giằng co)
    for (const h of A.hits) {
      if (h.done || h.need === 'smash') continue;
      if (!h.struck && t >= h.at) { h.struck = true; d.lastStrike = { hit: h, at: this.clock }; this.events.push({ kind: h.fake ? 'feint' : 'strike', hit: h }); }
      if (h.fake || h.need === 'none') { if (t >= h.at) h.done = true; continue; }
      if (t < h.at + lag + c.lateSec + (h.hold || 0)) continue;
      h.done = true;
      const g = this._judge(h, A.t0clock + h.at);
      if (g) { A.ok++; this._good(h, g); if (h.need === 'hold') this._partHit('horn', 2); }
      else { A.fail++; this._bad(h); }
    }
    if (A.hits.every(h => h.done) && t >= A.hits[A.hits.length - 1].at + 0.25) {
      this.rocks = [];
      const real = A.hits.filter(h => !h.fake && h.need !== 'none').length;
      if (!A.fail && real) {
        this.events.push({ kind: 'dodged', attack: A });
        // hở sườn đúng chỗ của loài; combo ≥ 3 nhát (hoặc đang điên cuồng) → thở dốc
        if (A.combo >= 3 || (d.rage === 2 && this.rand() < 0.4)) { d.phase = 'tired'; d.t = 0; d.weak = null; d.weakT = 0.1; this.events.push({ kind: 'tired' }); }
        else { d.phase = 'counter'; d.t = 0; d.counterFor = Math.max(1.0, A.rec); this._spawnWeak(true, d.counterFor); }
      } else if (!real) this._toIdle();
      else { d.phase = 'recover'; d.t = 0; }
    }
  }
  _good(h, grade) {
    this.blocks++; this._comboUp();
    if (grade === 'perfect') this.perfects++;
    this.score += (grade === 'perfect' ? 8 : 5) * this.mult;
    this.skill += (1 - this.skill) * 0.12;
    this.events.push({ kind: 'react', hit: h, grade });
  }
  _bad(h) {
    this.skill += (0 - this.skill) * 0.12;
    this.events.push({ kind: 'miss', hit: h });
    this._hurt(h);
  }
  _hurt(h) {
    if (this.clock < this.invulnUntil) return;
    this.lives--; this.hurt++; this.combo = 0; this.invulnUntil = this.clock + this.cfg.invulnSec;
    this.events.push({ kind: 'hurt', hit: h, lives: this.lives });
    if (this.lives <= 0) { this.over = true; this.events.push({ kind: 'over' }); }
  }
  _down() {
    const d = this.dino;
    d.phase = 'down'; d.t = 0; d.weak = null; d.atk = null; d.cur = null; this.kills++; this.rocks = []; this.adds = [];
    const bonus = 50 * this.level * (d.boss ? 2 : 1);
    this.score += bonus;
    this.events.push({ kind: 'down', key: d.key, name: d.name, bonus, boss: d.boss });
  }
}
