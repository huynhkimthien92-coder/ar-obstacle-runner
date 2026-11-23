// Nhạc cho "Vũ hội công chúa":
//  • 2 bài có sẵn TỔNG HỢP bằng WebAudio (không file, không bản quyền) — biết chính xác BPM & phách.
//  • Nhạc người dùng tự chọn trong máy (MP3/M4A/WAV/OGG…) → giải mã → nhận nhịp (beat.js) → lưu vào IndexedDB để lần sau chọn lại.
//  • Phát qua cùng AudioContext với hiệu ứng → khi chơi TV qua Wi-Fi, nhạc đi theo stream sang TV.
import { audioCtx, audioOut } from './audio.js';
import { analyzeBeats, toMono } from './beat.js';
import { rng } from './game.js';

export const BUILTIN = [
  { id: 'castle', name: '🏰 Vũ hội lâu đài', bpm: 112, key: 0, minor: false, prog: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], form: ['i', 'a', 'b', 'a', 'b', 'o'], seed: 11 },
  { id: 'stars', name: '🌠 Đêm sao băng', bpm: 124, key: 9, minor: true, prog: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], form: ['i', 'a', 'b', 'b', 'a', 'b', 'o'], seed: 23 },
];
const SEC_BARS = { i: 4, a: 8, b: 8, o: 4 };

/**
 * Tổng hợp bài có sẵn THẲNG vào mảng mẫu (nhanh, ~0,2 s cho 90 s nhạc; không cần OfflineAudioContext).
 * Thuần JS → test được bằng Node. Trả về { data: Float32Array (mono), sr, duration, bpm, offset, energy }.
 */
