// Trang màn hình (TV có trình duyệt / laptop nối máy chiếu): hiện mã ghép, nhận stream từ điện thoại.
import { CONFIG } from './config.js';
import { loadPeer, peerOptions, iceDiag, HOTSPOT_TIP } from './link.js';

const $ = id => document.getElementById(id);
const v = $('v');
const status = t => { $('status').textContent = t; };
const gameUrl = new URL('./', location.href).href;
$('game-url').textContent = gameUrl.replace(/^https?:\/\//, '');

let peer = null, current = null, retry = 0;

function pairing(on) {
  $('pair').hidden = !on;
  document.body.classList.toggle('playing', !on);
  if (on) { v.srcObject = null; $('tap').hidden = true; }
}

function lowLatency(pc) {
  // Chrome: jitterBufferTarget=0 → phát ngay khi có frame (đổi lấy đôi chút giật nếu Wi-Fi kém)
  const apply = () => pc.getReceivers().forEach(r => {
    try { if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0; } catch { /* */ }
    try { if ('playoutDelayHint' in r) r.playoutDelayHint = 0; } catch { /* */ }
  });
  pc.addEventListener('track', apply); apply();
  pc.addEventListener('connectionstatechange', () => {
    const st = pc.connectionState;
    if (st === 'failed' || st === 'closed') { pairing(true); status('Mất kết nối với điện thoại — chờ kết nối lại'); }
  });
}

async function showStream(s) {
  v.srcObject = s; pairing(false); status('Đang chiếu');
  v.muted = false;
  try { await v.play(); }
  catch { v.muted = true; await v.play().catch(() => {}); $('tap').hidden = false; } // TV chặn tự phát tiếng → cần bấm 1 lần
}

function unmute() { if (v.muted && v.srcObject) { v.muted = false; v.play().catch(() => {}); } $('tap').hidden = true; }
document.addEventListener('click', unmute);
document.addEventListener('keydown', unmute);
$('fs').onclick = e => { e.stopPropagation(); unmute(); document.documentElement.requestFullscreen?.().catch(() => {}); };

function create(Peer) {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  peer = new Peer(CONFIG.PEER.prefix + code, peerOptions());
  peer.on('open', () => { retry = 0; $('code').textContent = code; status('Sẵn sàng — chờ điện thoại kết nối'); });
  peer.on('connection', c => {
    status('📱 Điện thoại đang kết nối…');
    c.on('data', d => { if (d?.ping) try { c.send({ pong: d.ping }); } catch { /* */ } });
    c.on('open', () => status('✓ Đã nối với điện thoại — chờ hình…'));
    // nếu 2 máy không nối trực tiếp được, báo ngay trên màn hình lớn
    let waited = 0;
    const watch = setInterval(async () => {
      waited += 1;
      const pc = c.peerConnection;
      const bad = pc && (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed');
      if (c.open) { clearInterval(watch); return; }
      if (bad || waited > 25) {
        clearInterval(watch);
        const d = await iceDiag(pc);
        status(`⚠ Không nối trực tiếp được với điện thoại (router tách thiết bị hoặc khác mạng). ${HOTSPOT_TIP} [${d.local.join('/') || '-'} ↔ ${d.remote.join('/') || '-'}]`);
        $('status').style.opacity = 1; $('status').style.fontSize = '2.6vh'; $('status').style.maxWidth = '90vw';
      }
    }, 1000);
  });
  peer.on('call', call => {
    try { current?.close(); } catch { /* */ }
    current = call;
    call.answer();
    lowLatency(call.peerConnection);
    call.on('stream', showStream);
    call.on('close', () => { if (current === call) { pairing(true); status('Điện thoại đã ngắt — chờ kết nối lại'); } });
  });
  peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* */ } });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') { peer.destroy(); create(Peer); return; } // trùng mã → bốc mã khác
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
      status('Không tới được máy chủ ghép nối — thử lại…');
      peer.destroy(); setTimeout(() => create(Peer), Math.min(15000, 2000 * ++retry));
      return;
    }
    status('Lỗi kết nối: ' + (e.type || e.message));
  });
}

try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* */ }
loadPeer().then(create).catch(e => status(e.message));
window.__display = { get peer() { return peer; }, video: v };
