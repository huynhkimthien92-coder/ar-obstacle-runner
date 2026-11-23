import { CONFIG } from './config.js';
import { cameraSupport, explainCameraError, startCamera, stopCamera } from './camera.js';
import { PoseEngine, makeMapper, fitFor } from './pose.js';
import { PoseSmoother } from './filters.js';
import { MotionTracker } from './motion.js';
import { Game } from './game.js';
import { T, TUTORIAL } from './levels.js';
import { Renderer } from './render.js';
import { sfx, unlockAudio, setMuted, buzz, audioStreamTrack, audioToLocal } from './audio.js';
import { Bench } from './bench.js';
import { Link } from './link.js';
import { PlayerTracker } from './players.js';
import { TileGame, TileGeom } from './tiles.js';
import { Cutouts } from './cutout.js';
import { FruitGame } from './fruits.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('aor:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('aor:' + k, JSON.stringify(v)); } catch { /* chế độ riêng tư / sandbox */ } },
};

const DEFAULTS = { model: 'lite', facing: 'user', skeleton: true, sound: true, debug: false, sens: 1.0, tutorial: true, output: 'phone', bodyMode: 'auto', cueSound: true, game: 'runner', look: 'game', playerScale: 0.42, bgDim: 0.45 };
const saved = store.get('settings', {});
const settings = Object.assign({}, DEFAULTS, saved);
settings.lag = Object.assign({ phone: CONFIG.LAG.phone, tv: CONFIG.LAG.tv, wifi: CONFIG.LAG.wifi }, saved.lag || {});
settings.lagMeasured = Object.assign({}, saved.lagMeasured || {});
const params = new URLSearchParams(location.search);
if (params.has('debug')) settings.debug = true;

const video = $('cam');
const renderer = new Renderer($('stage'));
const bench = new Bench();
const smoother = new PoseSmoother();
const baseMotionCfg = { ...CONFIG.MOTION };
const motion = new MotionTracker({ ...baseMotionCfg });
const link = new Link();

const app = {
  mode: 'menu', input: 'camera', pose: null, cam: null, mapper: null, pts: null, raw: null, game: null,
  manual: { lane: 1, airborne: false, ducking: false, handsUp: false, oneHandUp: false, present: true },
  manualTimers: {}, lastT: 0, countEnd: 0, lastCount: 0, handsSince: 0, lostFor: 0, wasLost: false,
  poseSkip: false, poseTick: 0, wakeLock: null, lowFpsFor: 0, rated: false, tutorialMarked: false,
  presentSince: 0, vdim: '', lag: null, lastCueId: 0, prevPresent: false, lostEvents: [],
  tracker: new PlayerTracker(4), tg: null, geom: null, vgeom: null, tickSec: -1, resultShown: false,
  cutouts: new Cutouts(), mainIdx: 0, ps: null, baseFoot: null,
  fg: null, hands: {}, fps: null, arm: {}, ptr: null,
};
// Nội dung chữ vẽ lên canvas cho TV (HUD, gợi ý, đếm ngược, bảng thông báo)
const ui = { hud: null, hint: '', big: null, panel: null, corner: '', cornerColor: null, cue: null, tiles: null };
const isTiles = () => settings.game === 'tiles';
const isFruit = () => settings.game === 'fruit';

const tvOut = () => settings.output !== 'phone';
const lagMs = () => settings.lag[settings.output] ?? 0;
// Khung người: TV → toàn thân (đứng xa); màn hình điện thoại → nửa người (đứng gần để còn nhìn thấy màn hình)
const bodyMode = () => (settings.bodyMode === 'auto' ? (tvOut() ? 'full' : 'near') : settings.bodyMode);

// ---------------- UI helpers ----------------
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
/**
 * Kiểu hiển thị theo từng màn: chỉnh góc / hiệu chỉnh / đo trễ luôn thấy PHÒNG THẬT (để còn chỉnh máy);
 * lúc chơi dùng lựa chọn của người chơi: "Khung cảnh game" (người cắt nền, thu nhỏ) hoặc "Thấy phòng thật" (làm tối nền).
 */
function applyLook(m = app.mode) {
  const real = m === 'setup' || m === 'calib' || m === 'lagtest' || m === 'menu';
  const game = settings.look === 'game' && !real;
  const was = renderer.look;
  renderer.look = isFruit() && !real ? 'fruit' : game ? 'game' : 'ar'; // Chém trái cây luôn dùng nền trời cao + người thu nhỏ
  renderer.bgDim = m === 'setup' ? 0 : real ? 0.15 : settings.bgDim;
  if (renderer.look === 'game') renderer.setWorld(renderer.H * 0.9, renderer.H * settings.playerScale / 1.7); // thế giới cố định, người thu nhỏ theo "Cỡ người"
  else if (was === 'game') renderer.setWorld(null, null);
}
function setMode(m) { app.mode = m; applyLook(m); ui.cue = null; if (m !== 'setup') ui.level = null; if (m !== 'calib' && m !== 'lagtest' && m !== 'over' && m !== 'setup') ui.panel = null; }
let hintText = '';
function setHint(text) {
  ui.hint = text || '';
  if (text === hintText) return;
  hintText = text || '';
  const el = $('hint'); el.textContent = hintText; el.classList.toggle('show', !!hintText);
}
function big(text) {
  ui.big = text ? { text, at: performance.now() } : null;
  const el = $('big'); el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; if (text) el.classList.add('pop');
}
function saveSettings() { store.set('settings', settings); }
function applySettings() {
  setMuted(!settings.sound);
  motion.mode = bodyMode();
  $('debug').hidden = !settings.debug;
  const k = settings.sens;
  Object.assign(motion.cfg, {
    jumpEnter: baseMotionCfg.jumpEnter * k, jumpExit: baseMotionCfg.jumpExit * k,
    duckEnter: baseMotionCfg.duckEnter * k, duckExit: baseMotionCfg.duckExit * k,
  });
  saveSettings();
}
$('best').textContent = store.get('best', 0);

/** Áp cách xuất hình: phone (màn hình điện thoại) · tv (HDMI / phản chiếu) · wifi (stream sang display.html) */
function applyOutput() {
  const out = settings.output;
  document.body.classList.toggle('tvmode', out !== 'phone');
  document.body.classList.toggle('wifimode', out === 'wifi');
  renderer.tvHud = true; // HUD/gợi ý luôn vẽ trên canvas, chữ to (cả TV lẫn điện thoại)
  // TV: luôn khung 16:9 cố định (khớp TV, camera 16:9 không bị cắt chân trên điện thoại 20:9)
  renderer.setFixed(out === 'phone' ? 0 : CONFIG.TV.width, CONFIG.TV.height);
  renderer.opaque = true;                                          // canvas luôn tự vẽ nền: hình camera, hoặc nền tối khi chơi bằng phím
  renderer.video = app.input === 'camera' ? video : null;
  renderer.mirror = settings.facing === 'user';
  updateMapper();
}

async function fullscreenLandscape() {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* iOS không có */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* chỉ Android khi đang fullscreen */ }
}

// ---------------- Camera flow ----------------
async function startCameraFlow() {
  unlockAudio();
  const sup = cameraSupport();
  if (!sup.ok) return fail(sup.reason);
  show('scr-loading');
  ui.panel = { title: 'Đang khởi động camera…', lines: ['Lần đầu tải bộ nhận diện ~20 MB'] };
  try {
    $('loading-text').textContent = 'Đang xin quyền camera…';
    app.cam = await startCamera(video, settings.facing, tvOut());
    app.input = 'camera';
    video.classList.remove('on'); // hình camera được vẽ vào canvas (thẻ video chỉ để giải mã, ẩn đi)
    video.classList.toggle('mirror', settings.facing === 'user');
    applyOutput();
    bench.watchVideo(video);
    if (!app.pose || app.pose.model !== settings.model) {
      app.pose?.close();
      app.pose = await new PoseEngine().init(settings.model, t => { $('loading-text').textContent = t; ui.panel = { title: t, lines: [] }; });
    }
    await app.pose.setNumPoses(isTiles() ? 4 : 1);
    await app.pose.setSegmentation(settings.look === 'game' || isFruit());
    bench.info = { delegate: app.pose.delegate, model: app.pose.model, video: `${video.videoWidth}x${video.videoHeight}`, facing: settings.facing, output: settings.output };
    if (app.afterCamera === 'setup') { app.afterCamera = null; enterSetup(); } else enterCalibration();
  } catch (e) {
    console.error(e);
    const camErr = e?.name && /NotAllowed|NotFound|NotReadable|Overconstrained|Security|Abort/.test(e.name);
    fail(camErr ? explainCameraError(e) : 'Không tải được bộ nhận diện (cần mạng lần đầu). Chi tiết: ' + (e?.message || e));
  }
}

function fail(msg) {
  stopCamera(); video.classList.remove('on');
  show('scr-menu'); ui.panel = { title: '⚠ Có lỗi', lines: ['Xem trên điện thoại'] };
  alertBox(msg + '\n\nBạn vẫn có thể "Thử bằng vuốt / phím".');
}
function alertBox(msg) { // không dùng alert() để không chặn vòng lặp
  let d = $('dlg-alert');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'dlg-alert';
    d.innerHTML = '<p id="alert-msg" style="white-space:pre-line;line-height:1.45"></p><form method="dialog"><button class="btn primary">OK</button></form>';
    document.body.appendChild(d);
  }
  $('alert-msg').textContent = msg; if (!d.open) d.showModal?.();
}

