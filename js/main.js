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
import { PlayerTracker, torsoSignature } from './players.js';
import { TileGame, TileGeom } from './tiles.js';
import { Cutouts } from './cutout.js';
import { FruitGame } from './fruits.js';
import { DinoGame, RESP, STAGES } from './dino.js';
import { DanceGame, buildChart, POSES as DANCE_POSES, DancePractice, KID_POSES, KID_GRADE, KID_PRACTICE_STEPS, kidMatch } from './dance.js';
import { say, hush } from './voice.js';
import { DancePoseDetector } from './dancepose.js';
import { Princess3D } from './princess3d.js';
import { MusicPlayer, BUILTIN, renderBuiltin, loadUserFile, listSavedSongs, loadSavedSong } from './music.js';
import { PresenceGate } from './personcheck.js';

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
  fg: null, hands: {}, fps: null, arm: {}, ptr: null, gate: new PresenceGate(),
  music: new MusicPlayer(), dpd: new DancePoseDetector(), p3d: new Princess3D(), practice: null, dance: null, claps: [], song: null, songs: [], clapState: false, lastClapAt: 0, clapFx: null,
};
// Nội dung chữ vẽ lên canvas cho TV (HUD, gợi ý, đếm ngược, bảng thông báo)
const ui = { hud: null, hint: '', big: null, panel: null, corner: '', cornerColor: null, cue: null, tiles: null };
const isTiles = () => settings.game === 'tiles';
const isFruit = () => settings.game === 'fruit';
const isDino = () => settings.game === 'dino';
const isDance = () => settings.game === 'dance';
const segOn = () => settings.look === 'game' || isFruit() || isDino() || isDance(); // cần mặt nạ tách người

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
  renderer.look = isFruit() && !real ? 'fruit' : isDino() && !real ? 'dino' : isDance() && !real ? 'dance' : game ? 'game' : 'ar'; // Chém trái cây luôn dùng nền trời cao + người thu nhỏ
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
    await app.pose.setNumPoses(isTiles() ? 4 : isFruit() ? 2 : 1); // Chém trái cây: tối đa 2 người
    await app.pose.setSegmentation(segOn());
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
  if (r.rejected?.length) { app.rejLast = r.rejected[0]; app.rejAt = now; app.rejN = (app.rejN || 0) + 1; }
  // Người "chính" (hiệu chỉnh, giơ tay bắt đầu, chơi Vượt chướng ngại): bám theo người chính của frame trước,
  // không đổi qua lại khi có nhiều người trong khung.
  let main = r.landmarks;
  if (r.all.length > 1 && app.primaryC && now - app.primaryAt < 1500) {
    let best = Infinity;
    for (const lm of r.all) { const d = Math.hypot((lm[11].x + lm[12].x) / 2 - app.primaryC.x, (lm[11].y + lm[12].y) / 2 - app.primaryC.y); if (d < best) { best = d; main = lm; } }
  }
  if (main) { app.primaryC = { x: (main[11].x + main[12].x) / 2, y: (main[11].y + main[12].y) / 2 }; app.primaryAt = now; }
  app.mainIdx = Math.max(0, r.all.indexOf(main));
  if (r.masks && ['game', 'fruit', 'dino', 'dance'].includes(renderer.look)) app.cutouts.update(r.frame, r.masks, r.all);
  // người chính phải xuất hiện ổn định ~0,45 s mới tính (lọc đồ vật bị nhận nhầm thoáng qua)
  const fr = app.pose.frame;
  main = app.gate.update(main, now, fr ? fr.width / fr.height : 16 / 9, main ? r.strict?.[r.all.indexOf(main)] ?? true : true);
  if (!main) app.mainIdx = -1;
  const sm = smoother.apply(main, now);
  app.raw = sm;
  app.pts = sm ? sm.map(app.mapper) : null;
  motion.update(app.pts, app.raw, renderer.W, renderer.H, now);
  if (isTiles() || isFruit()) {
    // chữ ký màu áo từng người → 2 người đứng sát nhau không bị tráo ID
    const fc = app.pose.fctx, f = r.frame, sigOf = fc && r.all.length > 1 ? lm => torsoSignature(fc, f.width, f.height, lm) : null;
    app.tracker.update(r.all, app.mapper, renderer.W, renderer.H, now, sigOf, r.strict);
  }
  updateWorld();
  if (isDance()) { app.rawScr = main ? main.map(app.mapper) : null; if (app.mode === 'dance') detectClap(r.ts); }
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
  const anyHands = s.handsUp || ((isTiles() || isFruit()) && app.tracker.list.some(p => p.present && p.handsUp));
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
  if (isFruit()) { const n = app.tracker.list.filter(p => p.present).length; lines.push(n >= 2 ? '👥 Thấy 2 người → chơi ĐỐI KHÁNG (ai nhiều điểm hơn thắng)' : '👤 1 người — muốn chơi 2 người thì người thứ hai đứng vào khung trước khi bắt đầu'); }
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
  else if (isDino()) { if (!app.dg || app.dg.over || ['calib', 'lagtest', 'menu', 'setup'].includes(app.mode)) newDino(); }
  else if (isDance()) { if (!newDance()) return; }
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
  if (isDino()) return dinoCountdownFrame(now, dt);
  if (isDance()) return danceCountdownFrame(now, dt);
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
  else if (isDino()) renderer.dinoScene(dt, now / 1000, app.dg, dinoView(now, false));
  else if (isDance() && app.dance) renderer.danceScene(dt, now / 1000, app.dance, danceView(now));
  else if (isTiles()) renderer.tilesScene(dt, now / 1000, app.tg, drawGeom(), app.input === 'camera' ? app.tracker.list : [], app.tg.roster, null, tilesPeople());
  else renderer.frame(dt, now / 1000, app.game, player(), viewOpts());
  const anyHands = motion.state.handsUp || ((isTiles() || isFruit()) && app.tracker.list.some(p => p.present && p.handsUp));
  if (app.input === 'camera' && anyHands) {
    app.handsSince ||= now;
    if (ui.panel) ui.panel.progress = Math.min(1, (now - app.handsSince) / 1500);
    if (now - app.handsSince > 1500) { app.game = null; app.tg = null; app.fg = null; app.dg = null; app.dance = null; startCountdown(); }
  } else { app.handsSince = 0; if (ui.panel) ui.panel.progress = null; }
}

function pause(title = 'Tạm dừng') {
  if (!['play', 'countdown', 'tiles', 'fruit', 'dino', 'dance'].includes(app.mode)) return;
  if (app.mode === 'dance' || (app.mode === 'countdown' && isDance())) app.music.pause();
  app.pausedFrom = app.mode;
  setMode('paused'); $('pause-title').textContent = title; show('scr-pause'); releaseWakeLock();
  ui.panel = { title: '⏸ ' + title, lines: ['Bấm "Tiếp tục" trên điện thoại'] };
}
async function resume() {
  if (!(await ensureCamera())) return;
  show(null); ui.panel = null;
  if (app.pausedFrom === 'tiles') { app.tilesLastT = 0; setMode('tiles'); requestWakeLock(); return; }
  if (app.pausedFrom === 'fruit' || app.pausedFrom === 'dino') { setMode(app.pausedFrom); requestWakeLock(); return; }
  if (app.pausedFrom === 'dance') { app.music.play(); setMode('dance'); requestWakeLock(); return; } // Ô an toàn: chơi tiếp ngay (đồng hồ vòng đã dừng)
  app.countEnd = performance.now() + 3000; app.lastCount = 0; setMode('countdown'); requestWakeLock();
}
function toMenu() {
  hush();
  setMode('menu'); setHint(''); big(''); $('hud').hidden = true; releaseWakeLock();
  stopCamera(); video.classList.remove('on'); app.pts = null; app.game = null; app.practice = null; app.tg = null; app.fg = null; app.dg = null; app.dance = null; app.music.stop(); ui.hud = null; ui.tiles = null; ui.fruit = null; ui.dino = null; ui.fact = null; ui.dance = null;
  ui.panel = link.live ? { title: 'AR Obstacle Runner', lines: ['Chọn chế độ chơi trên điện thoại'] } : null;
  renderer.clear(); show('scr-menu');
}

