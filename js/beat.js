// Nhận nhịp nhạc (BPM + vị trí phách) ngay trên máy — không thư viện, không gửi nhạc đi đâu.
// Cách làm (kinh điển, xem Bello et al. 2005 "A Tutorial on Onset Detection"; Dixon 2006):
//  1) Hàm onset: chênh lệch log-năng lượng dương theo khung ~11 ms, 2 dải (trầm = trống kick, toàn dải).
//  2) Tempo: tự tương quan hàm onset trên dải 70–180 BPM, có trọng số ưu tiên quanh 120 BPM để chọn đúng "quãng tám".
//  3) Pha: chọn độ lệch làm tổng onset trên lưới phách lớn nhất; phách mạnh (đầu ô nhịp) = pha có kick mạnh nhất.
//  4) Năng lượng từng phách → biết đoạn nào sôi động (điệp khúc) để tăng độ khó.
// Thuần logic trên Float32Array → test được bằng Node.

/**
 * @param data  Float32Array mono
 * @param sr    sample rate
 * @returns { bpm, offset (s, phách đầu tiên), downbeat (0..3: phách nào là đầu ô nhịp), confidence 0..1, energy: Float32Array (0..1 / phách), beats }
 */
export function analyzeBeats(data, sr, { minBpm = 70, maxBpm = 180, prior = 120 } = {}) {
  const hop = Math.max(64, Math.round(sr * 0.0116)), fr = sr / hop;          // ~86 khung / giây
  const n = Math.floor(data.length / hop);
  if (n < fr * 4) return { bpm: 120, offset: 0, downbeat: 0, confidence: 0, energy: new Float32Array(0), beats: 0 };
  const eLow = new Float32Array(n), eAll = new Float32Array(n);
  let lp = 0; const a = Math.exp(-2 * Math.PI * 150 / sr);                    // lọc thông thấp 1 cực ~150 Hz (kick)
  for (let f = 0; f < n; f++) {
    let sl = 0, sa = 0;
    for (let i = f * hop, e = i + hop; i < e; i++) { const x = data[i]; lp = a * lp + (1 - a) * x; sl += lp * lp; sa += x * x; }
    eLow[f] = Math.log(1e-9 + sl / hop); eAll[f] = Math.log(1e-9 + sa / hop);
  }
  const on = new Float32Array(n), onLow = new Float32Array(n);
  for (let f = 1; f < n; f++) {
    const dl = Math.max(0, eLow[f] - eLow[f - 1]), da = Math.max(0, eAll[f] - eAll[f - 1]);
    onLow[f] = dl; on[f] = dl * 1.5 + da;
  }
  // bỏ thành phần chậm (trung bình trượt ~0,5 s) để chỉ còn "cú gõ"
  const w = Math.round(fr * 0.25), ons = new Float32Array(n);
  let acc = 0;
  for (let f = 0; f < n; f++) {
    acc += on[f]; if (f - 2 * w - 1 >= 0) acc -= on[f - 2 * w - 1];
    const c = f - w; if (c >= 0) ons[c] = Math.max(0, on[c] - acc / (2 * w + 1));
  }
  // tự tương quan
  const lagMin = Math.floor(fr * 60 / maxBpm), lagMax = Math.ceil(fr * 60 / minBpm);
  const ac = new Float32Array(lagMax + 2);
  for (let L = lagMin - 1; L <= lagMax + 1; L++) { let s = 0; for (let f = L; f < n; f++) s += ons[f] * ons[f - L]; ac[L] = s / (n - L); }
  let best = lagMin, bestS = -1;
  for (let L = lagMin; L <= lagMax; L++) {
    const bpm = 60 * fr / L, wgt = Math.exp(-0.5 * Math.pow(Math.log2(bpm / prior) / 0.9, 2)); // ưu tiên quanh 120
    // cộng thêm tương quan ở bội số 2 (ô nhịp chắc chắn hơn) để ổn định
    const s = (ac[L] + 0.5 * (ac[2 * L] || 0)) * wgt;
    if (s > bestS) { bestS = s; best = L; }
  }
  // nội suy parabol để có BPM lẻ (vd. 123,4)
  const y0 = ac[best - 1], y1 = ac[best], y2 = ac[best + 1], den = y0 - 2 * y1 + y2;
  const lag = best + (den ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0);
  const bpm = 60 * fr / lag;
  // pha: thử mọi độ lệch trong 1 chu kỳ
  const P = lag, steps = Math.max(8, Math.round(P));
  let bestPh = 0, bestPhS = -1;
  for (let k = 0; k < steps; k++) {
    const ph = (k / steps) * P; let s = 0;
    for (let t = ph; t < n - 1; t += P) { const i = Math.round(t); s += ons[i] + 0.5 * (ons[i - 1] || 0) + 0.5 * (ons[i + 1] || 0); }
    if (s > bestPhS) { bestPhS = s; bestPh = ph; }
  }
  // tinh chỉnh: tìm đỉnh onset gần mỗi điểm lưới (±15% chu kỳ) rồi hồi quy tuyến tính t_k = pha + k·chu kỳ
  //   → BPM và vị trí phách chính xác, không bị trôi dần theo bài
  let ph = bestPh, PP = P;
  for (let it = 0; it < 3; it++) {
    const ks = [], ts = [], ws = [], R = Math.max(2, Math.round(PP * 0.15));
    for (let k = 0, t = ph; t < n - R - 1; k++, t = ph + k * PP) {
      const c = Math.round(t); let bi = -1, bv = 0;
      for (let i = Math.max(1, c - R); i <= c + R; i++) if (ons[i] > bv) { bv = ons[i]; bi = i; }
      if (bi < 0 || bv <= 0) continue;
      const y0 = ons[bi - 1] || 0, y2 = ons[bi + 1] || 0, dd = y0 - 2 * bv + y2;
      ks.push(k); ts.push(bi + (dd ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / dd)) : 0)); ws.push(bv);
    }
    if (ks.length < 4) break;
    let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
    for (let i = 0; i < ks.length; i++) { const w2 = ws[i]; sw += w2; sk += w2 * ks[i]; st += w2 * ts[i]; skk += w2 * ks[i] * ks[i]; skt += w2 * ks[i] * ts[i]; }
    const den2 = sw * skk - sk * sk; if (!den2) break;
    const slope = (sw * skt - sk * st) / den2, icp = (st - slope * sk) / sw;
    if (!(slope > PP * 0.9 && slope < PP * 1.1)) break;
    PP = slope; ph = ((icp % PP) + PP) % PP;
  }
  const bpmFine = 60 * fr / PP;
  const offset = ph / fr;
  const nb = Math.floor((n - ph) / PP);
  // phách mạnh: pha (0..3) có tổng kick lớn nhất
  const dbS = [0, 0, 0, 0];
  for (let b = 0; b < nb; b++) { const i = Math.round(ph + b * PP); dbS[b % 4] += onLow[i] + (onLow[i + 1] || 0); }
  const downbeat = dbS.indexOf(Math.max(...dbS));
  // năng lượng từng phách (chuẩn hoá theo phân vị 10–95)
  const energy = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    const i0 = Math.round(ph + b * PP), i1 = Math.min(n, Math.round(ph + (b + 1) * PP));
    let s = 0; for (let i = i0; i < i1; i++) s += Math.exp(eAll[i]); energy[b] = Math.log(1e-9 + s / Math.max(1, i1 - i0));
  }
  const sorted = [...energy].sort((x, y) => x - y), lo = sorted[Math.floor(nb * 0.1)] ?? 0, hi = sorted[Math.floor(nb * 0.95)] ?? 1;
  for (let b = 0; b < nb; b++) energy[b] = Math.max(0, Math.min(1, (energy[b] - lo) / Math.max(1e-6, hi - lo)));
  // độ tin cậy: đỉnh tự tương quan so với trung bình
  let mean = 0; for (let L = lagMin; L <= lagMax; L++) mean += ac[L]; mean /= (lagMax - lagMin + 1);
  const confidence = Math.max(0, Math.min(1, (ac[best] / Math.max(1e-9, mean) - 1) / 3));
  void bpm;
  return { bpm: Math.round(bpmFine * 10) / 10, offset, downbeat, confidence, energy, beats: nb };
}

/** Trộn kênh → mono, giảm mẫu (để phân tích nhanh trên điện thoại). */
export function toMono(channels, step = 2) {
  const len = Math.floor(channels[0].length / step), out = new Float32Array(len), k = channels.length;
  for (let i = 0; i < len; i++) { let s = 0; for (let c = 0; c < k; c++) s += channels[c][i * step]; out[i] = s / k; }
  return out;
}
