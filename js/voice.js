// Giọng đọc tiếng Việt (Web Speech API, có sẵn trong trình duyệt — miễn phí, không cần mạng nếu máy có giọng offline).
// Android Chrome: giọng Google tiếng Việt; iPhone: giọng "Linh". Máy không có giọng tiếng Việt → im lặng, game vẫn chạy.
let voice = null, tried = false;
function pick() {
  const vs = window.speechSynthesis?.getVoices?.() || [];
  voice = vs.find(v => /^vi(-|_|$)/i.test(v.lang) && /google/i.test(v.name)) || vs.find(v => /^vi(-|_|$)/i.test(v.lang)) || null;
  tried = vs.length > 0;
}
if (typeof window !== 'undefined' && window.speechSynthesis) { pick(); window.speechSynthesis.onvoiceschanged = pick; }
export function hasVietVoice() { if (!tried) pick(); return !!voice; }
/** Đọc câu; `urgent` cắt câu đang đọc dở. */
export function say(text, { urgent = true, rate = 1.05, pitch = 1.25 } = {}) {
  const S = window.speechSynthesis; if (!S || !text) return;
  if (!tried) pick();
  if (!voice) return;
  try {
    if (urgent) S.cancel();
    const u = new SpeechSynthesisUtterance(text); u.voice = voice; u.lang = voice.lang; u.rate = rate; u.pitch = pitch; u.volume = 1;
    S.speak(u);
  } catch { /* bỏ qua */ }
}
export function hush() { try { window.speechSynthesis?.cancel(); } catch { /* */ } }
