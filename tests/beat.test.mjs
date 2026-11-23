// Kiểm thử nhận nhịp trên nhạc tổng hợp (kick + hi-hat + nhiễu)
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBeats } from '../js/beat.js';

function track({ bpm, offset = 0, sec = 30, sr = 22050, hats = true, noise = 0.02, swing = 0 }) {
  const d = new Float32Array(sec * sr), b = 60 / bpm;
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < d.length; i++) d[i] = rnd() * noise;
  const hit = (t, f, dur, amp) => { const i0 = Math.floor(t * sr); for (let i = 0; i < dur * sr && i0 + i < d.length; i++) { const tt = i / sr; d[i0 + i] += amp * Math.sin(2 * Math.PI * f * tt * (1 - tt * 2)) * Math.exp(-tt * 18); } };
  for (let k = 0; offset + k * b < sec; k++) {
    const t = offset + k * b;
    hit(t, 60, 0.25, k % 4 === 0 ? 0.9 : 0.6);                      // kick mỗi phách, phách 1 mạnh hơn
    if (hats) { const h = t + b / 2 + swing; const i0 = Math.floor(h * sr); for (let i = 0; i < 0.03 * sr && i0 + i < d.length; i++) d[i0 + i] += rnd() * 0.25 * Math.exp(-i / (0.006 * sr)); }
  }
  return d;
}

for (const [bpm, offset] of [[120, 0.3], [95, 0.12], [128, 0.47], [140, 0.05], [104, 0.25]]) {
  test(`nhận đúng ${bpm} BPM, phách đầu ${offset}s`, () => {
    const sr = 22050, r = analyzeBeats(track({ bpm, offset, sr }), sr);
    assert.ok(Math.abs(r.bpm - bpm) < 1.2, `ra ${r.bpm}`);
    const b = 60 / bpm, dph = ((r.offset - offset) % b + b) % b;
    assert.ok(Math.min(dph, b - dph) < 0.03, `lệch pha ${dph}`);
    assert.ok(r.confidence > 0.2, `tin cậy ${r.confidence}`);
  });
}

test('đoạn to (điệp khúc) có năng lượng cao hơn đoạn nhỏ', () => {
  const sr = 22050, d = track({ bpm: 120, sec: 40, sr });
  for (let i = 0; i < 20 * sr; i++) d[i] *= 0.3; // 20 giây đầu nhỏ
  const r = analyzeBeats(d, sr), half = Math.floor(r.beats / 2);
  const m = (a, b) => [...r.energy.slice(a, b)].reduce((s, x) => s + x, 0) / (b - a);
  assert.ok(m(half + 2, r.beats) > m(0, half - 2) + 0.3);
});

test('nhạc quá ngắn / im lặng không làm lỗi', () => {
  const r = analyzeBeats(new Float32Array(1000), 22050);
  assert.equal(r.bpm, 120); assert.equal(r.confidence, 0);
});

test('bài nhạc có sẵn (tổng hợp) tạo nhanh và máy nhận nhịp ra đúng BPM của bài', async () => {
  globalThis.window ||= {};
  const { BUILTIN, synthSong } = await import('../js/music.js');
  for (const def of BUILTIN) {
    const t0 = Date.now(), S = synthSong(def), ms = Date.now() - t0;
    assert.ok(ms < 3000, `${def.id} mất ${ms} ms`);
    const r = analyzeBeats(S.data, S.sr);
    assert.ok(Math.abs(r.bpm - def.bpm) < 1.5 || Math.abs(r.bpm - def.bpm * 2) < 3 || Math.abs(r.bpm * 2 - def.bpm) < 3, `${def.id}: ${r.bpm} vs ${def.bpm}`);
    const b = 60 / def.bpm, dph = ((r.offset - S.offset) % b + b) % b; assert.ok(Math.min(dph, b - dph) < 0.04, `${def.id} lệch pha ${dph}`);
  }
});
