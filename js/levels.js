// BẢN ĐỒ CHƯỚNG NGẠI VẬT
// Mỗi chunk là một "câu" ngắn. t = giây tính từ đầu chunk (đổi ra mét theo tốc độ lúc spawn,
// nên thời gian phản xạ giữ nguyên dù tốc độ tăng). Khoảng cách tối thiểu giữa 2 động tác bắt buộc = 1.2s
// vì người thật cần thời gian tiếp đất / đứng dậy (khác game chạm ngón tay).
//
// lane: 0 trái · 1 giữa · 2 phải · 'P' làn người chơi đang đứng lúc spawn
//       'X','Y' hai làn còn lại (mỗi chunk bốc ngẫu nhiên 1 lần) · 'A' cả 3 làn

export const T = { FIRE: 'fire', HURDLE: 'hurdle', BAR: 'bar', WALL: 'wall', COIN: 'coin', STAR: 'star' };
export const HAZARDS = new Set([T.FIRE, T.HURDLE, T.BAR, T.WALL]);

const coins = (lane, t0, n, step = 0.22) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * step, type: T.COIN, lane }));

// Tier 0 — hướng dẫn: mỗi động tác xuất hiện một mình, có chữ nhắc, thành công đầu tiên gần như chắc chắn
export const TUTORIAL = [
  { id: 'tut-coins', events: [...coins('P', 0, 5)] },
  { id: 'tut-move', events: [...coins('X', 0, 4), { t: 1.0, type: T.WALL, lane: 'P', hint: '← BƯỚC SANG LÀN KHÁC →' }] },
  { id: 'tut-jump', events: [{ t: 0, type: T.HURDLE, lane: 'A', hint: '⬆ NHẢY LÊN!' }] },
  { id: 'tut-duck', events: [{ t: 0, type: T.BAR, lane: 'A', hint: '⬇ NGỒI XUỐNG!' }] },
  { id: 'tut-fire', events: [{ t: 0, type: T.FIRE, lane: 'P', hint: '🔥 HỐ LỬA! Nhảy qua hoặc né làn' }, ...coins('X', -0.2, 3)] },
  { id: 'tut-star', events: [{ t: 0, type: T.STAR, lane: 'P', hint: '🙌 GIƠ 2 TAY lấy ngôi sao!' }] },
];

export const CHUNKS = {
  1: [
    { id: 'coin-line', events: coins('P', 0, 6) },
    { id: 'wall-single', events: [{ t: 0.6, type: T.WALL, lane: 'P' }, ...coins('X', 0, 4)] },
    { id: 'hurdle', events: [{ t: 0, type: T.HURDLE, lane: 'A' }] },
    { id: 'bar', events: [{ t: 0, type: T.BAR, lane: 'A' }] },
    { id: 'fire-single', events: [{ t: 0, type: T.FIRE, lane: 'P' }, ...coins('X', 0, 3)] },
    { id: 'star-single', events: [{ t: 0, type: T.STAR, lane: 'X' }] },
  ],
  2: [
    { id: 'fire-two', events: [{ t: 0, type: T.FIRE, lane: 'P' }, { t: 0, type: T.FIRE, lane: 'Y' }, ...coins('X', -0.3, 4)] },
    { id: 'wall-hurdle', events: [{ t: 0, type: T.WALL, lane: 'P' }, { t: 1.3, type: T.HURDLE, lane: 'A' }] },
    { id: 'hurdle-bar', events: [{ t: 0, type: T.HURDLE, lane: 'A' }, { t: 1.4, type: T.BAR, lane: 'A' }] },
    { id: 'zigzag', events: [
      { t: 0, type: T.WALL, lane: 'P' }, { t: 0, type: T.WALL, lane: 'Y' },
      { t: 1.6, type: T.WALL, lane: 'X' }, { t: 1.6, type: T.WALL, lane: 'P' }, ...coins('Y', 1.2, 3)] },
    { id: 'fire-all', events: [{ t: 0, type: T.FIRE, lane: 'A' }] },
    { id: 'bar-star', events: [{ t: 0, type: T.BAR, lane: 'A' }, { t: 1.5, type: T.STAR, lane: 'P' }] },
  ],
  3: [
    { id: 'gauntlet', events: [{ t: 0, type: T.HURDLE, lane: 'A' }, { t: 1.25, type: T.BAR, lane: 'A' }, { t: 2.5, type: T.FIRE, lane: 'A' }] },
    { id: 'fire-walls', events: [
      { t: 0, type: T.WALL, lane: 'P' }, { t: 0, type: T.FIRE, lane: 'X' },
      { t: 1.5, type: T.FIRE, lane: 'Y' }, { t: 1.5, type: T.WALL, lane: 'X' }] },
    { id: 'duck-jump-duck', events: [{ t: 0, type: T.BAR, lane: 'A' }, { t: 1.25, type: T.HURDLE, lane: 'A' }, { t: 2.5, type: T.BAR, lane: 'A' }] },
    { id: 'star-rush', events: [{ t: 0, type: T.STAR, lane: 'P' }, { t: 1.2, type: T.STAR, lane: 'X' }, { t: 2.4, type: T.STAR, lane: 'Y' }] },
    { id: 'lava-run', events: [{ t: 0, type: T.FIRE, lane: 'P' }, { t: 0, type: T.FIRE, lane: 'X' }, { t: 1.3, type: T.FIRE, lane: 'A' }, ...coins('Y', -0.2, 3)] },
  ],
};

export const chunkDuration = ch => Math.max(0, ...ch.events.map(e => e.t));