export function synthSong(def, sr = 22050) {
  const beat = 60 / def.bpm, bars = def.form.reduce((s, k) => s + SEC_BARS[k], 0), dur = bars * 4 * beat + 2;
  const N = Math.ceil(sr * dur), out = new Float32Array(N);
  const R = rng(def.seed), root = 48 + def.key, TAU = Math.PI * 2;
  const midi = m => 440 * Math.pow(2, (m - 69) / 12);
  let nz = 12345; const noise = () => ((nz = (nz * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;
  const add = (t, len, f) => { const i0 = Math.floor(t * sr), n = Math.min(N - i0, Math.floor(len * sr)); for (let i = 0; i < n; i++) out[i0 + i] += f(i / sr, i); };
  const wave = (type, ph) => type === 'sine' ? Math.sin(ph) : type === 'tri' ? 2 / Math.PI * Math.asin(Math.sin(ph)) : type === 'saw' ? ((ph / TAU) % 1) * 2 - 1 : Math.sin(ph) > 0 ? 0.6 : -0.6;
  const note = (t, m, len, type, v, att = 0.01, cut = 0.25) => { // cut: hệ số lọc thông thấp 1 cực (0..1)
    const w = TAU * midi(m) / sr; let lp = 0;
    add(t, len + 0.05, (tt, i) => { const e = tt < att ? tt / att : Math.exp(-(tt - att) * 4 / len); lp += cut * (wave(type, w * i) - lp); return lp * e * v; });
  };
  const kick = t => { let ph = 0; add(t, 0.3, tt => { ph += TAU * (45 + 105 * Math.exp(-tt * 30)) / sr; return Math.sin(ph) * Math.exp(-tt * 9) * 0.9; }); };
  const snare = t => { let p = 0; add(t, 0.2, tt => { const x = noise(); const h = x - p; p = x; return (h * 0.5 + Math.sin(TAU * 190 * tt) * 0.3) * Math.exp(-tt * 22) * 0.5; }); };
  const hat = (t, v) => { let p = 0; add(t, 0.05, tt => { const x = noise(); const h = x - p; p = x; return h * Math.exp(-tt * 90) * v; }); };
  const scale = def.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];           // ngũ cung: luôn hợp âm
  const chord = ([deg, q]) => [deg, deg + (q === 'm' ? 3 : 4), deg + 7];
  const motif = Array.from({ length: 16 }, () => (R() < 0.7 ? scale[Math.floor(R() * 5)] + 12 * (R() < 0.3 ? 1 : 0) : null));
  let bar = 0;
  for (const sec of def.form) {
    for (let b = 0; b < SEC_BARS[sec]; b++, bar++) {
      const t0 = 1 + bar * 4 * beat, P = def.prog[bar % 4], deg = P[0], ch = chord(P);
      for (const x of ch) note(t0, root + 12 + x, 4 * beat * 0.95, 'tri', sec === 'b' ? 0.05 : 0.07, 0.15, 0.12); // pad hợp âm
      for (let k = 0; k < 8; k++) {
        const t = t0 + k * beat / 2;
        if (sec !== 'i' && sec !== 'o') {
          if (k % 2 === 0 && (def.minor || k % 4 === 0 || (k === 6 && R() < 0.4))) kick(t); // 4-on-floor (bài 2) / phách 1-3 (bài 1)
          if (k === 2 || k === 6) snare(t);
          hat(t, k % 2 ? 0.16 : 0.08);
          note(t, root - 12 + (deg % 12) + (k % 2 && R() < 0.3 ? 12 : 0), beat * 0.45, 'saw', 0.12, 0.005, 0.08); // bass
        }
        if (k % 2 === 0 || sec === 'b') { const m = root + 24 + ch[(k + bar) % 3]; const v = sec === 'i' || sec === 'o' ? 0.06 : 0.04; note(t, m, 0.45, 'sine', v, 0.003, 0.9); note(t, m + 12, 0.22, 'sine', v * 0.35, 0.003, 0.9); } // chuông
        const mm = motif[(k + (bar % 2) * 8) % 16];
        if (sec === 'b' && mm != null) note(t, root + 24 + mm, beat * 0.4, 'sq', 0.045, 0.005, 0.35); // giai điệu điệp khúc
      }
    }
  }
  for (let i = 0; i < N; i++) out[i] = Math.tanh(out[i] * 1.3) * 0.8; // nén mềm
  const energy = new Float32Array(bars * 4);
  let bi = 0; for (const sec of def.form) for (let b = 0; b < SEC_BARS[sec] * 4; b++) energy[bi++] = { i: 0.15, a: 0.55, b: 0.95, o: 0.2 }[sec];
  return { data: out, sr, duration: dur, bpm: def.bpm, offset: 1, energy };
}
/** Bài có sẵn → AudioBuffer phát được. */
export async function renderBuiltin(def) {
  const ac = audioCtx(), S = synthSong(def);
  const buffer = ac.createBuffer(1, S.data.length, S.sr); buffer.copyToChannel ? buffer.copyToChannel(S.data, 0) : buffer.getChannelData(0).set(S.data);
  return { id: def.id, name: def.name, buffer, bpm: def.bpm, offset: S.offset, downbeat: 0, duration: buffer.duration, energy: S.energy, builtin: true };
}

/** Giải mã file nhạc người dùng + nhận nhịp. */
export async function loadUserFile(file, onStatus = () => {}) {
  const ac = audioCtx();
  onStatus('Đang đọc nhạc…');
  const ab = await file.arrayBuffer();
  const buffer = await new Promise((res, rej) => { const p = ac.decodeAudioData(ab, res, rej); if (p?.then) p.then(res, rej); });
  onStatus('Đang nghe nhịp…');
  await new Promise(r => setTimeout(r, 30));
  const chans = []; for (let i = 0; i < Math.min(2, buffer.numberOfChannels); i++) chans.push(buffer.getChannelData(i));
  const step = buffer.sampleRate > 30000 ? 2 : 1;
  const a = analyzeBeats(toMono(chans, step), buffer.sampleRate / step);
  const song = { id: 'u' + Date.now(), name: file.name.replace(/\.[^.]+$/, ''), buffer, bpm: a.bpm, offset: a.offset, downbeat: a.downbeat, confidence: a.confidence, duration: buffer.duration, energy: a.energy };
  saveSong(file, song).catch(() => {});
  return song;
}

// ---------- IndexedDB: lưu nhạc đã chọn (tối đa 6 bài) ----------
const DB = 'aor-music', ST = 'songs';
function db() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function saveSong(file, s) {
  const d = await db(), tx = d.transaction(ST, 'readwrite'), os = tx.objectStore(ST);
  os.put({ id: s.id, name: s.name, blob: file, bpm: s.bpm, offset: s.offset, downbeat: s.downbeat, confidence: s.confidence, energy: Array.from(s.energy), duration: s.duration, added: Date.now() });
  const all = await new Promise(r => { const q = os.getAll(); q.onsuccess = () => r(q.result); });
  all.sort((a, b) => b.added - a.added).slice(6).forEach(x => os.delete(x.id));
  return new Promise(r => { tx.oncomplete = r; });
}
export async function listSavedSongs() {
  try { const d = await db(); return await new Promise(r => { const q = d.transaction(ST).objectStore(ST).getAll(); q.onsuccess = () => r(q.result.sort((a, b) => b.added - a.added)); q.onerror = () => r([]); }); } catch { return []; }
}
export async function loadSavedSong(rec) {
  const ac = audioCtx(), ab = await rec.blob.arrayBuffer();
  const buffer = await new Promise((res, rej) => { const p = ac.decodeAudioData(ab, res, rej); if (p?.then) p.then(res, rej); });
  return { ...rec, buffer, energy: Float32Array.from(rec.energy || []) };
}
export async function deleteSavedSong(id) { const d = await db(); d.transaction(ST, 'readwrite').objectStore(ST).delete(id); }

/** Trình phát: biết "thời gian bài hát" chính xác theo đồng hồ âm thanh (đã trừ độ trễ loa). */
export class MusicPlayer {
  constructor() { this.src = null; this.startedAt = 0; this.pos = 0; this.playing = false; this.song = null; this.gain = null; }
  load(song) { this.stop(); this.song = song; this.pos = 0; }
  play(from = this.pos) {
    const ac = audioCtx(); if (!ac || !this.song) return;
    this.stop(true);
    const src = ac.createBufferSource(); src.buffer = this.song.buffer;
    this.gain = this.gain || ac.createGain(); this.gain.gain.value = 0.9;
    try { this.gain.disconnect(); } catch { /* chưa nối */ }
    this.gain.connect(audioOut());
    src.connect(this.gain);
    src.start(ac.currentTime + 0.05, Math.max(0, from));
    this.src = src; this.startedAt = ac.currentTime + 0.05 - from; this.playing = true;
    src.onended = () => { if (this.src === src) this.playing = false; };
  }
  pause() { if (!this.playing) return; this.pos = this.time(); this.stop(true); }
  stop(keep = false) { if (this.src) { try { this.src.onended = null; this.src.stop(); } catch { /* đã dừng */ } } this.src = null; this.playing = false; if (!keep) this.pos = 0; }
  /** thời gian bài (giây) mà người chơi đang NGHE (trừ độ trễ đầu ra) */
  time() {
    const ac = audioCtx(); if (!ac) return 0;
    if (!this.playing) return this.pos;
    const lat = (ac.outputLatency || 0) + (ac.baseLatency || 0);
    return ac.currentTime - this.startedAt - lat;
  }
  /** đổi mốc performance.now() (ms) sang thời gian bài — để chấm vỗ tay theo thời điểm thật của khung hình */
  timeAtPerf(pms) { return this.time() - (performance.now() - pms) / 1000; }
}
