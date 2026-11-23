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

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('aor:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('aor:' + k, JSON.stringify(v)); } catch { /* chế độ riêng tư / sandbox */ } },
};

const DEFAULTS = { model: 'lite', facing: 'user', skeleton: true, sound: true, debug: false, sens: 1.0, tutorial: true, output: 'phone', bodyMode: 'auto', cueSound: true };
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
};
// Nội dung chữ vẽ lên canvas cho TV (HUD, gợi ý, đếm ngược, bảng thông báo)
const ui = { hud: null, hint: '', big: null, panel: null, corner: '', cornerColor: null, cue: null };

const tvOut = () => settings.output !== 'phone';
const lagMs = () => settings.lag[settings.output] ?? 0;
// Khung người: TV → toàn thân (đứng xa); màn hình điện thoại → nửa người (đứng gần để còn nhìn thấy màn hình)
const bodyMode = () => (settings.bodyMode === 'auto' ? (tvOut() ? 'full' : 'near') : settings.bodyMode);

// ---------------- UI helpers ----------------
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function setMode(m) { app.mode = m; ui.cue = null; if (m !== 'calib' && m !== 'lagtest' && m !== 'over') ui.panel = null; }
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
  renderer.opaque = out === 'wifi' || app.input !== 'camera'; // wifi: canvas tự chứa cả hình camera để stream
  renderer.video = out === 'wifi' && app.input === 'camera' ? video : null;
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
    video.classList.toggle('on', settings.output !== 'wifi'); // wifi: camera vẽ vào canvas
    video.classList.toggle('mirror', settings.facing === 'user');
    applyOutput();
    bench.watchVideo(video);
    if (!app.pose || app.pose.model !== settings.model) {
      app.pose?.close();
      app.pose = await new PoseEngine().init(settings.model, t => { $('loading-text').textContent = t; ui.panel = { title: t, lines: [] }; });
    }
    bench.info = { delegate: app.pose.delegate, model: app.pose.model, video: `${video.videoWidth}x${video.videoHeight}`, facing: settings.facing, output: settings.output };
    enterCalibration();
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
  motion.reset(); smoother.reset(); applySettings();
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
  const sm = smoother.apply(r.landmarks, now);
  app.raw = sm;
  app.pts = sm ? sm.map(app.mapper) : null;
  motion.update(app.pts, app.raw, renderer.W, renderer.H, now);
  const pr = motion.state.present;
  if (app.prevPresent && !pr) app.lostEvents.push(now);
  app.prevPresent = pr;
  app.lostEvents = app.lostEvents.filter(t => now - t < 10000);
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
  if (s.calibrated) {
    title = '🙌 Giơ 2 tay lên để bắt đầu'; color = '#7dffb0';
    sub = s.distance.hint === 'ok' ? (tvOut() ? 'Nhìn lên màn hình lớn và chơi' : 'Hoặc bấm "Bắt đầu"') : DT[s.distance.hint]?.[0] || '';
    if (s.handsUp) { app.handsSince ||= now; if (now - app.handsSince > 700) return beginPlay(); }
    else app.handsSince = 0;
  } else if (s.present && s.distance.hint !== 'ok' && motion.calibGate) title = 'Đứng yên…';
  const lines = [sub];
  if (s.distance.meters) lines.push(`Khoảng cách ước lượng: ~${s.distance.meters.toFixed(1)} m`);
  if (tvOut() && motion.videoPortrait) lines.push('📱↔ Xoay NGANG điện thoại để camera nhìn rộng hơn');
  if (app.lostEvents.length >= 3) lines.push('Hay mất dấu: bật thêm đèn, tránh đứng ngược sáng, mặc áo khác màu tường');
  $('calib-title').textContent = title; $('calib-sub').textContent = sub;
  $('calib-dist').textContent = lines.slice(1).join(' · ');
  $('btn-calib-start').disabled = !s.calibrated;
  ui.panel = { title, lines, color, top: true, progress: s.calibrated ? null : s.calibProgress || null };
  renderer.calibration(app.pts, s, now / 1000);
}

// ---------------- Đo độ trễ màn hình ----------------
const LAGCFG = { beats: 6, period: 1600, fall: 1000, lead: 1800 };
function needLagTest() { return tvOut() && !settings.lagMeasured[settings.output]; }
function beginPlay() { if (needLagTest()) startLagTest(startCountdown); else startCountdown(); }

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
  app.tutorialMarked = !tutorial; app.rated = false; app.lostFor = 0; app.wasLost = false;
  document.querySelectorAll('.fb').forEach(b => { b.disabled = false; });
}

function startCountdown() {
  if (!app.game || app.game.over || app.mode === 'calib' || app.mode === 'lagtest') newGame();
  if (app.input === 'camera') motion.beginCalibration(true); // hiệu chỉnh lại nhanh trong lúc đứng chờ
  motion.calibGate = true;
  show(null); $('hud').hidden = tvOut(); updateHUD(true);
  app.countEnd = performance.now() + 3000; app.lastCount = 0;
  setMode('countdown');
  requestWakeLock();
}

function countdownFrame(now, dt) {
  const left = Math.ceil((app.countEnd - now) / 1000);
  if (left !== app.lastCount) { app.lastCount = left; if (left > 0) { big(String(left)); sfx.tick(); } }
  if (now >= app.countEnd) { big('GO!'); sfx.go(); setMode('play'); }
  renderer.frame(dt, now / 1000, app.game, player(), viewOpts());
}