function updateMapper() {
  if (!video.videoWidth) return;
  app.vdim = `${video.videoWidth}x${video.videoHeight}`;
  const fit = fitFor(video.videoWidth, video.videoHeight, renderer.W, renderer.H);
  renderer.fit = fit; video.classList.toggle('contain', fit === 'contain');
  app.mapper = makeMapper(video.videoWidth, video.videoHeight, renderer.W, renderer.H, settings.facing === 'user', fit);
  motion.videoPortrait = video.videoHeight > video.videoWidth;
}

function enterCalibration() {
  motion.reset(); smoother.reset(); applySettings(); renderer.setWorld(null, null); ui.tiles = null; app.tg = null; app.ps = null; app.baseFoot = null;
  ui.fruit = null; app.fg = null;
  motion.beginCalibration();
  app.presentSince = 0; app.handsSince = 0;
  $('hud').hidden = true; setHint(''); ui.hud = null;
  show('scr-calib'); setMode('calib');
}

function processPose(now) {
  if (!app.pose || !video.videoWidth) return;
  if (`${video.videoWidth}x${video.videoHeight}` !== app.vdim) updateMapper(); // xoay máy → khung camera đổi chiều
  if (!app.mapper) return;
  if (app.poseSkip && (app.poseTick++ % 2)) return; // máy yếu: suy luận cách 1 frame camera
  const r = app.pose.detect(video);
  if (!r) return;
  bench.onPose(r.ms, !!r.landmarks);
  // Người "chính" (hiệu chỉnh, giơ tay bắt đầu, chơi Vượt chướng ngại): bám theo người chính của frame trước,
  // không đổi qua lại khi có nhiều người trong khung.
  let main = r.landmarks;
  if (r.all.length > 1 && app.primaryC && now - app.primaryAt < 1500) {
    let best = Infinity;
    for (const lm of r.all) { const d = Math.hypot((lm[11].x + lm[12].x) / 2 - app.primaryC.x, (lm[11].y + lm[12].y) / 2 - app.primaryC.y); if (d < best) { best = d; main = lm; } }
  }
  if (main) { app.primaryC = { x: (main[11].x + main[12].x) / 2, y: (main[11].y + main[12].y) / 2 }; app.primaryAt = now; }
  app.mainIdx = Math.max(0, r.all.indexOf(main));
  if (r.masks && (renderer.look === 'game' || renderer.look === 'fruit')) app.cutouts.update(r.frame, r.masks, r.all);
  const sm = smoother.apply(main, now);
  app.raw = sm;
  app.pts = sm ? sm.map(app.mapper) : null;
  motion.update(app.pts, app.raw, renderer.W, renderer.H, now);
  if (isTiles()) app.tracker.update(r.all, app.mapper, renderer.W, renderer.H, now);
  updateWorld();
  const pr = motion.state.present;
  if (app.prevPresent && !pr) app.lostEvents.push(now);
  app.prevPresent = pr;
  app.lostEvents = app.lostEvents.filter(t => now - t < 10000);
}

/**
 * Đo tỉ lệ người chơi trên màn hình → mặt đất (y chân) + px/mét. Ưu tiên chiều cao mũi→mắt cá (~1,45 m ở người 1,65 m);
 * không thấy chân thì dùng vai→hông (~0,5 m); chỉ thấy vai thì dùng bề rộng vai (~0,36 m).
 * Chỉ cập nhật khi đứng bình thường (không nhảy/ngồi) và làm mượt để đường đua không rung.
 */
function updateWorld() {
  if (renderer.look !== 'ar') return; // khung cảnh game / trái cây: tỉ lệ cố định theo "Cỡ người"
  const st = motion.state, p = app.pts;
  if (!p || !st.present || st.coasting || st.airborne || st.ducking || st.rebasing) return;
  const ok = (q, m = 0.5) => q && q.v >= m;
  const H = renderer.H;
  const la = p[27], ra = p[28], n = p[0], ls = p[11], rs = p[12], lh = p[23], rh = p[24];
  let g, ppm;
  if (st.fullBody && ok(la) && ok(ra) && ok(n, 0.4)) {
    const fy = Math.max(la.y, ra.y); ppm = (fy - n.y) / 1.45; g = fy + 0.06 * ppm;
  } else if (ok(lh) && ok(rh)) {
    const sy = (ls.y + rs.y) / 2, hy = (lh.y + rh.y) / 2; ppm = (hy - sy) / 0.5; g = hy + 0.95 * ppm;
  } else {
    ppm = Math.hypot(ls.x - rs.x, ls.y - rs.y) / 0.36; g = (ls.y + rs.y) / 2 + 1.42 * ppm;
  }
  if (!(ppm > 0)) return;
  ppm = Math.min(H * 0.9, Math.max(H * 0.1, ppm)); g = Math.min(H * 1.15, Math.max(H * 0.5, g)); // mặt đường không chìm quá sâu dưới mép màn hình
  const a = renderer.ppm0 ? 0.05 : 1;
  renderer.setWorld((renderer.groundY ?? g) + (g - (renderer.groundY ?? g)) * a, (renderer.ppm0 ?? ppm) + (ppm - (renderer.ppm0 ?? ppm)) * a);
}

const DIST_TEXT = {
  full: {
    none: ['Đứng vào giữa khung hình', 'Cách điện thoại ~2,5 m, thấy cả bàn chân'],
    farther: ['Lùi ra xa hơn', 'Cần thấy cả bàn chân của bạn'],
    closer: ['Tiến lại gần một chút', 'Bạn đang hơi xa camera'],
    ok: ['Đứng yên…', 'Đang hiệu chỉnh tư thế đứng'],
  },
  near: {
    none: ['Đứng trước camera', 'Cách ~1–1,5 m, thấy từ đầu tới hông'],
    farther: ['Lùi ra một chút', 'Cần thấy cả đầu và hai vai'],
    closer: ['Tiến lại gần hơn', 'Đứng cách điện thoại ~1–1,5 m'],
    ok: ['Đứng yên…', 'Đang hiệu chỉnh tư thế đứng'],
  },
};

function calibFrame(now) {
  const s = motion.state;
  if (s.present && !app.presentSince) app.presentSince = now;
  if (!s.present) app.presentSince = 0;
  motion.calibGate = s.distance.hint === 'ok' || (app.presentSince && now - app.presentSince > 8000);
  const DT = DIST_TEXT[motion.mode];
  let [title, sub] = DT[s.present ? s.distance.hint : 'none'];
  let color = null;
  // Ô an toàn không cần đo nhảy/ngồi → chỉ cần thấy ít nhất 1 người là bắt đầu được (ai giơ 2 tay cũng được)
  const tilesReady = (isTiles() && app.tracker.list.some(p => p.present)) || (isFruit() && s.present);
  const anyHands = s.handsUp || (isTiles() && app.tracker.list.some(p => p.present && p.handsUp));
  if (s.calibrated || tilesReady) {
    title = '🙌 Giơ 2 tay lên để bắt đầu'; color = '#7dffb0';
    sub = s.distance.hint === 'ok' ? (tvOut() ? 'Nhìn lên màn hình lớn và chơi' : 'Hoặc bấm "Bắt đầu"') : DT[s.distance.hint]?.[0] || '';
    if (anyHands) { app.handsSince ||= now; if (now - app.handsSince > 700) return beginPlay(); }
    else app.handsSince = 0;
  } else if (s.present && s.distance.hint !== 'ok' && motion.calibGate) title = 'Đứng yên…';
  const lines = [sub];
  if (s.distance.meters) lines.push(`Khoảng cách ước lượng: ~${s.distance.meters.toFixed(1)} m`);
  if (tvOut() && motion.videoPortrait) lines.push('📱↔ Xoay NGANG điện thoại để camera nhìn rộng hơn');
  if (app.lostEvents.length >= 3) lines.push('Hay mất dấu: bật thêm đèn, tránh đứng ngược sáng, mặc áo khác màu tường');
  if (isTiles()) lines.push(`Mọi người cùng đứng vào khung trước khi bắt đầu — đang thấy ${app.tracker.list.filter(p => p.present).length}/4 người`);
  $('calib-title').textContent = title; $('calib-sub').textContent = sub;
  $('calib-dist').textContent = lines.slice(1).join(' · ');
  $('btn-calib-start').disabled = !(s.calibrated || tilesReady);
  ui.panel = { title, lines, color, top: true, progress: s.calibrated || tilesReady ? null : s.calibProgress || null };
  renderer.calibration(app.pts, s, now / 1000);
}