// ---------------- Manual (không camera) input ----------------
function manualAction(kind) {
  const m = app.manual, tm = app.manualTimers;
  if (isFruit()) return; // Chém trái cây: kéo ngón tay / chuột trên màn hình để chém
  if (isDino()) { // Đấu khủng long bằng phím: ← → né (tự về giữa), ↓ ngồi, ↑ / H đỡ; kéo chuột để đánh
    if (kind === 'left' || kind === 'right') { m.lane = kind === 'left' ? 0 : 2; clearTimeout(tm.lane); tm.lane = setTimeout(() => { m.lane = 1; }, 650); return; }
  }
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
  if (isDance()) { // ← → ↑ ↓ + Q/E (chéo) như Audition, SPACE = vỗ tay (chốt nhịp)
    const dm = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'UP', ArrowDown: 'DN', q: 'UL', e: 'UR', Q: 'UL', E: 'UR', 7: 'UL', 9: 'UR', w: 'T', W: 'T', 8: 'T', s: 'SPIN', S: 'SPIN', 5: 'SPIN' };
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) app.claps.push(performance.now()); return; }
    if (dm[e.key]) { e.preventDefault(); app.manual.dpose = dm[e.key]; app.manual.dposeAt = performance.now(); }
    return;
  }
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
const DINO_PERSON = 0.44; // Đấu khủng long: người cao ~44% màn hình, đứng trước khủng long
const FRUIT_PERSON = 0.3; // người chỉ cao 30% màn hình, đứng ở đáy → bầu trời cao để chém
const HAND_COLORS = { L: '#00e5ff', R: '#ff9f1c', M: '#7dffb0', L1: '#00e5ff', R1: '#6fb8ff', L2: '#ff9f1c', R2: '#ff5ea8' };
const DUO_COLORS = ['#00e5ff', '#ff9f1c']; // P1 xanh, P2 cam
/** Đủ 2 người trong khung → chơi đối kháng. Chọn 2 người gần camera nhất (vai rộng nhất), xếp trái → phải. */
function fruitDuoIds() {
  if (app.input !== 'camera') return null;
  const ps = app.tracker.list.filter(p => p.present && p.pts)
    .sort((a, b) => Math.abs(b.pts[11].x - b.pts[12].x) - Math.abs(a.pts[11].x - a.pts[12].x)).slice(0, 2);
  return ps.length === 2 ? ps.sort((a, b) => a.c.x - b.c.x).map(p => p.id) : null;
}
function newFruit(duo = fruitDuoIds()) {
  if (duo) app.tracker.setKeep(duo);
  app.fruitIds = duo; app.fslots = [{}, {}];
  app.fg = new FruitGame({ W: renderer.W, H: renderer.H, seed: (Math.random() * 2 ** 31) | 0, players: duo ? 2 : 1 });
  app.hands = {}; app.fps = null; app.rated = false; app.arm = {};
  document.querySelectorAll('.fb').forEach(b => { b.disabled = false; });
  ui.fruit = fruitUi(); ui.hud = null; ui.tiles = null;
}
function fruitUi() {
  const f = app.fg;
  return { score: f.score, time: f.time, duration: f.cfg.duration, lives: f.lives, maxLives: f.cfg.lives, best: store.get('bestFruit', 0),
    duo: f.duo ? f.p.map((P, i) => ({ score: P.score, color: DUO_COLORS[i], stunned: f.stunned(i) })) : null };
}

/**
 * Vị trí + tỉ lệ một người trên màn hình (nhỏ, đứng ở đáy), tính từ landmark chuẩn hoá `raw`.
 * slot: trạng thái làm mượt tỉ lệ riêng cho từng người; ax: vị trí ngang (0..1) nơi đặt người.
 */
function fruitPlace(raw, now, slot, ax, frac = FRUIT_PERSON, footY = 0.98) {
  const fr = app.pose?.frame;
  if (!raw || !fr) return null;
  const fw = fr.width, fh = fr.height, W = renderer.W, H = renderer.H;
  const P = i => ({ x: raw[i].x * fw, y: raw[i].y * fh, v: raw[i].v });
  const ls = P(11), rs = P(12), shW = Math.hypot(ls.x - rs.x, ls.y - rs.y), sh = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  if (shW < 4) return null;
  const fi = [27, 28, 29, 30, 31, 32].filter(i => raw[i].v > 0.5);
  const feet = fi.length >= 2 ? { x: fi.reduce((a, i) => a + raw[i].x * fw, 0) / fi.length, y: Math.max(...fi.map(i => raw[i].y * fh)) } : null;
  const nose = P(0), headY = nose.v > 0.3 ? nose.y - shW * 0.75 : sh.y - shW * 1.2;
  const targetH = H * frac;
  const sNew = feet && feet.y - headY > 20 ? targetH / (feet.y - headY) : (targetH * 0.23) / shW;
  const k = 1 - Math.exp(-(now - (slot.t || now)) / 400); slot.t = now;
  slot.s = slot.s == null ? sNew : slot.s + (sNew - slot.s) * k;
  const s = slot.s, mirror = renderer.mirror;
  const anchorF = feet || sh;
  const anchorD = { x: W * ax, y: feet ? H * footY : H * footY - targetH * 0.7 };
  const toD = (x, y) => ({ x: anchorD.x + (mirror ? -1 : 1) * (x - anchorF.x) * s, y: anchorD.y + (y - anchorF.y) * s });
  return { s, anchorF, anchorD, toD, P, shW, mirror, fw, fh, raw, headD: toD(sh.x, headY) };
}
/** Danh sách người đang chơi: [{ pid, pl, maskIdx, raw }] — 1 người dùng người chính, 2 người dùng PlayerTracker. */
function fruitPlaces(now) {
  if (app.input !== 'camera') return [];
  const fg = app.fg;
  if (!fg?.duo || !app.fruitIds) {
    if (!motion.state.present) return [];
    const ax = Math.min(0.85, Math.max(0.15, motion.state.laneX));
    const pl = fruitPlace(app.raw, now, app.fslots?.[0] || (app.fslots = [{}, {}])[0], ax);
    return pl ? [{ pid: 0, pl, maskIdx: app.mainIdx, raw: app.raw }] : [];
  }
  const W = renderer.W;
  const ps = app.fruitIds.map(id => app.tracker.list.find(p => p.id === id && p.present && p.raw));
  // vị trí ngang theo chỗ đứng thật, nhưng giữ 2 người cách nhau ≥ 30% màn hình và P1 luôn bên trái
  let xs = ps.map((p, i) => (p ? p.c.x / W : i ? 0.72 : 0.28));
  xs = [Math.min(0.62, Math.max(0.1, xs[0])), Math.min(0.9, Math.max(0.38, xs[1]))];
  if (xs[1] - xs[0] < 0.3) { const m = (xs[0] + xs[1]) / 2; xs = [Math.max(0.1, m - 0.15), Math.min(0.9, m + 0.15)]; }
  const out = [];
  ps.forEach((p, i) => { if (!p) return; const pl = fruitPlace(p.raw, now, app.fslots[i], xs[i]); if (pl) out.push({ pid: i, pl, maskIdx: p.maskIdx, raw: p.raw }); });
  return out;
}