function player() { return app.input === 'camera' ? motion.state : app.manual; }
function viewOpts() {
  const cam = app.input === 'camera';
  return { pts: app.pts, skeleton: cam && settings.skeleton, avatar: !cam || !settings.skeleton, dim: cam ? 0.35 : 0.75 };
}

function playFrame(now, dt) {
  const g = app.game, p = player();
  if (app.input === 'camera') {
    app.lostFor = p.present ? 0 : app.lostFor + dt;
    if (app.lostFor > CONFIG.LOST_PAUSE_SEC) {
      app.wasLost = true; setHint('');
      ui.panel = { title: '👀 Không thấy bạn', lines: ['Quay lại khung hình để chơi tiếp'] };
      $('hint').textContent = '👀 Không thấy bạn — quay lại khung hình'; $('hint').classList.add('show');
      renderer.frame(0, now / 1000, g, p, viewOpts());
      return;
    }
    if (app.wasLost) { app.wasLost = false; ui.panel = null; app.countEnd = now + 3000; app.lastCount = 0; setMode('countdown'); return; }
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
  renderer.frame(dt, now / 1000, app.game, player(), viewOpts());
  if (app.input === 'camera' && motion.state.handsUp) {
    app.handsSince ||= now;
    if (ui.panel) ui.panel.progress = Math.min(1, (now - app.handsSince) / 1500);
    if (now - app.handsSince > 1500) { app.game = null; startCountdown(); }
  } else { app.handsSince = 0; if (ui.panel) ui.panel.progress = null; }
}

function pause(title = 'Tạm dừng') {
  if (app.mode !== 'play' && app.mode !== 'countdown') return;
  setMode('paused'); $('pause-title').textContent = title; show('scr-pause'); releaseWakeLock();
  ui.panel = { title: '⏸ ' + title, lines: ['Bấm "Tiếp tục" trên điện thoại'] };
}
async function resume() {
  if (!(await ensureCamera())) return;
  show(null); ui.panel = null; app.countEnd = performance.now() + 3000; app.lastCount = 0; setMode('countdown'); requestWakeLock();
}
function toMenu() {
  setMode('menu'); setHint(''); big(''); $('hud').hidden = true; releaseWakeLock();
  stopCamera(); video.classList.remove('on'); app.pts = null; app.game = null; ui.hud = null;
  ui.panel = link.live ? { title: 'AR Obstacle Runner', lines: ['Chọn chế độ chơi trên điện thoại'] } : null;
  renderer.clear(); show('scr-menu');
}

// ---------------- Manual (không camera) input ----------------
function manualAction(kind) {
  const m = app.manual, tm = app.manualTimers;
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
  app.input = 'manual'; app.manual.lane = 1; app.game = null;
  video.classList.remove('on');
  applySettings(); applyOutput();
  beginPlay();
}
window.addEventListener('keydown', e => {
  if (e.target?.tagName === 'INPUT') return;
  if (app.mode === 'over' && (e.key === 'Enter' || e.key === ' ')) { app.game = null; startCountdown(); return; }
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
    $('tv-status').textContent = '⚠ ' + (e?.message || e);
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
window.addEventListener('resize', () => { renderer.resize(); updateMapper(); });

// ---------------- Buttons ----------------
$('btn-tv').onclick = () => { $('tv-code').value = store.get('tvCode', ''); $('tv-status').textContent = ''; $('tv-display-url').textContent = new URL('display.html', location.href).href; $('dlg-tv').showModal(); };
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
  $('set-lag').value = lagMs(); $('set-lag-val').textContent = `${lagMs()} ms (${{ phone: 'điện thoại', tv: 'HDMI / phản chiếu', wifi: 'Wi-Fi' }[settings.output]})`;
  $('dlg-settings').showModal();
};
$('set-lag').oninput = () => { $('set-lag-val').textContent = `${$('set-lag').value} ms`; };
$('btn-relag').onclick = () => { settings.lagMeasured[settings.output] = false; saveSettings(); $('set-lag-val').textContent += ' · sẽ đo lại ở lượt sau'; };
$('dlg-settings').addEventListener('close', () => {
  Object.assign(settings, {
    model: $('set-model').value, sens: +$('set-sens').value, skeleton: $('set-skel').checked,
    sound: $('set-sound').checked, debug: $('set-debug').checked, tutorial: $('set-tut').checked,
    bodyMode: $('set-body').value, cueSound: $('set-cue').checked,
  });
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
$('btn-calib-start').onclick = () => { unlockAudio(); beginPlay(); };
$('btn-calib-lag').onclick = () => { unlockAudio(); startLagTest(startCountdown); };
$('btn-flip').onclick = async () => { settings.facing = settings.facing === 'user' ? 'environment' : 'user'; saveSettings(); await startCameraFlow(); };
$('btn-pause').onclick = () => pause();
$('btn-resume').onclick = resume;
$('btn-pause-menu').onclick = toMenu;
$('btn-again').onclick = () => { app.game = null; startCountdown(); };
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
    case 'lagtest': lagFrame(now); break;
    case 'countdown': countdownFrame(now, dt); break;
    case 'play': playFrame(now, dt); break;
    case 'over': overFrame(now, dt); break;
    case 'paused': if (app.game) renderer.frame(0, now / 1000, app.game, player(), viewOpts()); break;
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
window.__aor = { app, motion, bench, settings, startManual, manualAction, link, ui, TUTORIAL };