// ---------------- Chỉnh góc camera ----------------
// Màn riêng để dựng máy cho chuẩn TRƯỚC khi chơi: không tự vào game, kiểm tra liên tục và chỉ cách sửa.
function askMotionPermission() { // iOS cần xin quyền cảm biến nghiêng trong lúc bấm nút
  try { window.DeviceMotionEvent?.requestPermission?.().catch(() => {}); } catch { /* */ }
}
window.addEventListener('devicemotion', e => {
  const g = e.accelerationIncludingGravity;
  if (g && g.x != null) app.grav = { x: g.x, y: g.y, z: g.z, at: performance.now() };
});
function levelInfo() {
  const g = app.grav;
  if (!g || performance.now() - g.at > 2000) return null;
  if (Math.abs(g.z) > 8) return { flat: true };
  const a = Math.atan2(g.x, g.y) * 180 / Math.PI; // nghiêng trong mặt phẳng màn hình
  return { flat: false, dev: a - 90 * Math.round(a / 90) };
}
const lightCv = document.createElement('canvas'); lightCv.width = 64; lightCv.height = 36;
const lightCtx = lightCv.getContext('2d', { willReadFrequently: true });
function measureLight(now) {
  if (now - (app.lightAt || 0) < 500 || !video.videoWidth) return;
  app.lightAt = now;
  lightCtx.drawImage(video, 0, 0, 64, 36);
  const d = lightCtx.getImageData(0, 0, 64, 36).data;
  let box = null;
  if (app.raw && motion.state.present) {
    const vis = app.raw.filter(p => p.v > 0.5);
    if (vis.length > 4) box = { x0: Math.min(...vis.map(p => p.x)), x1: Math.max(...vis.map(p => p.x)), y0: Math.min(...vis.map(p => p.y)), y1: Math.max(...vis.map(p => p.y)) };
  }
  let sum = 0, pin = 0, pn = 0;
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4, l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    sum += l;
    if (box && x / 64 >= box.x0 && x / 64 <= box.x1 && y / 36 >= box.y0 && y / 36 <= box.y1) { pin += l; pn++; }
  }
  const n = 64 * 36, mean = sum / n, inside = pn ? pin / pn : mean, outside = n - pn ? (sum - pin) / (n - pn) : mean;
  app.light = { mean, backlit: pn > 30 && outside - inside > 55 };
}
function setupChecks() {
  const s = motion.state, raw = app.raw, full = motion.mode === 'full', L = [];
  const add = (ok, good, bad) => L.push({ ok, text: ok ? '✓ ' + good : '✗ ' + bad, color: ok ? '#7dffb0' : '#ffcc66' });
  const info = { headCut: false, feetCut: false, groundY: renderer.groundY, level: null, tileRows: full && s.fullBody ? 3 : 1 };
  if (!s.present || !raw) add(false, '', 'Chưa thấy người — đứng vào trước camera');
  else {
    const v = (i, m = 0.5) => raw[i] && raw[i].v >= m;
    const headOk = v(0, 0.4) && raw[0].y > 0.04;
    info.headCut = !headOk;
    add(headOk, 'Thấy đầu', 'Đầu bị cắt — lùi ra xa, hoặc ngả camera lên');
    if (full) { info.feetCut = !s.fullBody; add(s.fullBody, 'Thấy cả bàn chân', 'Chân bị cắt — lùi ra xa, đặt máy thấp hơn, hoặc chúi camera xuống'); }
    else add(s.hipsSeen, 'Thấy tới hông', 'Chưa thấy hông — lùi ra một chút');
    const d = s.distance;
    add(d.hint === 'ok', `Khoảng cách tốt${d.meters ? ` (~${d.meters.toFixed(1)} m)` : ''}`, d.hint === 'closer' ? 'Hơi xa — tiến lại gần' : 'Hơi gần — lùi ra xa');
    const cx = s.laneX;
    add(cx > 0.36 && cx < 0.64, 'Đứng giữa khung', cx <= 0.36 ? 'Lệch về bên trái màn hình — bước sang phải' : 'Lệch về bên phải màn hình — bước sang trái');
    if (full && s.fullBody) add(Math.max(raw[27].y, raw[28].y) < 0.9, 'Còn chỗ sàn trước chân (cho Ô an toàn)', 'Chân sát mép dưới — lùi lại, hoặc chúi camera xuống một chút');
  }
  const lt = app.light;
  if (lt) {
    if (lt.mean < 55) add(false, '', 'Phòng tối — bật thêm đèn');
    else if (lt.backlit) add(false, '', 'Ngược sáng — đừng đứng quay lưng ra cửa sổ / đèn');
    else add(true, 'Ánh sáng ổn', '');
  }
  const lv = levelInfo();
  if (lv?.flat) add(false, '', 'Điện thoại đang nằm — dựng đứng lên');
  else if (lv) { info.level = lv.dev; add(Math.abs(lv.dev) < 4, `Máy đứng thẳng (${Math.abs(lv.dev).toFixed(0)}°)`, `Máy nghiêng ${Math.abs(lv.dev).toFixed(0)}° — chỉnh cho thẳng`); }
  const pf = bench.live().poseFps;
  add(pf >= 12, `Nhận diện ${pf.toFixed(0)} lần/giây`, `Nhận diện chỉ ${pf.toFixed(0)} lần/giây — máy đang chậm, đóng bớt ứng dụng`);
  return { L, info };
}
function enterSetup() {
  motion.reset(); smoother.reset(); applySettings(); renderer.setWorld(null, null);
  $('hud').hidden = true; setHint(''); ui.hud = null; ui.tiles = null;
  app.handsSince = 0;
  show('scr-setup'); setMode('setup');
}
function setupFrame(now) {
  measureLight(now);
  const { L, info } = setupChecks();
  const allOk = L.length > 2 && L.every(x => x.ok);
  const handsLine = motion.state.handsUp ? `🙌 Giữ 2 tay thêm ${Math.max(0, 1.5 - (now - (app.handsSince || now)) / 1000).toFixed(1)} s để vào chơi` : '🙌 Giơ 2 tay 1,5 s (hoặc bấm "Xong") để vào chơi';
  ui.level = info.level;
  ui.panel = { side: true, title: allOk ? '🎥 Góc camera đã ổn!' : '🎥 Chỉnh góc camera', color: allOk ? '#7dffb0' : '#fff', lines: [...L, { text: handsLine, color: '#d6e4ff' }] };
  renderer.setupView(app.pts, info, now / 1000);
  if (motion.state.handsUp) { app.handsSince ||= now; if (now - app.handsSince > 1500) { sfx.ok(); enterCalibration(); } }
  else app.handsSince = 0;
}

// ---------------- Đo độ trễ màn hình ----------------
const LAGCFG = { beats: 6, period: 1600, fall: 1000, lead: 1800 };
function needLagTest() { return tvOut() && !settings.lagMeasured[settings.output]; }
function beginPlay() { if (needLagTest() && !isTiles() && !isFruit()) startLagTest(startCountdown); else startCountdown(); }

function startLagTest(next) {
  show(null); $('hud').hidden = true; setHint(''); ui.hud = null;
  app.lag = { start: performance.now() + LAGCFG.lead, hits: [], offsets: [], lastAir: false, lastTick: -1, next, doneAt: 0 };
  setMode('lagtest');
}

function lagFrame(now) {
  const L = app.lag, p = player();
  const air = !!p.airborne;
  if (air && !L.lastAir && !L.doneAt) { // mép lên của "đang nhảy"
    const k = Math.floor((now - L.start + 400) / LAGCFG.period);
    const off = now - (L.start + k * LAGCFG.period);
    if (k >= 0 && k < LAGCFG.beats && !L.hits[k] && off > -400 && off < 1100) { L.hits[k] = true; L.offsets.push(off); }
  }
  L.lastAir = air;
  const idx = Math.floor((now - L.start) / LAGCFG.period);
  if (idx >= 0 && idx < LAGCFG.beats && idx !== L.lastTick) { L.lastTick = idx; sfx.tick(); }
  if (!L.doneAt && now > L.start + LAGCFG.beats * LAGCFG.period + 900) finishLagTest(now);
  if (L.doneAt && now - L.doneAt > 2600) { const next = L.next; app.lag = null; next(); return; }
  if (!L.doneAt) ui.panel = {
    title: '⏱ Đo độ trễ màn hình', top: true,
    lines: ['NHẢY đúng lúc quả bóng chạm vạch trắng', `Đã nhận ${L.offsets.length}/${LAGCFG.beats} lần`],
  };
  renderer.lagTest(now, L, LAGCFG, app.input === 'camera' ? app.pts : null, p, null);
  renderer.effects(1 / 60);
}

function finishLagTest(now) {
  const L = app.lag; L.doneAt = now;
  const o = [...L.offsets].sort((a, b) => a - b);
  if (o.length >= 3) {
    const med = o[Math.floor(o.length / 2)];
    const lag = Math.round(Math.min(CONFIG.LAG.max, Math.max(0, med)));
    settings.lag[settings.output] = lag; settings.lagMeasured[settings.output] = true; saveSettings();
    ui.panel = { title: `✓ Độ trễ: ${lag} ms`, color: '#7dffb0', lines: ['Game sẽ tự bù độ trễ này khi xét va chạm'] };
    sfx.ok();
  } else {
    ui.panel = { title: 'Chưa đo được', color: '#ffcc00', lines: [`Dùng mức mặc định ${lagMs()} ms — đo lại trong Cài đặt`] };
  }
}

// ---------------- Game flow ----------------
function newGame() {
  const tutorial = settings.tutorial || !store.get('tutDone', false);
  app.game = new Game({ seed: (Math.random() * 2 ** 31) | 0, tutorial, cfg: { displayLagMs: lagMs() } });
  app.tutorialMarked = !tutorial; app.rated = false; app.lostSince = 0; app.wasLost = false;
  document.querySelectorAll('.fb').forEach(b => { b.disabled = false; });
}

