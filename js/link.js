// Nối điện thoại (máy chơi) → TV/laptop (màn hình) bằng WebRTC.
// Máy chủ PeerJS chỉ dùng để "giới thiệu" hai bên qua mã 4 số; hình + tiếng đi thẳng peer-to-peer trong mạng Wi-Fi.
import { CONFIG } from './config.js';

let libP = null;
export function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  return libP ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = CONFIG.PEER.lib; s.async = true;
    s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('PeerJS không khởi tạo được')));
    s.onerror = () => { libP = null; rej(new Error('Không tải được thư viện kết nối (PeerJS). Kiểm tra mạng.')); };
    document.head.appendChild(s);
  });
}
export const peerOptions = () => ({ debug: 0, ...(CONFIG.PEER.server || {}) });

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

function waitConnected(pc, ms) {
  return withTimeout(new Promise((res, rej) => {
    const check = () => {
      const st = pc.connectionState || pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') res();
      else if (st === 'failed') rej(new Error('Không nối được trực tiếp tới TV. Điện thoại và TV phải cùng mạng Wi-Fi (không dùng Wi-Fi khách / tách client).'));
    };
    pc.addEventListener('connectionstatechange', check);
    pc.addEventListener('iceconnectionstatechange', check);
    check();
  }), ms, 'Hết thời gian chờ kết nối hình ảnh tới TV.');
}

/** Phía điện thoại: gửi stream canvas (+ tiếng) sang màn hình có mã `code`. */
export class Link {
  constructor() { this.peer = null; this.call = null; this.conn = null; this.state = 'idle'; this.rtt = null; this.onChange = () => {}; }

  async connect(code, stream, onStatus = () => {}) {
    this.close();
    const Peer = await loadPeer();
    onStatus('Đang kết nối máy chủ ghép nối…');
    const peer = this.peer = new Peer(peerOptions());
    let lastErr = null;
    peer.on('error', e => { lastErr = e; if (this.state === 'live') this._set('lost'); });
    await withTimeout(new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); }), 12000, 'Không tới được máy chủ ghép nối (cần Internet).');

    const id = CONFIG.PEER.prefix + code;
    onStatus('Đang tìm TV mã ' + code + '…');
    this.conn = peer.connect(id, { reliable: false });
    await withTimeout(new Promise((res, rej) => {
      this.conn.once('open', res);
      peer.once('error', e => rej(e?.type === 'peer-unavailable' ? new Error(`Không thấy TV có mã ${code}. Kiểm tra mã đang hiện trên TV.`) : e));
    }), 10000, `Không thấy TV có mã ${code}.`);

    onStatus('Đang gửi hình…');
    stream.getVideoTracks().forEach(t => { try { t.contentHint = 'motion'; } catch { /* */ } });
    this.call = peer.call(id, stream);
    this.call.on('close', () => this._set('closed'));
    await waitConnected(this.call.peerConnection, 15000);
    await this._tune(this.call.peerConnection);

    this.conn.on('data', d => { if (d?.pong) this.rtt = performance.now() - d.pong; });
    this.conn.on('close', () => this._set('closed'));
    this._ping = setInterval(() => { try { this.conn.send({ ping: performance.now() }); } catch { /* */ } }, 2000);
    this.call.peerConnection.addEventListener('connectionstatechange', () => {
      const st = this.call?.peerConnection.connectionState;
      if (st === 'failed' || st === 'disconnected') this._set('lost');
      else if (st === 'connected') this._set('live');
    });
    void lastErr;
    this._set('live');
    return this;
  }

  /** Ưu tiên độ trễ thấp + giữ khung hình (thà mờ còn hơn giật). */
  async _tune(pc) {
    for (const s of pc.getSenders()) {
      if (s.track?.kind !== 'video') continue;
      try {
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = CONFIG.TV.bitrate;
        p.encodings[0].maxFramerate = CONFIG.TV.streamFps;
        p.degradationPreference = 'maintain-framerate';
        await s.setParameters(p);
      } catch (e) { console.warn('[link] setParameters', e); }
    }
  }

  _set(st) { if (this.state === st) return; this.state = st; this.onChange(st); }
  get live() { return this.state === 'live'; }

  close() {
    clearInterval(this._ping);
    try { this.call?.close(); } catch { /* */ }
    try { this.conn?.close(); } catch { /* */ }
    try { this.peer?.destroy(); } catch { /* */ }
    this.peer = this.call = this.conn = null; this.state = 'idle';
  }
}
