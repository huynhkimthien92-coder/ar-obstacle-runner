// Âm thanh tổng hợp bằng WebAudio — không cần file asset, 0 KB tải về.
let ac = null, muted = false, streamDest = null, toStream = false;

// Chế độ màn hình phụ: tiếng đi theo stream sang TV thay vì loa điện thoại
const out = () => (toStream && streamDest ? streamDest : ac.destination);
export function audioStreamTrack() {
  unlockAudio();
  if (!ac?.createMediaStreamDestination) return null;
  streamDest = streamDest || ac.createMediaStreamDestination();
  toStream = true;
  return streamDest.stream.getAudioTracks()[0] || null;
}
export function audioToLocal() { toStream = false; }

export function unlockAudio() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
  } catch { ac = null; }
}
export function setMuted(m) { muted = m; }

function tone(freq, dur, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out()); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2) {
  if (!ac || muted) return;
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  src.buffer = buf; g.gain.value = vol; src.connect(f).connect(g).connect(out()); src.start();
}

export const sfx = {
  coin: () => { tone(988, 0.07, { vol: 0.08 }); tone(1319, 0.12, { vol: 0.08, delay: 0.06 }); },
  star: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.1, delay: i * 0.06 })),
  dodge: () => tone(660, 0.06, { type: 'triangle', vol: 0.06 }),
  hit: () => { noise(0.3, 0.3); tone(180, 0.3, { type: 'sawtooth', slide: -120, vol: 0.15 }); },
  fire: () => { noise(0.6, 0.35); tone(300, 0.5, { type: 'sawtooth', slide: -250, vol: 0.12 }); },
  tick: () => tone(880, 0.08, { type: 'sine', vol: 0.12 }),
  go: () => tone(1320, 0.25, { type: 'sine', vol: 0.14 }),
  over: () => [523, 392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.12, delay: i * 0.18 })),
  ok: () => tone(1046, 0.12, { type: 'sine', vol: 0.1 }),
};

export function buzz(ms) { try { navigator.vibrate?.(ms); } catch { /* iOS không hỗ trợ */ } }