function startCountdown() {
  if (isFruit()) { if (!app.fg || app.fg.over || ['calib', 'lagtest', 'menu', 'setup'].includes(app.mode)) newFruit(); }
  else if (isTiles()) { if (!app.tg || app.tg.over || app.mode === 'calib' || app.mode === 'lagtest' || app.mode === 'menu') newTiles(); }
  else if (!app.game || app.game.over || app.mode === 'calib' || app.mode === 'lagtest') newGame();
  if (app.input === 'camera') motion.beginCalibration(true); // hiệu chỉnh lại nhanh trong lúc đứng chờ
  motion.calibGate = true;
  show(null); $('hud').hidden = tvOut(); updateHUD(true);
  app.countEnd = performance.now() + 3000; app.lastCount = 0;
  setMode('countdown');
  requestWakeLock();
}

function countdownFrame(now, dt) {
  if (isTiles()) return tilesCountdownFrame(now, dt);
  if (isFruit()) return fruitCountdownFrame(now, dt);
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount) { app.lastCount = left; if (left > 0) { big(String(left)); sfx.tick(); } }
  if (now >= app.countEnd) { big('GO!'); sfx.go(); setMode('play'); }
  renderer.frame(dt, now / 1000, app.game, player(), viewOpts());
}

function player() { return app.input === 'camera' ? motion.state : app.manual; }
function viewOpts() {
  const cam = app.input === 'camera';
  const person = personView();
  const game = renderer.look === 'game';
  return { pts: app.pts, person, skeleton: cam && settings.skeleton && !person, avatar: !cam || (!settings.skeleton && !person), dim: game ? 0.85 : cam ? 0.4 : 0.75 };
}
/** Khung cảnh game: người cắt nền được thu nhỏ để cao đúng "Cỡ người" × chiều cao màn hình, chân đặt trên làn đang đứng. */
function personView() {
  if (renderer.look !== 'game' || app.input !== 'camera') return null;
  const it = app.cutouts.items[app.mainIdx];
  if (!it) return null;
  const H = renderer.H, W = renderer.W, targetH = H * settings.playerScale, st = motion.state;
  const body = it.footPx ? it.footPx.y - it.headPx : null;
  const sNew = body > 20 ? targetH / body : it.shoulderPx ? (targetH * 0.23) / it.shoulderPx : null;
  if (!sNew) return null;
  const steady = !st.airborne && !st.ducking;
  // làm mượt theo THỜI GIAN (~0.4s), không theo số khung hình → máy chậm vẫn về đúng cỡ nhanh
  const now = performance.now(), k = 1 - Math.exp(-(now - (app.psT || now)) / 400); app.psT = now;
  app.ps = app.ps == null ? sNew : steady ? app.ps + (sNew - app.ps) * k : app.ps; // giữ tỉ lệ khi đang nhảy/ngồi
  let y = H;
  if (it.footPx) { // nhảy thì chân rời mặt đường đúng theo độ cao nhảy thật (đã thu nhỏ)
    if (steady) app.baseFoot = app.baseFoot == null ? it.footPx.y : app.baseFoot + (it.footPx.y - app.baseFoot) * k;
    y = renderer.groundY + (it.footPx.y - app.baseFoot) * app.ps;
  }
  return { it, x: W * st.laneX, y, s: app.ps };
}

function playFrame(now, dt) {
  const g = app.game, p = player();
  if (app.input === 'camera') {
    // đo bằng đồng hồ thật (không cộng dt bị giới hạn) để máy chậm vẫn tạm dừng đúng 2s
    if (p.present) app.lostSince = 0; else app.lostSince ||= now;
    if (app.lostSince && now - app.lostSince > CONFIG.LOST_PAUSE_SEC * 1000) {
      ui.cue = null;
      app.wasLost = true; setHint('');
      ui.panel = { title: '👀 Không thấy bạn', lines: ['Quay lại khung hình để chơi tiếp'] };
      $('hint').textContent = '👀 Không thấy bạn — quay lại khung hình'; $('hint').classList.add('show');
      renderer.frame(0, now / 1000, g, p, viewOpts());
      return;
    }
    if (app.wasLost) { // quay lại → đếm ngược 3s và hiệu chỉnh lại nhanh theo chỗ đứng mới
      app.wasLost = false; ui.panel = null; app.countEnd = now + 3000; app.lastCount = 0;
      motion.beginCalibration(true); motion.calibGate = true; setMode('countdown'); return;
    }
  }
  g.update(dt, now, p);
  for (const ev of g.drain()) onGameEvent(ev);
  ui.cue = g.nextCue(p.lane);
  if (ui.cue && ui.cue.ob.id !== app.lastCueId) { app.lastCueId = ui.cue.ob.id; if (settings.cueSound) sfx['cue_' + ui.cue.action]?.(); }
  setHint(g.hint || '');
  renderer.frame(dt, now / 1000, g, p, viewOpts());
  updateHUD();
  if (!app.tutorialMarked && !g.inTutorial) { app.tutorialMarked = true; store.set('tutDone', true); }
  if (g.over) gameOver();

  const live = bench.live();
  app.lowFpsFor = live.fps && live.fps < 24 ? app.lowFpsFor + dt : 0;
  if (app.lowFpsFor > 3 && !renderer.lowQuality) { renderer.lowQuality = true; renderer.resize(); updateMapper(); }
  app.poseSkip = live.inferMs > 45;
}

function onGameEvent(ev) {
  switch (ev.kind) {
    case 'coin': sfx.coin(); renderer.fx('coin', ev.ob); break;
    case 'star': sfx.star(); renderer.fx('star', ev.ob); buzz(30); break;
    case 'miss-star': renderer.popup(renderer.W / 2, renderer.H * 0.3, 'Giơ tay cao hơn!', '#fff27a'); break;
    case 'dodge': sfx.dodge(); renderer.fx('dodge', ev.ob); break;
    case 'hit': (ev.ob.type === T.FIRE ? sfx.fire : sfx.hit)(); renderer.fx('hit', ev.ob); buzz(ev.ob.type === T.FIRE ? [80, 40, 160] : 180); break;
    case 'over': sfx.over(); break;
  }
}

let hudCache = '';
function updateHUD(force) {
  const g = app.game; if (!g) return;
  ui.hud = { score: g.score, lives: g.lives, maxLives: CONFIG.GAME.lives, combo: g.combo, dist: Math.floor(g.traveled), speed: (g.speed * 3.6).toFixed(0) };
  const key = `${g.score}|${g.lives}|${g.combo}|${Math.floor(g.traveled)}`;
  if (key === hudCache && !force) return;
  hudCache = key;
  $('hud-score').textContent = g.score;
  $('hud-dist').textContent = `${Math.floor(g.traveled)} m · ${ui.hud.speed} km/h`;
  $('hud-lives').textContent = '♥'.repeat(Math.max(0, g.lives)) + '♡'.repeat(Math.max(0, CONFIG.GAME.lives - g.lives));
  $('hud-combo').textContent = g.combo > 1 ? `x${g.combo}` : '';
}

function gameOver() {
  const g = app.game;
  setMode('over'); setHint(''); releaseWakeLock();
  const best = Math.max(store.get('best', 0), g.score);
  const isRecord = g.score >= best && g.score > 0;
  store.set('best', best); $('best').textContent = best;
  const detail = `${Math.floor(g.traveled)} m · ${g.coins} xu · ${g.stars} sao · né ${g.dodged} chướng ngại`;
  $('over-score').textContent = g.score;
  $('over-detail').textContent = detail;
  $('over-best').textContent = isRecord ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`;
  $('over-hands').textContent = app.input === 'camera' ? 'hoặc giơ 2 tay 1.5 giây để chơi lại' : '';
  ui.panel = {
    title: `Hết lượt! ${g.score} điểm`, color: '#00e5ff',
    lines: [detail, isRecord ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`, app.input === 'camera' ? '🙌 Giơ 2 tay 1.5 giây để chơi lại' : 'Enter / bấm Chơi lại'],
  };
  const runs = store.get('runs', []);
  runs.push({ at: Date.now(), score: g.score, dist: Math.floor(g.traveled), hits: g.hits, dodged: g.dodged, input: app.input, output: settings.output, lagMs: lagMs(), model: app.pose?.model, delegate: app.pose?.delegate });
  store.set('runs', runs.slice(-30));
  setTimeout(() => { if (app.mode === 'over') show('scr-over'); }, 700);
  app.handsSince = 0;
}

function overFrame(now, dt) {
  if (isFruit()) renderer.fruitScene(dt, now / 1000, app.fg, fruitView(now, false));
  else if (isTiles()) renderer.tilesScene(dt, now / 1000, app.tg, drawGeom(), app.input === 'camera' ? app.tracker.list : [], app.tg.roster, null, tilesPeople());
  else renderer.frame(dt, now / 1000, app.game, player(), viewOpts());
  const anyHands = motion.state.handsUp || (isTiles() && app.tracker.list.some(p => p.present && p.handsUp));
  if (app.input === 'camera' && anyHands) {
    app.handsSince ||= now;
    if (ui.panel) ui.panel.progress = Math.min(1, (now - app.handsSince) / 1500);
    if (now - app.handsSince > 1500) { app.game = null; app.tg = null; app.fg = null; startCountdown(); }
  } else { app.handsSince = 0; if (ui.panel) ui.panel.progress = null; }
}