/**
 * Lưỡi chém = VAI + hướng vươn tay × tầm màn hình. Tay vươn thẳng lên (dy≈-1) chạm đỉnh màn hình, dang ngang chạm mép;
 * nên chỉ cần đưa tay ngang đầu là chém tới trên cao → tay không phải ra khỏi khung camera (không mất dấu).
 * Cổ tay khuất / ra ngoài khung: đoán theo hướng cánh tay từ khuỷu.
 */
function cameraHands(pl, now, pid = 0, duo = false) {
  const out = [], W = renderer.W, H = renderer.H, sgn = pl.mirror ? -1 : 1;
  const gain = duo ? 0.55 : 0.65; // 2 người: tầm ngang ngắn hơn chút để mỗi người chủ yếu chém phía mình
  for (const [hid, [si, ei, wi]] of [['L', [11, 13, 15]], ['R', [12, 14, 16]]]) {
    const id = duo ? hid + (pid + 1) : hid;
    const S = pl.P(si), E = pl.P(ei); let Wr = pl.P(wi);
    if (S.v < 0.4) continue;
    if (Wr.v < 0.35) { if (E.v < 0.5) continue; Wr = { x: E.x + (E.x - S.x) * 0.95, y: E.y + (E.y - S.y) * 0.95, v: 0.5 }; }
    const reach = E.v >= 0.4 ? Math.hypot(E.x - S.x, E.y - S.y) + Math.hypot(Wr.x - E.x, Wr.y - E.y) : Math.hypot(Wr.x - S.x, Wr.y - S.y);
    app.arm[id] = Math.max((app.arm[id] || pl.shW * 1.3) * 0.9995, reach, pl.shW * 1.2); // chiều dài tay (lấy lớn nhất đã thấy)
    const arm = app.arm[id];
    const dx = (Wr.x - S.x) / arm, dy = (Wr.y - S.y) / arm;
    const SD = pl.toD(S.x, S.y);
    // tay cao hơn đầu một chút (dy ≈ -0.6) đã chạm đỉnh; dang ngang hết tay chạm mép màn hình
    let x = SD.x + sgn * dx * W * gain;
    let y = dy < 0 ? SD.y + (dy / 0.6) * (SD.y - H * 0.03) : SD.y + dy * (H - SD.y);
    x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y));
    const h = trackHand(id, x, y, now, pl.toD(Wr.x, Wr.y));
    h.pid = pid; h.stunned = !!app.fg?.stunned(pid);
    out.push(h);
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
  const places = fruitPlaces(now), duo = !!app.fg?.duo;
  let hands;
  if (!live) hands = Object.values(app.hands);
  else if (app.input === 'camera') {
    hands = places.flatMap(q => cameraHands(q.pl, now, q.pid, duo));
    const ids = new Set(hands.map(h => h.id));
    for (const k of Object.keys(app.hands)) if (!ids.has(k)) delete app.hands[k]; // người khuất → bỏ lưỡi chém cũ
  } else hands = pointerHands(now);
  const persons = places.map(({ pid, pl, maskIdx, raw }) => {
    const it = app.cutouts.items[maskIdx];
    const label = duo ? { text: `P${pid + 1}`, color: DUO_COLORS[pid], stunned: !!app.fg?.stunned(pid), x: pl.headD.x, y: pl.headD.y - 26 * renderer.u } : null;
    if (it) return { it, anchorF: pl.anchorF, anchorD: pl.anchorD, s: pl.s, label };
    const skel = raw.map(q => { const d = pl.toD(q.x * pl.fw, q.y * pl.fh); return { x: d.x, y: d.y, v: q.v }; });
    return { skel, anchorD: pl.anchorD, s: pl.s, label };
  });
  return { persons, hands };
}
function fruitCountdownFrame(now, dt) {
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount && left > 0) { app.lastCount = left; big(String(left)); sfx.tick(); }
  ui.fruit = fruitUi();
  renderer.fruitScene(dt, now / 1000, app.fg, fruitView(now)); // thử vung tay trong lúc đếm ngược
  if (now >= app.countEnd) { // chốt số người lúc hết đếm ngược (người thứ 2 có 3 giây để vào khung)
    const want = fruitDuoIds();
    if (String(want) !== String(app.fruitIds)) newFruit(want);
    big(app.fg.duo ? '2 NGƯỜI — CHÉM!' : 'CHÉM!'); sfx.go(); setMode('fruit');
  }
}
function fruitFrame(now, dt) {
  const fg = app.fg, view = fruitView(now);
  fg.update(dt, view.hands);
  for (const ev of fg.drain()) {
    switch (ev.kind) {
      case 'slice': sfx.coin(); renderer.sliceFx(ev.o, ev.angle); if (fg.duo) renderer.popup(ev.o.x, ev.o.y - ev.o.r, `+${ev.o.pts}`, DUO_COLORS[ev.pid], 0.7); break;
      case 'gold': sfx.star(); renderer.sliceFx(ev.o, ev.angle); renderer.popup(ev.o.x, ev.o.y, '+5 giây ⭐', '#ffe066', 1.3); break;
      case 'combo': sfx.star(); renderer.popup(renderer.W / 2, renderer.H * 0.3, `${fg.duo ? `P${ev.pid + 1} ` : ''}Combo ×${ev.n}! +${ev.n}`, fg.duo ? DUO_COLORS[ev.pid] : '#7dffb0', 1.6); buzz(40); break;
      case 'bomb': sfx.fire(); renderer.burst(ev.o.x, ev.o.y, '#ff7b00', 40); renderer.flash = 1; renderer.flashColor = '255,60,0'; renderer.shake = 16; renderer.popup(ev.o.x, ev.o.y, fg.duo ? `BÙM! P${ev.pid + 1} −${ev.lost} điểm, choáng!` : 'BÙM! −1 ♥', '#ff5a3c', 1.4); buzz([80, 40, 200]); break;
    }
  }
  ui.fruit = fruitUi();
  renderer.fruitScene(dt, now / 1000, fg, view);
  if (fg.over) fruitOver();
}
function fruitOver() {
  const fg = app.fg;
  setMode('over'); releaseWakeLock(); sfx.over();
  const top = fg.duo ? Math.max(fg.p[0].score, fg.p[1].score) : fg.score;
  let best = store.get('bestFruit', 0); const record = top > best && top > 0; best = Math.max(best, top); store.set('bestFruit', best);
  let title = `${fg.endReason === 'bomb' ? 'Trúng bom! ' : 'Hết giờ! '}${fg.score} điểm`;
  let detail = `${fg.sliced} trái · combo lớn nhất ×${fg.bestCombo || 1} · rơi mất ${fg.missed}`;
  let color = '#00e5ff';
  if (fg.duo) {
    const w = fg.winner(), [a, b] = fg.p;
    title = w < 0 ? `Hoà! ${a.score} – ${b.score}` : `🏆 P${w + 1} thắng! ${a.score} – ${b.score}`;
    color = w < 0 ? '#ffffff' : DUO_COLORS[w];
    detail = `P1: ${a.sliced} trái, combo ×${a.bestCombo || 1} · P2: ${b.sliced} trái, combo ×${b.bestCombo || 1}`;
  }
  $('over-score').textContent = fg.duo ? `${fg.p[0].score} – ${fg.p[1].score}` : fg.score; $('over-detail').textContent = detail; $('over-best').textContent = record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`;
  $('over-hands').textContent = app.input === 'camera' ? 'hoặc giơ 2 tay 1.5 giây để chơi lại' : '';
  ui.panel = { title, color, lines: [detail, record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`, app.input === 'camera' ? '🙌 Giơ 2 tay 1.5 giây để chơi lại' : 'Enter / bấm Chơi lại'] };
  const runs = store.get('runs', []); runs.push({ at: Date.now(), game: 'fruit', players: fg.players, score: fg.score, sliced: fg.sliced, input: app.input, output: settings.output }); store.set('runs', runs.slice(-30));
  setTimeout(() => { if (app.mode === 'over') show('scr-over'); }, 900);
  app.handsSince = 0;
}
// ---------------- Game "Đấu khủng long" ----------------
const DINO_HANDS = { L: '#ffd23f', R: '#ff5a3c', M: '#ffb347' };
function newDino() {
  // chơi tiếp từ màn đã tới lần trước (đủ mạng); ?dstage=N để chọn màn
  const st = params.has('dstage') ? +params.get('dstage') : store.get('dinoStage', 0);
  app.dg = new DinoGame({ W: renderer.W, H: renderer.H, seed: (Math.random() * 2 ** 31) | 0, lagMs: lagMs(), stage: st || 0 });
  app.hands = {}; app.arm = {}; app.fslots = [{}, {}]; app.dinoRef = null; app.dinoLost = 0; app.rated = false;
  document.querySelectorAll('.fb').forEach(b => { b.disabled = false; });
  ui.dino = dinoUi(); ui.hud = null; ui.tiles = null; ui.fruit = null;
}
function dinoUi() {
  const g = app.dg, d = g.dino;
  const broken = Object.values(d.parts || {}).filter(p => p.broken).map(p => `${p.name} gãy`).join(', ');
  return { name: d.name, boss: d.boss, rage: d.rage, hp: d.hp, maxHp: d.maxHp, wave: g.wave, level: g.level, lives: g.lives, maxLives: g.cfg.lives,
    stage: STAGES[g.stage].name, inStage: g.inStage, stageLen: STAGES[g.stage].roster.length, parts: broken,
    score: g.score, combo: g.combo, mult: g.mult, best: store.get('bestDino', 0), padRight: !tvOut() };
}
/** Đầu vào: tay (giống Chém trái cây: theo hướng vươn tay so với vai), né = lệch người khỏi chỗ đứng gốc, ngồi, giơ 2 tay. */
function dinoInput(now) {
  const s = motion.state, dg = app.dg;
  if (app.input !== 'camera') {
    const m = app.manual;
    return { hands: pointerHands(now).map(h => Object.assign(h, { color: DINO_HANDS.M })), dodge: m.lane - 1, duck: m.ducking, jump: m.airborne, guard: m.handsUp, present: true };
  }
  // né: so với chỗ đứng "gốc" (trôi chậm theo người chơi khi không bị tấn công) → không phải đứng đúng giữa khung
  const busy = dg && ['windup', 'attack'].includes(dg.dino.phase);
  if (app.dinoRef == null || !s.present) app.dinoRef = s.laneX;
  else if (!busy) app.dinoRef += (s.laneX - app.dinoRef) * Math.min(1, (now - (app.dinoRefT || now)) / 2500);
  app.dinoRefT = now;
  const off = s.laneX - app.dinoRef, dodge = off > 0.09 ? 1 : off < -0.09 ? -1 : 0;
  // người chơi đứng NGAY TRƯỚC con khủng long (giữa sân, chân chạm đất), né sang bên thì hình cũng dạt sang bên
  const ax = Math.min(0.78, Math.max(0.22, 0.5 + off * 1.6));
  const pl = s.present ? fruitPlace(app.raw, now, app.fslots[0], ax, renderer.H > renderer.W ? DINO_PERSON * 0.8 : DINO_PERSON, 0.985) : null;
  app.dinoPl = pl;
  const hands = pl ? cameraHands(pl, now).map(h => Object.assign(h, { color: DINO_HANDS[h.id] || '#fff' })) : [];
  if (!pl) app.hands = {};
  return { hands, dodge, duck: s.ducking, jump: s.airborne, guard: s.handsUp, present: s.present };
}
function dinoView(now, live = true, inp = null) {
  const pl = app.input === 'camera' && motion.state.present ? app.dinoPl : null;
  const it = pl ? app.cutouts.items[app.mainIdx] : null;
  let skel = null, person = null;
  if (it) person = { it, anchorF: pl.anchorF, anchorD: pl.anchorD, s: pl.s, head: pl.headD };
  else if (pl && app.raw) skel = app.raw.map(q => { const d = pl.toD(q.x * pl.fw, q.y * pl.fh); return { x: d.x, y: d.y, v: q.v }; });
  const react = inp ? (inp.jump ? '⬆ NHẢY' : inp.dodge < 0 ? '⬅ NÉ' : inp.dodge > 0 ? 'NÉ ➡' : inp.duck ? '⬇ NGỒI' : inp.guard ? '🙌 ĐỠ' : '') : '';
  return { hands: live && inp ? inp.hands : Object.values(app.hands), person, skel, head: pl?.headD, feet: pl?.anchorD, react, lost: !!inp && !inp.present, hurtAt: app.dinoHurtAt };
}
function dinoCountdownFrame(now, dt) {
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount && left > 0) { app.lastCount = left; big(String(left)); sfx.tick(); }
  const inp = dinoInput(now);
  ui.dino = dinoUi();
  renderer.dinoScene(dt, now / 1000, app.dg, dinoView(now, true, inp));
  if (now >= app.countEnd) { big('CHIẾN!'); sfx.go(); setMode('dino'); }
}
function dinoFrame(now, dt) {
  const dg = app.dg, inp = dinoInput(now);
  // mất dấu người > 0,8 s: khủng long đứng chờ (không bị đánh oan)
  if (!inp.present) app.dinoLost ||= now; else app.dinoLost = 0;
  const lost = app.dinoLost && now - app.dinoLost > 800;
  if (!lost) dg.update(dt, inp);
  for (const ev of dg.drain()) onDinoEvent(ev);
  const d = dg.dino;
  // gợi ý theo PHẢN ỨNG (màu + icon + chữ); giả đòn hiện y như đòn thật để "nhử"
  const cur = d.phase === 'attack' ? d.cur : null;
  if (cur && d.curTo > -0.1) {
    const nd = cur.fake ? 'dodge' : cur.need, R = RESP[nd] || RESP.dodge;
    ui.cue = nd === 'none' ? null : { color: R.color, icon: R.icon, say: R.say, arrow: nd === 'dodge', dir: cur.dir, t: 1.3 * Math.max(0, d.curTo) / Math.max(0.3, cur.tele), label: d.atk.label };
  } else ui.cue = null;
  ui.dino = dinoUi();
  renderer.dinoScene(dt, now / 1000, dg, dinoView(now, true, { ...inp, present: !lost }));
  if (dg.over) dinoOver();
}
const REACT_SFX = { dodge: 'cue_move', jump: 'cue_jump', duck: 'cue_duck', guard: 'cue_hands', hold: 'cue_hands', smash: 'tick' };
function onDinoEvent(ev) {
  const r = renderer;
  switch (ev.kind) {
    case 'stage': big(ev.cleared ? 'QUA MÀN! +1 ♥' : `Màn ${ev.stage + 1}`); ui.fact = { text: `🌍 ${ev.name}${ev.level > 1 ? ` · Vòng ${ev.level}` : ''}`, at: performance.now() }; store.set('dinoStage', ev.stage); break;
    case 'enter': setTimeout(() => big(ev.boss ? `👑 ${ev.name}!` : ev.name), ev.wave === 1 ? 1000 : 0); sfx.roar(); if (ev.boss) r.shake = 8; ui.fact = { text: `🦴 Bạn có biết? ${ev.note}`, at: performance.now() + 900 }; break;
    case 'windup': if (['roar', 'bite', 'chop'].includes(ev.attack.tmpl)) sfx.roar(); sfx[REACT_SFX[ev.attack.need]]?.(); break;
    case 'strike': r.shake = Math.max(r.shake || 0, 8); break;
    case 'feint': sfx.ok(); r.popup(r.W / 2, r.H * 0.5, 'GIẢ ĐÒN! 😏', '#9aa4b8', 1.3); break;
    case 'react': r.popup(r.W / 2, r.H * 0.56, ev.grade === 'perfect' ? 'PERFECT!' : 'TỐT', ev.grade === 'perfect' ? '#ffd23f' : '#7dffb0', ev.grade === 'perfect' ? 1.5 : 1.1); if (ev.grade === 'perfect') sfx.star(); break;
    case 'hit': sfx.coin(); r.burst(ev.x, ev.y, ev.gold ? '#ffd23f' : '#ff3b6b', ev.gold ? 30 : 18); r.popup(ev.x, ev.y - 30 * r.u, ev.gold ? `CHÍ MẠNG −${ev.dmg}` : `−${ev.dmg}`, ev.gold ? '#ffd23f' : '#fff', ev.gold ? 1.3 : 1); buzz(25); break;
    case 'smash': sfx.coin(); r.burst(ev.x, ev.y, ev.proj === 'fish' ? '#8fc8e8' : ev.proj === 'lizard' ? '#5fa84a' : '#b9b2a6', 22); r.popup(ev.x, ev.y, 'BỐP!', '#ffb347'); break;
    case 'dodged': r.popup(r.W / 2, r.H * 0.66, 'Phản công!', '#7dffb0', 1.2); break;
    case 'hurt': app.dinoHurtAt = performance.now() / 1000; sfx.hit(); r.claw = 1; r.shake = 18; r.flash = 0.6; r.flashColor = '200,0,0'; buzz([90, 40, 160]); break;
    case 'rage': sfx.roar(); big(ev.level === 2 ? 'ĐIÊN CUỒNG!' : 'NỔI GIẬN!'); r.shake = 12; break;
    case 'tired': r.popup(r.W / 2, r.H * 0.45, 'THỞ DỐC — ĐÁNH ĐI! 💨', '#ffd23f', 1.4); break;
    case 'rest': r.popup(r.W / 2, r.H * 0.45, 'Nó đang thị uy — đánh tự do!', '#7dffb0', 1.1); sfx.roar(); break;
    case 'break': sfx.star(); r.burst(ev.x, ev.y, '#fff2d0', 36); r.popup(ev.x, ev.y, `GÃY ${ev.name.toUpperCase()}!`, '#fff2d0', 1.5); r.shake = 10; break;
    case 'down': sfx.star(); big('HẠ GỤC!'); r.popup(r.W / 2, r.H * 0.4, `+${ev.bonus}`, '#ffd23f', 1.6); r.burst(r.W / 2, r.H * 0.8, '#c8a878', 40); break;
  }
}
function dinoOver() {
  const g = app.dg;
  setMode('over'); releaseWakeLock(); sfx.over(); ui.cue = null;
  let best = store.get('bestDino', 0); const record = g.score > best && g.score > 0; best = Math.max(best, g.score); store.set('bestDino', best);
  const title = `Bạn đã gục! ${g.score} điểm`;
  const detail = `${STAGES[g.stage].name} · hạ ${g.kills} con · trúng ${g.hits} · né/đỡ ${g.blocks} (${g.perfects} PERFECT) · bẻ gãy ${g.breaks} · chuỗi ${g.bestCombo}`;
  $('over-score').textContent = g.score; $('over-detail').textContent = detail; $('over-best').textContent = record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`;
  $('over-hands').textContent = app.input === 'camera' ? 'hoặc giơ 2 tay 1.5 giây để chơi lại' : '';
  ui.panel = { title, color: '#ff7b2c', lines: [detail, record ? '🏆 Kỷ lục mới!' : `Kỷ lục: ${best}`, app.input === 'camera' ? '🙌 Giơ 2 tay 1.5 giây để chơi lại' : 'Enter / bấm Chơi lại'] };
  const runs = store.get('runs', []); runs.push({ at: Date.now(), game: 'dino', score: g.score, kills: g.kills, hits: g.hits, blocks: g.blocks, hurt: g.hurt, input: app.input, output: settings.output, lagMs: lagMs() }); store.set('runs', runs.slice(-30));
  setTimeout(() => { if (app.mode === 'over') show('scr-over'); }, 900);
  app.handsSince = 0;
}
// ---------------- Game "Vũ hội công chúa" (kiểu Audition) ----------------
const DIFF_NAME = { kid: '👶 Bé', easy: 'Dễ', normal: 'Vừa', hard: 'Khó' };
const CAM_LAT = 0.06; // camera → khung nhận diện ≈ 60 ms (trừ đi khi chấm thời điểm vỗ tay)
/** Chuẩn bị bài đang chọn (bài có sẵn phải "tổng hợp" trước ~1 s). */
async function ensureSong() {
  const id = settings.danceSong || BUILTIN[0].id;
  if (app.song?.id === id && app.song.buffer) { setDanceStatus(songInfo(app.song)); return app.song; }
  app.songCache ||= {};
  if (!app.songCache[id]) { // mỗi bài chỉ chuẩn bị 1 lần; đổi bài liên tục không bị "đè" kết quả
    const def = BUILTIN.find(b => b.id === id);
    setDanceStatus('🎵 Đang chuẩn bị nhạc…');
    app.songCache[id] = (async () => {
      if (def) return renderBuiltin(def);
      const rec = (await listSavedSongs()).find(x => x.id === id);
      if (!rec) throw new Error('không thấy bài');
      return loadSavedSong(rec);
    })().catch(e => { console.error(e); delete app.songCache[id]; setDanceStatus('⚠ Không mở được bài này — chọn bài khác'); return null; });
  }
  const song = await app.songCache[id];
  if ((settings.danceSong || BUILTIN[0].id) !== id) return ensureSong(); // người chơi đã đổi bài khác trong lúc chờ
  if (!song) { settings.danceSong = BUILTIN[0].id; return ensureSong(); }
  app.song = song; setDanceStatus(songInfo(song));
  return song;
}
const songInfo = s => s ? `${s.name} · ${Math.round(s.bpm)} BPM · ${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}${s.builtin ? '' : s.confidence > 0.35 ? ' · nhịp rõ ✅' : ' · nhịp chưa chắc — nên chọn bài có trống rõ'}` : '';
function setDanceStatus(t) { const el = $('dance-status'); if (el) el.textContent = t; }
function newDance() {
  if (!app.song?.buffer || app.song.id !== (settings.danceSong || BUILTIN[0].id)) { // nhạc chưa sẵn sàng → chuẩn bị xong tự bắt đầu
    ui.panel = { title: '🎵 Đang chuẩn bị nhạc…', lines: ['Chờ một chút nhé'] };
    if (!app.pendingDance) { app.pendingDance = true; ensureSong().then(() => { app.pendingDance = false; ui.panel = null; if (isDance()) startCountdown(); }); }
    return false;
  }
  const chart = buildChart(app.song, { difficulty: settings.danceDiff || 'normal', seed: (Math.random() * 2 ** 31) | 0 });
  app.dance = new DanceGame({ chart, lagMs: danceLag() });
  const kid = settings.danceDiff === 'kid';
  app.practice = wantPractice() ? new DancePractice(kid ? { beat: chart.beat, offset: app.song.offset || 0, steps: KID_PRACTICE_STEPS, cfg: { holdSec: 0.4, giveUpSec: 14, clapN: 4 } } : { beat: chart.beat, offset: app.song.offset || 0 }) : null;
  app.kidSaid = -1;
  app.skipPractice = false; app.dpd.reset();
  app.music.load(app.song); app.claps = []; app.lastJudge = null; app.rated = false; app.slotD = {};
  ui.dance = danceUi(); ui.hud = null; ui.tiles = null; ui.fruit = null; ui.dino = null;
  return true;
}
/** Độ trễ khi chấm vỗ tay: đo được ở màn Tập (camera + loa + phản xạ) thì dùng, chưa đo thì dùng độ trễ màn hình. */
function danceLag() { return settings.danceClapLag != null && app.input === 'camera' ? settings.danceClapLag : lagMs(); }
function wantPractice() { return !app.skipPractice && ($('dance-practice')?.checked ?? !settings.dancePracticeDone); }
function danceUi() {
  const g = app.dance, s = app.song;
  return { song: s.name, bpm: g.chart.bpm, diff: DIFF_NAME[settings.danceDiff || 'normal'], progress: app.music.time() / s.duration, score: g.score, combo: g.combo, fever: g.fever, feverOn: g.feverLeft > 0, padRight: !tvOut() };
}
/** Động tác hiện tại từ khung xương (toạ độ MÀN HÌNH — đã lật gương nên "trái" là trái của màn hình người chơi thấy). Xem js/dancepose.js. */
function dancePose(now) {
  if (app.input !== 'camera') return app.manual.dpose && now - app.manual.dposeAt < 350 ? app.manual.dpose : null;
  if (!app.pts || !motion.state.present) { app.dpd.reset(); return null; }
  return app.dpd.update(app.pts, motion.state.ducking, now);
}
/** Vỗ tay từ điểm CHƯA làm mượt (đỡ trễ); bắt cả cú vỗ nhanh lọt giữa 2 khung hình. */
function detectClap(ts) {
  const hit = app.rawScr ? app.dpd.clap(app.rawScr, ts) : null;
  if (hit != null) app.claps.push(hit - CAM_LAT * 1000);
}
/** Công chúa 3D: nạp muộn khi chọn game Vũ hội (~12 MB, lần sau lấy từ bộ nhớ đệm). */
function loadPrincesses() {
  if (app.p3d.loading || settings.princess3d === false) return;
  setDanceStatus2('👗 Đang tải 3 nàng công chúa 3D…');
  app.p3d.load((k, n) => setDanceStatus2(`👗 Đang tải công chúa 3D ${k}/${n}…`)).then(ok => setDanceStatus2(ok ? '👗 Công chúa 3D sẵn sàng' : '👗 Máy không hiển thị được 3D — dùng hình vẽ 2D'));
}
function setDanceStatus2(t) { const el = $('dance-status2'); if (el) el.textContent = t; }
function danceView(now) {
  const g = app.dance, t = app.music.time();
  let person = null, skel = null;
  if (app.input === 'camera' && app.raw && motion.state.present) {
    const pl = fruitPlace(app.raw, now, app.slotD || (app.slotD = {}), 0.5, 0.5, 0.8);
    const it = pl ? app.cutouts.items[app.mainIdx] : null;
    if (it) person = { it, anchorF: pl.anchorF, anchorD: pl.anchorD, s: pl.s };
    else if (pl) skel = app.raw.map(q => { const d = pl.toD(q.x * pl.fw, q.y * pl.fh); return { x: d.x, y: d.y, v: q.v }; });
  }
  return { t, person, skel, pose: app.curPose, lastJudge: app.lastJudge, clapAt: app.clapFx };
}
function danceCountdownFrame(now, dt) {
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount && left > 0) { app.lastCount = left; big(String(left)); sfx.tick(); }
  app.curPose = dancePose(now);
  renderer.danceScene(dt, now / 1000, app.dance, danceView(now));
  if (now >= app.countEnd) { if (app.practice) { big('TẬP NHÉ! 🎓'); app.practice.update(now / 1000, null, [], 0); } else { big('NHẢY NÀO! 💃'); app.music.play(0); } app.claps = []; setMode('dance'); }
}
function danceFrame(now, dt) {
  if (app.practice) return practiceFrame(now, dt);
  const g = app.dance, t = app.music.time();
  app.curPose = dancePose(now);
  const claps = app.claps.map(pms => app.music.timeAtPerf(pms)); if (app.claps.length) app.clapFx = now / 1000;
  app.claps = [];
  g.update(t, app.curPose, claps);
  const kid = !!g.chart.kid, u = g.turn;
  if (kid && u && u.kind !== 'break' && !u._bop && t >= u.finishAt - 0.03 && u.idx >= u.n) { u._bop = true; sfx.bop(); } // "bốp": vỗ tay theo tiếng này
  for (const ev of g.drain()) {
    if (kid && ev.kind === 'turn') { // bé chưa đọc được chữ → đọc to động tác
      const tu = ev.turn;
      if (tu.kind === 'break') say('Nghỉ một chút, nhún nhún theo nhạc nào!');
      else say(tu.kind === 'finish' ? 'Động tác cuối! ' + KID_POSES.UP.say : tu.seq.map(p => KID_POSES[p].say).join(' Rồi '));
    }
    if (kid && ev.kind === 'step' && ev.complete) say('Vỗ tay khi nghe tiếng bốp nhé!', { urgent: false });
    if (kid && ev.kind === 'judge') say(KID_GRADE[ev.grade].replace('!', ''), { urgent: true, rate: 1.1 });
    if (ev.kind === 'step') sfx.ok();
    else if (ev.kind === 'judge') {
      app.lastJudge = { grade: ev.grade, at: now / 1000, chain: ev.chain, incomplete: ev.incomplete };
      if (ev.grade === 'PERFECT') { sfx.star(); renderer.burst(renderer.W / 2, renderer.H * 0.35, '#ffd84a', 30); }
      else if (ev.grade === 'GREAT' || ev.grade === 'COOL') { sfx.coin(); if (kid) renderer.burst(renderer.W / 2, renderer.H * 0.35, '#7dffb0', 18); } else if (!kid) sfx.hit?.();
      if (ev.finish && ev.grade !== 'MISS') { big('✨ FINISH! ✨'); renderer.burst(renderer.W / 2, renderer.H * 0.5, '#ff7eb6', 60); }
    } else if (ev.kind === 'fever') { big('FEVER! 🔥'); sfx.star(); }
    else if (ev.kind === 'turn' && ev.turn.kind === 'break') sfx.cue_hands?.();
  }
  ui.dance = danceUi();
  renderer.danceScene(dt, now / 1000, g, danceView(now));
  if (g.over || (!app.music.playing && t > 1 && t >= app.song.duration - 0.5)) danceOver();
}
const PRACTICE_TIP = {
  L: ['Dang thẳng tay bên TRÁI màn hình ra ngang vai', 'Duỗi thẳng khuỷu, tay ngang vai; tay kia buông xuôi'],
  R: ['Dang thẳng tay bên PHẢI màn hình ra ngang vai', 'Duỗi thẳng khuỷu, tay ngang vai; tay kia buông xuôi'],
  UL: ['Giơ tay bên TRÁI màn hình lên cao', 'Tay giơ cao hơn đầu (chếch cũng được); tay kia buông xuôi'],
  UR: ['Giơ tay bên PHẢI màn hình lên cao', 'Tay giơ cao hơn đầu (chếch cũng được); tay kia buông xuôi'],
  UP: ['Giơ CẢ 2 tay lên cao', 'Hai tay cao hơn đầu; lùi ra xa nếu tay bị ra khỏi khung hình'],
  T: ['Dang CẢ 2 tay ra ngang vai', 'Hai tay duỗi thẳng sang 2 bên như chữ T'],
  DN: ['NGỒI xuống (khuỵu gối)', 'Hạ người xuống rõ ràng ~1 gang tay rồi giữ; đứng lên khi có dấu ✓'],
  SPIN: ['XOAY 1 vòng tại chỗ', 'Xoay đủ 1 vòng (quay lưng hẳn lại camera) rồi nhìn lại màn hình, trong 4 giây'],
  CLAP: ['VỖ TAY theo nhạc mỗi khi hạt chạm chấm vàng', 'Vỗ trước ngực, 2 bàn tay chạm hẳn vào nhau'],
};
const KID_TIP = {
  UP: ['⬆ Giơ tay lên thật cao!', 'Bố mẹ làm mẫu cùng bé nhé — 1 tay hay 2 tay đều được'],
  L: ['⬅ Dang tay trái ra!', 'Tay bên trái màn hình — như soi gương, tay trái của bé hiện bên trái'],
  R: ['➡ Dang tay phải ra!', 'Tay bên phải màn hình — như soi gương'],
  T: ['↔ Dang hai tay ra!', 'Dang 1 tay hay 2 tay đều được, tay ngang vai'],
  DN: ['⬇ Ngồi xuống!', 'Khuỵu gối hạ người xuống rồi giữ một chút'],
  SPIN: ['⟳ Xoay một vòng nào!', 'Xoay chậm tại chỗ cho hết 1 vòng rồi nhìn lại màn hình — bố mẹ cầm tay bé xoay cùng nhé'],
  CLAP: ['👏 Vỗ tay khi nghe tiếng "bốp"!', 'Vỗ tay trước ngực'],
};
function practiceFrame(now, dt) {
  const pr = app.practice, g = app.dance, kid = !!g.chart.kid;
  if (kid && app.kidSaid !== pr.i && !pr.done) { app.kidSaid = pr.i; say((KID_TIP[pr.step] || KID_TIP.CLAP)[0].replace(/^\S+ /, '')); }
  if (kid && pr.step === 'CLAP' && !pr.done) { const T = pr.clapTargets(), mt0 = app.music.time(); for (const x of T) if (!pr['b' + x] && mt0 >= x - 0.03) { pr['b' + x] = 1; sfx.bop(); } }
  app.curPose = dancePose(now);
  if (pr.step === 'CLAP' && !app.music.playing && !pr.done) app.music.play(0);
  const mt = app.music.time();
  const claps = app.claps.map(pms => app.music.timeAtPerf(pms)); if (app.claps.length) app.clapFx = now / 1000;
  app.claps = [];
  pr.update(now / 1000, kid && pr.step !== 'CLAP' && kidMatch(pr.step, app.curPose) ? pr.step : app.curPose, claps, mt);
  for (const ev of pr.drain()) {
    if (ev.kind === 'step') { if (ev.ok) { sfx.star(); renderer.burst(renderer.W / 2, renderer.H * 0.4, '#7dffb0', 24); } else sfx.tick(); }
    else if (ev.kind === 'clap') { sfx.ok(); app.lastPracClap = { d: ev.delta, at: now / 1000 }; }
    else if (ev.kind === 'done') {
      app.music.stop();
      if (ev.lag != null && app.input === 'camera' && !kid) settings.danceClapLag = Math.round(Math.max(-150, Math.min(450, ev.lag * 1000)));
      settings.dancePracticeDone = true; saveSettings(); if ($('dance-practice')) $('dance-practice').checked = false;
      const lagTxt = ev.lag == null ? 'chưa đo được độ trễ vỗ tay (vỗ chưa đủ 4 lần) — dùng giá trị cũ' : `độ trễ vỗ tay ${Math.round(ev.lag * 1000)} ms → đã bù khi chấm`;
      app.pracDone = { at: now, text: kid ? '🎉 Bé tập xong rồi! Giờ nhảy cùng công chúa nhé!' : `Xong! Làm được ${ev.ok}/${pr.steps.length} bước · ${lagTxt}` };
      if (kid) say('Bé tập xong rồi! Giờ mình nhảy cùng các công chúa nhé!');
      big('🎉 XONG PHẦN TẬP!');
    }
  }
  const tip = (kid ? KID_TIP : PRACTICE_TIP)[pr.step] || PRACTICE_TIP.CLAP;
  renderer.danceScene(dt, now / 1000, g, { ...danceView(now), practice: { pr, tip, mt, kid, seen: app.curPose, dbg: app.input === 'camera' ? app.dpd.dbg : null, lastClap: app.lastPracClap, done: app.pracDone } });
  if (app.pracDone && now - app.pracDone.at > 3200) { // vào bài nhảy thật
    app.pracDone = null; app.practice = null; app.skipPractice = true;
    if (newDance()) { app.countEnd = performance.now() + 3000; app.lastCount = 0; setMode('countdown'); }
  }
}
function danceOver() {
  const g = app.dance;
  app.music.stop(); setMode('over'); releaseWakeLock(); sfx.over();
  const key = 'bestDance:' + app.song.id; let best = store.get(key, 0); const record = g.score > best && g.score > 0; best = Math.max(best, g.score); store.set(key, best);
  const C = g.counts, kid = !!g.chart.kid;
  const title = kid ? `${'⭐'.repeat(g.stars)} Bé nhảy giỏi quá!` : `Hạng ${g.rank} · ${g.score} điểm`;
  const detail = kid ? `Làm được ${C.PERFECT + C.GREAT + C.COOL} động tác · vỗ tay đúng nhịp ${C.PERFECT} lần` : `PERFECT ${C.PERFECT} · GREAT ${C.GREAT} · COOL ${C.COOL} · BAD ${C.BAD} · MISS ${C.MISS} · combo ${g.maxCombo}`;
  if (kid) say(g.stars >= 3 ? 'Ba ngôi sao! Bé nhảy giỏi quá!' : g.stars === 2 ? 'Hai ngôi sao! Giỏi lắm!' : 'Một ngôi sao! Lần sau mình nhảy tiếp nhé!');
  $('over-score').textContent = g.score; $('over-detail').textContent = `${app.song.name} — ${detail}`; $('over-best').textContent = record ? '🏆 Kỷ lục mới cho bài này!' : `Kỷ lục bài này: ${best}`;
  $('over-hands').textContent = app.input === 'camera' ? 'hoặc giơ 2 tay 1.5 giây để nhảy lại' : '';
  ui.panel = { title, color: '#ff7eb6', lines: [detail, record ? '🏆 Kỷ lục mới!' : `Kỷ lục bài này: ${best}`, app.input === 'camera' ? '🙌 Giơ 2 tay 1.5 giây để nhảy lại' : 'Enter / bấm Chơi lại'] };
  const runs = store.get('runs', []); runs.push({ at: Date.now(), game: 'dance', song: app.song.name, bpm: app.song.bpm, score: g.score, rank: g.rank, counts: C, input: app.input, output: settings.output, lagMs: lagMs() }); store.set('runs', runs.slice(-30));
  setTimeout(() => { if (app.mode === 'over') show('scr-over'); }, 900);
  app.handsSince = 0;
}
/** Menu: danh sách bài (có sẵn + nhạc đã chọn trước đó), nút chọn nhạc trong máy, độ khó. */
async function renderSongList() {
  const sel = $('dance-song'); if (!sel) return;
  const saved = await listSavedSongs();
  sel.innerHTML = '';
  for (const b of BUILTIN) sel.add(new Option(`${b.name} (${b.bpm} BPM)`, b.id));
  for (const r of saved) sel.add(new Option(`🎧 ${r.name} (${Math.round(r.bpm)} BPM)`, r.id));
  sel.value = settings.danceSong || BUILTIN[0].id;
  if (!sel.value) sel.value = BUILTIN[0].id;
  $('dance-diff').value = settings.danceDiff || 'normal';
}
function bindDanceMenu() {
  if (!$('dance-song')) return;
  $('dance-song').onchange = e => { settings.danceSong = e.target.value; saveSettings(); unlockAudio(); ensureSong(); };
  $('dance-diff').onchange = e => { settings.danceDiff = e.target.value; saveSettings(); };
  $('dance-practice').checked = !settings.dancePracticeDone;
  $('btn-dance-import').onclick = () => { unlockAudio(); $('dance-file').click(); };
  $('dance-file').onchange = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const song = await loadUserFile(f, setDanceStatus);
      app.song = song; app.songCache ||= {}; app.songCache[song.id] = Promise.resolve(song); settings.danceSong = song.id; saveSettings();
      await new Promise(r => setTimeout(r, 300)); await renderSongList(); $('dance-song').value = song.id;
      setDanceStatus(songInfo(song));
    } catch (err) { console.error(err); setDanceStatus('⚠ Không đọc được file này (hãy chọn MP3 / M4A / WAV)'); }
    e.target.value = '';
  };
  renderSongList();
}
// chạm / kéo chuột để chém (chế độ không camera)
const toCanvas = e => { const r = renderer.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * renderer.W / r.width, y: (e.clientY - r.top) * renderer.H / r.height }; };
$('stage').addEventListener('pointerdown', e => { if (isDance() && app.input === 'manual' && app.mode === 'dance') app.claps.push(performance.now()); if (isFruit() || isDino()) app.ptr = { ...toCanvas(e), down: true }; });
$('stage').addEventListener('pointermove', e => { if ((isFruit() || isDino()) && app.ptr?.down) Object.assign(app.ptr, toCanvas(e)); });
window.addEventListener('pointerup', () => { if (app.ptr) app.ptr.down = false; });

// ---------------- Chọn game ở menu ----------------
const GAME_DESC = {
  runner: 'Bước né tường, nhảy qua hố lửa, ngồi tránh laser, giơ tay hái sao. 1 người.',
  tiles: 'Sàn nhà thành lưới ô. Hết giờ phải đứng trên Ô XANH — ô đỏ là hố lửa! Ô đổi ngẫu nhiên mỗi vòng. 1–4 người, người trụ lại cuối cùng thắng.',
  dance: 'Nhảy cùng 3 nàng công chúa kiểu Audition: làm lần lượt dãy động tác (dang tay, giơ tay, ngồi) rồi VỖ TAY đúng nhịp ở vạch vàng. Chọn nhạc có sẵn hoặc nhạc trong máy bạn — game tự nghe nhịp. 1 người.',
  dino: '16 loài khủng long qua 4 màn lao tới nhìn thẳng vào bạn! Đánh điểm yếu; màn hình tô màu báo việc phải làm: ĐỎ né · VÀNG nhảy · TÍM ngồi · XANH giơ 2 tay · TRẮNG đập đá. Có combo, giả đòn, bầy đàn, trùm. 1 người.',
  fruit: 'Vung 2 tay chém trái cây rơi từ trên xuống, né bom. Đưa tay cao hơn đầu một chút là lưỡi chém đã chạm đỉnh màn hình — không cần với cao. 75 giây, 1–2 người (2 người đứng vào khung = đối kháng).',
};
function renderGameSel() {
  $('g-runner').classList.toggle('on', settings.game === 'runner'); $('g-runner').setAttribute('aria-checked', settings.game === 'runner');
  $('g-tiles').classList.toggle('on', settings.game === 'tiles'); $('g-tiles').setAttribute('aria-checked', settings.game === 'tiles');
  $('g-fruit').classList.toggle('on', settings.game === 'fruit'); $('g-fruit').setAttribute('aria-checked', settings.game === 'fruit');
  $('g-dino').classList.toggle('on', settings.game === 'dino'); $('g-dino').setAttribute('aria-checked', settings.game === 'dino');
  $('g-dance').classList.toggle('on', settings.game === 'dance'); $('g-dance').setAttribute('aria-checked', settings.game === 'dance');
  $('dance-opts').hidden = settings.game !== 'dance';
  $('game-desc').textContent = GAME_DESC[settings.game];
}
$('g-runner').onclick = () => { settings.game = 'runner'; saveSettings(); renderGameSel(); };
$('g-tiles').onclick = () => { settings.game = 'tiles'; saveSettings(); renderGameSel(); };
$('g-fruit').onclick = () => { settings.game = 'fruit'; saveSettings(); renderGameSel(); };
$('g-dino').onclick = () => { settings.game = 'dino'; saveSettings(); renderGameSel(); };
$('g-dance').onclick = () => { settings.game = 'dance'; saveSettings(); renderGameSel(); unlockAudio(); ensureSong(); loadPrincesses(); };
bindDanceMenu();
renderer.p3d = app.p3d; renderer.p3dQ = 0.75;
if (settings.game === 'dance') setTimeout(() => { ensureSong().catch(() => {}); loadPrincesses(); }, 500); // nạp sẵn bài đang chọn + công chúa 3D
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
  app.pose?.setSegmentation(segOn()); app.ps = null;
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
    `${s.airborne ? 'AIR ' : ''}${s.ducking ? 'DUCK ' : ''}${s.handsUp ? 'HANDS ' : ''}${s.coasting ? 'COAST ' : ''}${motion.mode} dist ${s.distance.hint} hips ${s.hipsSeen ? 'y' : 'n'} lost10s ${app.lostEvents.length} rej ${app.rejN || 0}${app.rejAt && performance.now() - app.rejAt < 1500 ? ' (' + app.rejLast + ')' : ''}`,
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
    case 'dino': dinoFrame(now, dt); break;
    case 'dance': danceFrame(now, dt); break;
    case 'paused':
      if (isFruit() && app.fg) renderer.fruitScene(0, now / 1000, app.fg, fruitView(now, false));
      else if (isDino() && app.dg) renderer.dinoScene(0, now / 1000, app.dg, dinoView(now, false));
      else if (isDance() && app.dance) renderer.danceScene(0, now / 1000, app.dance, danceView(now));
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