function pause(title = 'Tạm dừng') {
  if (app.mode !== 'play' && app.mode !== 'countdown' && app.mode !== 'tiles' && app.mode !== 'fruit') return;
  app.pausedFrom = app.mode;
  setMode('paused'); $('pause-title').textContent = title; show('scr-pause'); releaseWakeLock();
  ui.panel = { title: '⏸ ' + title, lines: ['Bấm "Tiếp tục" trên điện thoại'] };
}
async function resume() {
  if (!(await ensureCamera())) return;
  show(null); ui.panel = null;
  if (app.pausedFrom === 'tiles') { app.tilesLastT = 0; setMode('tiles'); requestWakeLock(); return; }
  if (app.pausedFrom === 'fruit') { setMode('fruit'); requestWakeLock(); return; } // Ô an toàn: chơi tiếp ngay (đồng hồ vòng đã dừng)
  app.countEnd = performance.now() + 3000; app.lastCount = 0; setMode('countdown'); requestWakeLock();
}
function toMenu() {
  setMode('menu'); setHint(''); big(''); $('hud').hidden = true; releaseWakeLock();
  stopCamera(); video.classList.remove('on'); app.pts = null; app.game = null; app.tg = null; app.fg = null; ui.hud = null; ui.tiles = null; ui.fruit = null;
  ui.panel = link.live ? { title: 'AR Obstacle Runner', lines: ['Chọn chế độ chơi trên điện thoại'] } : null;
  renderer.clear(); show('scr-menu');
}

// ---------------- Manual (không camera) input ----------------
function manualAction(kind) {
  const m = app.manual, tm = app.manualTimers;
  if (isFruit()) return; // Chém trái cây: kéo ngón tay / chuột trên màn hình để chém
  if (isTiles() && app.geom) { // Ô an toàn bằng phím: ←→ đổi cột, ↑↓ đổi hàng (↑ = xa camera)
    const g = app.geom;
    if (kind === 'left') m.col = Math.max(0, m.col - 1);
    else if (kind === 'right') m.col = Math.min(g.cols - 1, m.col + 1);
    else if (kind === 'jump') m.row = Math.max(0, m.row - 1);
    else if (kind === 'duck') m.row = Math.min(g.rows - 1, m.row + 1);
    return;
  }
  if (kind === 'left') m.lane = Math.max(0, m.lane - 1);
  else if (kind === 'right') m.lane = Math.min(2, m.lane + 1);
  else {
    const key = { jump: 'airborne', duck: 'ducking', hands: 'handsUp' }[kind];
    if (kind === 'jump' && m.ducking) return;
    m[key] = true; clearTimeout(tm[key]);
    tm[key] = setTimeout(() => { m[key] = false; }, kind === 'jump' ? 600 : kind === 'duck' ? 750 : 500);
  }
}
function startManual() {
  unlockAudio();
  if (settings.output === 'wifi' && !link.live) settings.output = 'phone';
  app.input = 'manual'; app.manual.lane = 1; app.game = null; renderer.setWorld(null, null);
  video.classList.remove('on');
  applySettings(); applyOutput();
  beginPlay();
}
window.addEventListener('keydown', e => {
  if (e.target?.tagName === 'INPUT') return;
  if (app.mode === 'over' && (e.key === 'Enter' || e.key === ' ')) { app.game = null; app.tg = null; app.fg = null; startCountdown(); return; }
  if (e.key === 'Escape' || e.key === 'p') { app.mode === 'paused' ? resume() : pause(); return; }
  if (app.input !== 'manual') return;
  const map = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'jump', w: 'jump', ' ': 'jump', ArrowDown: 'duck', s: 'duck', h: 'hands', e: 'hands' };
  if (map[e.key]) { e.preventDefault(); if (!e.repeat) manualAction(map[e.key]); }
});
let touch0 = null, lastTap = 0;
$('stage').addEventListener('pointerdown', e => { touch0 = { x: e.clientX, y: e.clientY }; });
$('stage').addEventListener('pointerup', e => {
  if (!touch0 || app.input !== 'manual') return;
  const dx = e.clientX - touch0.x, dy = e.clientY - touch0.y, min = 30;
  if (Math.abs(dx) < min && Math.abs(dy) < min) {
    const now = performance.now(); if (now - lastTap < 350) manualAction('hands'); lastTap = now;
  } else if (Math.abs(dx) > Math.abs(dy)) manualAction(dx < 0 ? 'left' : 'right');
  else manualAction(dy < 0 ? 'jump' : 'duck');
  touch0 = null;
});

// ---------------- Kết nối TV ----------------
function chooseOutput(out) { settings.output = out; saveSettings(); }

async function connectWifi() {
  const code = $('tv-code').value.replace(/\D/g, '');
  if (code.length !== 4) { $('tv-status').textContent = 'Nhập đủ 4 số đang hiện trên TV.'; return; }
  unlockAudio();
  chooseOutput('wifi');
  app.input = 'camera';
  applyOutput();
  $('btn-tv-connect').disabled = true;
  try {
    const stream = renderer.cv.captureStream(CONFIG.TV.streamFps);
    const at = audioStreamTrack(); if (at) stream.addTrack(at);
    ui.panel = { title: '📡 Đã nối với điện thoại', lines: ['Đang mở camera…'] };
    await link.connect(code, stream, t => { $('tv-status').textContent = t; });
    store.set('tvCode', code);
    $('dlg-tv').close();
    await startCameraFlow();
  } catch (e) {
    console.error(e); audioToLocal();
    chooseOutput('phone'); applyOutput();
    $('tv-status').textContent = '⚠ ' + (e?.message || e); $('tv-status').style.whiteSpace = 'pre-line';
  } finally { $('btn-tv-connect').disabled = false; }
}
link.onChange = st => {
  updateCorner();
  if ((st === 'lost' || st === 'closed') && settings.output === 'wifi') {
    pause('Mất kết nối TV');
    alertBox('Mất kết nối tới màn hình TV.\nKiểm tra TV còn mở trang display.html và cùng Wi-Fi, rồi vào Menu → Chơi trên TV để nối lại.');
  }
};
function updateCorner() {
  if (settings.output === 'wifi') {
    ui.corner = link.live ? `📡 TV${link.rtt ? ' · ' + Math.round(link.rtt) + ' ms' : ''}` : '⚠ Mất kết nối TV';
    ui.cornerColor = link.live ? '#9fffcf' : '#ffcc00';
  } else ui.corner = '';
}

// ---------------- Game "Ô an toàn" ----------------
function newTiles() {
  const W = renderer.W, H = renderer.H;
  const seen = app.tracker.list.filter(p => p.present && p.feetSeen);
  const feet = app.input === 'manual' || seen.length > 0 || motion.state.fullBody; // thấy chân → lưới 3 hàng; không → dải 1 hàng
  const rows = feet ? 3 : 1, cols = W > H ? 4 : 3;
  // mặt sàn: lấy trung vị vị trí chân của những người đang đứng trong khung
  const fy = seen.map(p => p.feet.y).sort((a, b) => a - b)[Math.floor(seen.length / 2)];
  const groundY = app.input === 'manual' ? H * 0.78 : Math.min(H * 0.9, fy ?? renderer.groundY ?? H * 0.85);
  app.geom = new TileGeom(W, H, rows, cols, groundY);  // lưới theo hình camera: dùng để XÉT chân đang ở ô nào
  app.vgeom = TileGeom.virtual(W, H, rows, cols);      // lưới ảo để VẼ ở kiểu "Khung cảnh game"
  app.tg = new TileGame({ rows, cols, seed: (Math.random() * 2 ** 31) | 0, lagMs: lagMs() });
  app.manual.row = Math.floor(rows / 2); app.manual.col = Math.floor(cols / 2);
  app.tickSec = -1; app.rated = false; app.resultShown = false;
  document.querySelectorAll('.fb').forEach(b => { b.disabled = false; });
  ui.tiles = tilesUi(); ui.hud = null;
}
const drawGeom = () => (renderer.look === 'game' && app.vgeom ? app.vgeom : app.geom);
/** Khung cảnh game: đặt từng người (đã cắt nền) lên lưới ảo đúng vị trí chân thật, xa nhỏ gần to. */
function tilesPeople() {
  if (renderer.look !== 'game' || app.input !== 'camera' || !app.geom || !app.vgeom) return null;
  const H = renderer.H, out = [];
  for (const p of app.tracker.list) {
    if (!p.present || !p.feet) continue;
    const it = app.cutouts.items[p.maskIdx];
    if (!it) continue;
    const ro = app.tg?.roster.find(r => r.id === p.id);
    const f = app.geom.locateF(p.feet.x, p.feet.y), pt = app.vgeom.pointAt(f.u, f.v);
    const body = it.footPx ? it.footPx.y - it.headPx : it.shoulderPx ? it.shoulderPx / 0.23 : null;
    if (!body) continue;
    const targetH = H * settings.playerScale * 0.9 * pt.persp;
    const now = performance.now(), k = 1 - Math.exp(-(now - (p.dsT || now)) / 300); p.dsT = now;
    p.ds = p.ds ? p.ds + (targetH / body - p.ds) * k : targetH / body;
    out.push({ it, x: pt.x, y: pt.y, s: p.ds, persp: pt.persp, alive: !ro || ro.alive,
      color: ro ? (ro.alive ? p.color : '#777') : 'rgba(255,255,255,0.6)', label: ro ? `P${ro.n}` : '', headY: pt.y - targetH,
      tile: app.geom.locate(p.feet.x, p.feet.y) });
  }
  return out;
}
const colorOf = id => (id === 'm' ? '#00e5ff' : app.tracker.list.find(p => p.id === id)?.color || '#888');
function tilesUi() {
  const tg = app.tg;
  return { phase: tg.phase, round: tg.round, timeLeft: tg.timeLeft, moveDur: tg.moveDur, solo: tg.solo, best: store.get('bestTiles', 0),
    players: tg.roster.map(r => ({ n: r.n, lives: r.lives, alive: r.alive, color: colorOf(r.id) })) };
}
function tilesPositions() {
  const pos = new Map();
  if (app.input === 'manual') pos.set('m', { r: app.manual.row, c: app.manual.col });
  else for (const p of app.tracker.list) if (p.present && p.feet) pos.set(p.id, app.geom.locate(p.feet.x, p.feet.y));
  return pos;
}
function tilesCountdownFrame(now, dt) {
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount && left > 0) { app.lastCount = left; big(String(left)); sfx.tick(); }
  renderer.tilesScene(dt, now / 1000, app.tg, drawGeom(), app.input === 'camera' ? app.tracker.list : [], [], app.input === 'manual' ? { r: app.manual.row, c: app.manual.col } : null, tilesPeople());
  if (now < app.countEnd) return;
  const ids = app.input === 'manual' ? ['m'] : app.tracker.list.filter(p => p.present).map(p => p.id).slice(0, 4);
  if (!ids.length) { ui.panel = { title: '👀 Chưa thấy ai', lines: ['Đứng vào khung hình để bắt đầu'] }; return; }
  ui.panel = null;
  app.tg.start(ids); app.tracker.setKeep(ids); app.tilesLastT = 0;
  big(ids.length > 1 ? `${ids.length} NGƯỜI!` : 'GO!'); sfx.go();
  setMode('tiles');
}
function tilesFrame(now, dt) {
  const tg = app.tg, pos = tilesPositions();
  const before = tg.phase;
  // đồng hồ vòng theo thời gian THẬT (không bị giới hạn 0.1s/khung như game chạy) → máy chậm vẫn đúng 5 giây
  const realDt = app.tilesLastT ? Math.min(1, (now - app.tilesLastT) / 1000) : dt;
  app.tilesLastT = now;
  tg.update(realDt, now, pos);
  for (const ev of tg.drain()) onTileEvent(ev);
  if (tg.phase === 'move') {
    const sec = Math.ceil(tg.timeLeft);
    if (sec !== app.tickSec && sec <= 3 && sec > 0) { app.tickSec = sec; sfx.tick(); }
  }
  if (before !== 'result' && tg.phase === 'result') ui.panel = tileResultPanel();
  if (tg.phase === 'reveal') ui.panel = null;
  ui.tiles = tilesUi();
  renderer.tilesScene(dt, now / 1000, tg, drawGeom(), app.input === 'camera' ? app.tracker.list : [], tg.roster, app.input === 'manual' ? pos.get('m') : null, tilesPeople());
  if (tg.over) tilesOver();
}
function onTileEvent(ev) {
  const g = drawGeom();
  switch (ev.kind) {
    case 'round': app.tickSec = -1; break;
    case 'go': sfx.go(); break;
    case 'reshuffle': sfx.cue_move(); big('ĐỔI Ô!'); break;
    case 'burn': {
      const c = ev.tile ? g.center(ev.tile.r, ev.tile.c) : { x: renderer.W / 2, y: renderer.H * 0.8 };
      renderer.burst(c.x, c.y, '#ff7b00', 34); renderer.flash = 1; renderer.flashColor = '255,110,0'; renderer.shake = 10;
      sfx.fire(); buzz([80, 40, 160]); break;
    }
    case 'safe': { const c = g.center(ev.tile.r, ev.tile.c); renderer.burst(c.x, c.y, '#7dffb0', 14); sfx.coin(); break; }
  }
}
function tileResultPanel() {
  const tg = app.tg;
  if (tg.solo) {
    const p = tg.roster[0];
    if (p.lastResult === 'safe') return { title: '✓ An toàn!', color: '#7dffb0', lines: [`Đã qua ${p.survived} vòng`] };
    return { title: p.lastResult === 'missing' ? '👀 Không thấy bạn lúc hết giờ' : '🔥 Rơi hố lửa!', color: '#ff7b00', lines: [p.lives > 0 ? `Còn ${p.lives} mạng` : 'Hết mạng'] };
  }
  return { title: `Kết quả vòng ${tg.round}`, lines: tg.roster.map(p => `P${p.n}: ${p.lastResult === 'safe' ? '✓ an toàn' : p.lastResult === undefined || p.lastResult === null ? (p.alive ? '' : '✖ đã bị loại') : (p.alive ? '🔥 mất 1 mạng' : '✖ BỊ LOẠI')}`) };
}
function tilesOver() {
  const tg = app.tg;
  setMode('over'); releaseWakeLock();
  let title, detail, best = store.get('bestTiles', 0), record = false;
  if (tg.solo) {
    const sc = tg.score; record = sc > best && sc > 0; best = Math.max(best, sc); store.set('bestTiles', best);
    title = `Qua ${sc} vòng`; detail = record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best} vòng`;
  } else {
    const w = tg.roster.find(p => p.id === tg.winner);
    title = w ? `🏆 P${w.n} thắng!` : 'Hoà — không ai trụ lại'; detail = `${tg.roster.length} người · ${tg.round} vòng`;
  }
  $('over-score').textContent = title; $('over-detail').textContent = detail; $('over-best').textContent = '';
  $('over-hands').textContent = app.input === 'camera' ? 'hoặc giơ 2 tay 1.5 giây để chơi lại' : '';
  ui.panel = { title, color: '#00e5ff', lines: [detail, app.input === 'camera' ? '🙌 Giơ 2 tay 1.5 giây để chơi lại' : 'Enter / bấm Chơi lại'] };
  const runs = store.get('runs', []);
  runs.push({ at: Date.now(), game: 'tiles', rounds: tg.round, players: tg.roster.length, score: tg.score, input: app.input, output: settings.output });
  store.set('runs', runs.slice(-30));
  setTimeout(() => { if (app.mode === 'over') show('scr-over'); }, 900);
  app.handsSince = 0;
}

// ---------------- Game "Chém trái cây" ----------------
const FRUIT_PERSON = 0.3; // người chỉ cao 30% màn hình, đứng ở đáy → bầu trời cao để chém
const HAND_COLORS = { L: '#00e5ff', R: '#ff9f1c', M: '#7dffb0' };
function newFruit() {
  app.fg = new FruitGame({ W: renderer.W, H: renderer.H, seed: (Math.random() * 2 ** 31) | 0 });
  app.hands = {}; app.fps = null; app.rated = false;
  document.querySelectorAll('.fb').forEach(b => { b.disabled = false; });
  ui.fruit = fruitUi(); ui.hud = null; ui.tiles = null;
}
function fruitUi() { const f = app.fg; return { score: f.score, time: f.time, duration: f.cfg.duration, lives: f.lives, maxLives: f.cfg.lives, best: store.get('bestFruit', 0) }; }

/** Vị trí + tỉ lệ người trên màn hình (nhỏ, đứng ở đáy), tính từ landmark ở toạ độ khung nhận diện. */
function fruitPlace(now) {
  const raw = app.raw, fr = app.pose?.frame;
  if (!raw || !fr || !motion.state.present) return null;
  const fw = fr.width, fh = fr.height, W = renderer.W, H = renderer.H;
  const P = i => ({ x: raw[i].x * fw, y: raw[i].y * fh, v: raw[i].v });
  const ls = P(11), rs = P(12), shW = Math.hypot(ls.x - rs.x, ls.y - rs.y), sh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  if (shW < 4) return null;
  const fi = [27, 28, 29, 30, 31, 32].filter(i => raw[i].v > 0.5);
  const feet = fi.length >= 2 ? { x: fi.reduce((a, i) => a + raw[i].x * fw, 0) / fi.length, y: Math.max(...fi.map(i => raw[i].y * fh)) } : null;
  const nose = P(0), headY = nose.v > 0.3 ? nose.y - shW * 0.75 : sh.y - shW * 1.2;
  const targetH = H * FRUIT_PERSON;
  const sNew = feet && feet.y - headY > 20 ? targetH / (feet.y - headY) : (targetH * 0.23) / shW;
  const k = 1 - Math.exp(-(now - (app.fpsT || now)) / 400); app.fpsT = now;
  app.fps = app.fps == null ? sNew : app.fps + (sNew - app.fps) * k;
  const s = app.fps, mirror = renderer.mirror;
  const anchorF = feet || sh;
  const anchorD = { x: W * Math.min(0.85, Math.max(0.15, motion.state.laneX)), y: feet ? H * 0.98 : H - targetH * 0.72 };
  const toD = (x, y) => ({ x: anchorD.x + (mirror ? -1 : 1) * (x - anchorF.x) * s, y: anchorD.y + (y - anchorF.y) * s });
  return { s, anchorF, anchorD, toD, P, shW, mirror, fw, fh };
}

/**
 * Lưỡi chém = VAI + hướng vươn tay × tầm màn hình. Tay vươn thẳng lên (dy≈-1) chạm đỉnh màn hình, dang ngang chạm mép;
 * nên chỉ cần đưa tay ngang đầu là chém tới trên cao → tay không phải ra khỏi khung camera (không mất dấu).
 * Cổ tay khuất / ra ngoài khung: đoán theo hướng cánh tay từ khuỷu.
 */
function cameraHands(pl, now) {
  const out = [], W = renderer.W, H = renderer.H, sgn = pl.mirror ? -1 : 1;
  for (const [id, [si, ei, wi]] of [['L', [11, 13, 15]], ['R', [12, 14, 16]]]) {
    const S = pl.P(si), E = pl.P(ei); let Wr = pl.P(wi);
    if (S.v < 0.4) continue;
    if (Wr.v < 0.35) { if (E.v < 0.5) continue; Wr = { x: E.x + (E.x - S.x) * 0.95, y: E.y + (E.y - S.y) * 0.95, v: 0.5 }; }
    const reach = E.v >= 0.4 ? Math.hypot(E.x - S.x, E.y - S.y) + Math.hypot(Wr.x - E.x, Wr.y - E.y) : Math.hypot(Wr.x - S.x, Wr.y - S.y);
    app.arm[id] = Math.max((app.arm[id] || pl.shW * 1.3) * 0.9995, reach, pl.shW * 1.2); // chiều dài tay (lấy lớn nhất đã thấy)
    const arm = app.arm[id];
    const dx = (Wr.x - S.x) / arm, dy = (Wr.y - S.y) / arm;
    const SD = pl.toD(S.x, S.y);
    // tay cao hơn đầu một chút (dy ≈ -0.6) đã chạm đỉnh; dang ngang hết tay chạm mép màn hình
    let x = SD.x + sgn * dx * W * 0.65;
    let y = dy < 0 ? SD.y + (dy / 0.6) * (SD.y - H * 0.03) : SD.y + dy * (H - SD.y);
    x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y));
    out.push(trackHand(id, x, y, now, pl.toD(Wr.x, Wr.y)));
  }
  return out;
}
function trackHand(id, x, y, now, from = null) {
  const h = app.hands[id] || (app.hands[id] = { trail: [] });
  const dt = h.t ? Math.max(1, now - h.t) / 1000 : 0;
  const px = h.x, py = h.y;
  h.speed = dt ? Math.hypot(x - px, y - py) / dt / renderer.H : 0;
  Object.assign(h, { x, y, px, py, t: now, id, color: HAND_COLORS[id], from, fast: h.speed >= app.fg?.cfg.minSpeed });
  const lp = h.trail[h.trail.length - 1];
  if (!lp || Math.hypot(x - lp.x, y - lp.y) > 1.5 * renderer.u) h.trail.push({ x, y, t: now }); // bỏ điểm trùng (camera chậm hơn khung hình)
  else lp.t = now;
  h.trail = h.trail.filter(p => now - p.t < 220).slice(-24);
  return h;
}
function pointerHands(now) { // không camera: chạm / kéo chuột để chém
  const p = app.ptr;
  if (!p || !p.down) { delete app.hands.M; return []; }
  return [trackHand('M', p.x, p.y, now)];
}
function fruitView(now, live = true) {
  const pl = app.input === 'camera' ? fruitPlace(now) : null;
  const hands = live ? (app.input === 'camera' ? (pl ? cameraHands(pl, now) : []) : pointerHands(now)) : Object.values(app.hands);
  const it = pl ? app.cutouts.items[app.mainIdx] : null;
  let skel = null;
  if (pl && !it && app.raw) skel = app.raw.map(q => { const d = pl.toD(q.x * pl.fw, q.y * pl.fh); return { x: d.x, y: d.y, v: q.v }; });
  return { person: it ? { it, anchorF: pl.anchorF, anchorD: pl.anchorD, s: pl.s } : null, skel, hands };
}
function fruitCountdownFrame(now, dt) {
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount && left > 0) { app.lastCount = left; big(String(left)); sfx.tick(); }
  ui.fruit = fruitUi();
  renderer.fruitScene(dt, now / 1000, app.fg, fruitView(now)); // thử vung tay trong lúc đếm ngược
  if (now >= app.countEnd) { big('CHÉM!'); sfx.go(); setMode('fruit'); }
}
function fruitFrame(now, dt) {
  const fg = app.fg, view = fruitView(now);
  fg.update(dt, view.hands);
  for (const ev of fg.drain()) {
    switch (ev.kind) {
      case 'slice': sfx.coin(); renderer.sliceFx(ev.o, ev.angle); break;
      case 'gold': sfx.star(); renderer.sliceFx(ev.o, ev.angle); renderer.popup(ev.o.x, ev.o.y, '+5 giây ⭐', '#ffe066', 1.3); break;
      case 'combo': sfx.star(); renderer.popup(renderer.W / 2, renderer.H * 0.3, `Combo ×${ev.n}! +${ev.n}`, '#7dffb0', 1.6); buzz(40); break;
      case 'bomb': sfx.fire(); renderer.burst(ev.o.x, ev.o.y, '#ff7b00', 40); renderer.flash = 1; renderer.flashColor = '255,60,0'; renderer.shake = 16; renderer.popup(ev.o.x, ev.o.y, 'BÙM! −1 ♥', '#ff5a3c', 1.4); buzz([80, 40, 200]); break;
    }
  }
  ui.fruit = fruitUi();
  renderer.fruitScene(dt, now / 1000, fg, view);
  if (fg.over) fruitOver();
}
function fruitOver() {
  const fg = app.fg;
  setMode('over'); releaseWakeLock(); sfx.over();
  let best = store.get('bestFruit', 0); const record = fg.score > best && fg.score > 0; best = Math.max(best, fg.score); store.set('bestFruit', best);
  const title = `${fg.endReason === 'bomb' ? 'Trúng bom! ' : 'Hết giờ! '}${fg.score} điểm`;
  const detail = `${fg.sliced} trái · combo lớn nhất ×${fg.bestCombo || 1} · rơi mất ${fg.missed}`;
  $('over-score').textContent = fg.score; $('over-detail').textContent = detail; $('over-best').textContent = record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`;
  $('over-hands').textContent = app.input === 'camera' ? 'hoặc giơ 2 tay 1.5 giây để chơi lại' : '';
  ui.panel = { title, color: '#00e5ff', lines: [detail, record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`, app.input === 'camera' ? '🙌 Giơ 2 tay 1.5 giây để chơi lại' : 'Enter / bấm Chơi lại'] };
  const runs = store.get('runs', []); runs.push({ at: Date.now(), game: 'fruit', score: fg.score, sliced: fg.sliced, input: app.input, output: settings.output }); store.set('runs', runs.slice(-30));
  setTimeout(() => { if (app.mode === 'over') show('scr-over'); }, 900);
  app.handsSince = 0;
}
// chạm / kéo chuột để chém (chế độ không camera)
const toCanvas = e => { const r = renderer.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * renderer.W / r.width, y: (e.clientY - r.top) * renderer.H / r.height }; };
$('stage').addEventListener('pointerdown', e => { if (isFruit()) app.ptr = { ...toCanvas(e), down: true }; });
$('stage').addEventListener('pointermove', e => { if (isFruit() && app.ptr?.down) Object.assign(app.ptr, toCanvas(e)); });
window.addEventListener('pointerup', () => { if (app.ptr) app.ptr.down = false; });

// ---------------- Chọn game ở menu ----------------
const GAME_DESC = {
  runner: 'Bước né tường, nhảy qua hố lửa, ngồi tránh laser, giơ tay hái sao. 1 người.',
  tiles: 'Sàn nhà thành lưới ô. Hết giờ phải đứng trên Ô XANH — ô đỏ là hố lửa! Ô đổi ngẫu nhiên mỗi vòng. 1–4 người, người trụ lại cuối cùng thắng.',
  fruit: 'Vung 2 tay chém trái cây rơi từ trên xuống, né bom. Đưa tay cao hơn đầu một chút là lưỡi chém đã chạm đỉnh màn hình — không cần với cao. 75 giây, 1 người.',
};
function renderGameSel() {
  $('g-runner').classList.toggle('on', settings.game === 'runner'); $('g-runner').setAttribute('aria-checked', settings.game === 'runner');
  $('g-tiles').classList.toggle('on', settings.game === 'tiles'); $('g-tiles').setAttribute('aria-checked', settings.game === 'tiles');
  $('g-fruit').classList.toggle('on', settings.game === 'fruit'); $('g-fruit').setAttribute('aria-checked', settings.game === 'fruit');
  $('game-desc').textContent = GAME_DESC[settings.game];
}
$('g-runner').onclick = () => { settings.game = 'runner'; saveSettings(); renderGameSel(); };
$('g-tiles').onclick = () => { settings.game = 'tiles'; saveSettings(); renderGameSel(); };
$('g-fruit').onclick = () => { settings.game = 'fruit'; saveSettings(); renderGameSel(); };
renderGameSel();

// ---------------- Wake lock / lifecycle ----------------
async function requestWakeLock() { try { app.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* không hỗ trợ */ } }
function releaseWakeLock() { if (tvOut()) return; try { app.wakeLock?.release(); } catch { /* */ } app.wakeLock = null; } // chế độ TV: giữ sáng suốt
async function ensureCamera() {
  if (app.input !== 'camera' || app.mode === 'menu') return true;
  const tr = video.srcObject?.getVideoTracks?.()[0];
  if (tr && tr.readyState === 'live' && !tr.muted) { if (video.paused) await video.play().catch(() => {}); return true; }
  try {
    app.cam = await startCamera(video, settings.facing, tvOut());
    updateMapper(); bench.watchVideo(video); if (app.pose) app.pose.lastVideoTime = -1;
    return true;
  } catch (e) { alertBox(explainCameraError(e)); return false; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause('Tạm dừng');
  else { ensureCamera(); if (tvOut()) requestWakeLock(); }
});
window.addEventListener('resize', () => { renderer.resize(); renderer.setWorld(null, null); updateMapper(); });

// ---------------- Buttons ----------------
$('btn-tv').onclick = () => { $('tv-code').value = store.get('tvCode', ''); $('tv-status').textContent = ''; $('tv-display-url').textContent = new URL('./', location.href).href.replace(/^https:\/\//, '') + '  (TV tự chuyển sang trang màn hình)'; $('dlg-tv').showModal(); };
$('btn-tv-mirror').onclick = async () => { chooseOutput('tv'); link.close(); audioToLocal(); $('dlg-tv').close(); await fullscreenLandscape(); applyOutput(); startCameraFlow(); };
$('btn-tv-connect').onclick = connectWifi;
$('btn-cam').onclick = () => { chooseOutput('phone'); link.close(); audioToLocal(); applyOutput(); startCameraFlow(); };
$('btn-manual').onclick = startManual;
$('btn-help').onclick = () => $('dlg-help').showModal();
$('btn-settings').onclick = () => {
  $('set-model').value = settings.model; $('set-sens').value = settings.sens;
  $('set-skel').checked = settings.skeleton; $('set-sound').checked = settings.sound;
  $('set-debug').checked = settings.debug; $('set-tut').checked = settings.tutorial;
  $('set-body').value = settings.bodyMode; $('set-cue').checked = settings.cueSound;
  $('set-look').value = settings.look; $('set-scale').value = settings.playerScale; $('set-dim').value = settings.bgDim;
  $('set-scale-val').textContent = Math.round(settings.playerScale * 100) + '%'; $('set-dim-val').textContent = Math.round(settings.bgDim * 100) + '%';
  $('set-lag').value = lagMs(); $('set-lag-val').textContent = `${lagMs()} ms (${{ phone: 'điện thoại', tv: 'HDMI / phản chiếu', wifi: 'Wi-Fi' }[settings.output]})`;
  $('dlg-settings').showModal();
};
$('set-lag').oninput = () => { $('set-lag-val').textContent = `${$('set-lag').value} ms`; };
$('set-scale').oninput = () => { $('set-scale-val').textContent = Math.round(+$('set-scale').value * 100) + '%'; };
$('set-dim').oninput = () => { $('set-dim-val').textContent = Math.round(+$('set-dim').value * 100) + '%'; };
$('btn-relag').onclick = () => { settings.lagMeasured[settings.output] = false; saveSettings(); $('set-lag-val').textContent += ' · sẽ đo lại ở lượt sau'; };
$('dlg-settings').addEventListener('close', () => {
  Object.assign(settings, {
    model: $('set-model').value, sens: +$('set-sens').value, skeleton: $('set-skel').checked,
    sound: $('set-sound').checked, debug: $('set-debug').checked, tutorial: $('set-tut').checked,
    bodyMode: $('set-body').value, cueSound: $('set-cue').checked,
    look: $('set-look').value, playerScale: +$('set-scale').value, bgDim: +$('set-dim').value,
  });
  app.pose?.setSegmentation(settings.look === 'game' || isFruit()); app.ps = null;
  applyLook();
  const v = +$('set-lag').value;
  if (v !== lagMs()) { settings.lag[settings.output] = v; settings.lagMeasured[settings.output] = true; }
  applySettings();
});
$('btn-export').onclick = () => {
  const rep = bench.report({ settings, runs: store.get('runs', []), feedback: store.get('feedback', []), linkRttMs: link.rtt });
  const json = JSON.stringify(rep, null, 2);
  try {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: `aor-perf-${Date.now()}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  } catch { /* */ }
  navigator.clipboard?.writeText(json).then(() => { $('btn-export').textContent = '✓ Đã copy JSON vào clipboard'; }).catch(() => {});
};
$('btn-calib-back').onclick = toMenu;
$('btn-calib-setup').onclick = () => { askMotionPermission(); enterSetup(); };
$('btn-setup').onclick = () => {
  askMotionPermission(); unlockAudio();
  if (settings.output === 'wifi' && !link.live) chooseOutput('phone');
  app.afterCamera = 'setup'; applyOutput(); startCameraFlow();
};
$('btn-setup-back').onclick = toMenu;
$('btn-setup-done').onclick = () => { sfx.ok(); enterCalibration(); };
$('btn-setup-flip').onclick = async () => { settings.facing = settings.facing === 'user' ? 'environment' : 'user'; saveSettings(); app.afterCamera = 'setup'; await startCameraFlow(); };
$('btn-calib-start').onclick = () => { unlockAudio(); beginPlay(); };
$('btn-calib-lag').onclick = () => { unlockAudio(); startLagTest(startCountdown); };
$('btn-flip').onclick = async () => { settings.facing = settings.facing === 'user' ? 'environment' : 'user'; saveSettings(); await startCameraFlow(); };
$('btn-pause').onclick = () => pause();
$('btn-resume').onclick = resume;
$('btn-pause-menu').onclick = toMenu;
$('btn-again').onclick = () => { app.game = null; app.tg = null; app.fg = null; startCountdown(); };
$('btn-over-menu').onclick = toMenu;
document.querySelectorAll('.fb').forEach(b => b.onclick = () => {
  if (app.rated) return; app.rated = true;
  const fb = store.get('feedback', []);
  fb.push({ at: Date.now(), rating: +b.dataset.r, score: app.game?.score, input: app.input, output: settings.output, model: app.pose?.model, delegate: app.pose?.delegate });
  store.set('feedback', fb.slice(-50));
  document.querySelectorAll('.fb').forEach(x => { x.disabled = true; });
  sfx.ok();
});

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('btn-install').hidden = false; });
$('btn-install').onclick = async () => { deferredInstall?.prompt(); deferredInstall = null; $('btn-install').hidden = true; };

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('[sw]', e));
}

// ---------------- Main loop ----------------
function debugText() {
  const l = bench.live(), s = motion.state;
  return [
    `FPS ${l.fps.toFixed(0)} | pose ${l.poseFps.toFixed(0)} Hz`,
    `infer ${l.inferMs.toFixed(1)} ms${app.poseSkip ? ' (skip)' : ''}`,
    `cam→pose ${l.latencyMs ? l.latencyMs.toFixed(0) + ' ms' : 'n/a'}`,
    `${app.pose?.model ?? '-'} / ${app.pose?.delegate ?? '-'} ${bench.info.video ?? ''}`,
    `out ${settings.output} lag ${lagMs()} ms${link.rtt ? ' rtt ' + Math.round(link.rtt) : ''}`,
    `lane ${s.lane} x=${s.laneX.toFixed(2)} rise ${s.rise.toFixed(2)} drop ${s.drop.toFixed(2)}`,
    `${s.airborne ? 'AIR ' : ''}${s.ducking ? 'DUCK ' : ''}${s.handsUp ? 'HANDS ' : ''}${s.coasting ? 'COAST ' : ''}${motion.mode} dist ${s.distance.hint} hips ${s.hipsSeen ? 'y' : 'n'} lost10s ${app.lostEvents.length}`,
  ].join('\n');
}

let dbgAt = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dtMs = app.lastT ? now - app.lastT : 16.7; app.lastT = now;
  const dt = Math.min(0.1, dtMs / 1000);
  bench.onFrame(dtMs);
  if (app.input === 'camera' && app.mode !== 'menu') processPose(now);
  switch (app.mode) {
    case 'calib': calibFrame(now); break;
    case 'setup': setupFrame(now); break;
    case 'lagtest': lagFrame(now); break;
    case 'countdown': countdownFrame(now, dt); break;
    case 'play': playFrame(now, dt); break;
    case 'over': overFrame(now, dt); break;
    case 'tiles': tilesFrame(now, dt); break;
    case 'fruit': fruitFrame(now, dt); break;
    case 'paused':
      if (isFruit() && app.fg) renderer.fruitScene(0, now / 1000, app.fg, fruitView(now, false));
      else if (isTiles() && app.tg) renderer.tilesScene(0, now / 1000, app.tg, drawGeom(), app.tracker.list, app.tg.roster, null, tilesPeople());
      else if (app.game) renderer.frame(0, now / 1000, app.game, player(), viewOpts());
      break;
    default: if (renderer.tvHud) renderer.clear();
  }
  if (renderer.tvHud) { updateCorner(); renderer.overlay(ui, now); }
  if (settings.debug && now - dbgAt > 250) { dbgAt = now; $('debug').textContent = debugText(); }
}
applySettings();
if (settings.output === 'wifi') settings.output = 'phone'; // mở lại app: phải nối TV lại
applyOutput();
requestAnimationFrame(loop);

// Cho kiểm thử tự động / console
window.__aor = { app, renderer, motion, bench, settings, startManual, manualAction, link, ui, TUTORIAL };
