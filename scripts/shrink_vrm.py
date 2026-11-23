"""Thu nhỏ file VRM (glb): giảm cỡ ảnh, bỏ normal map & thumbnail lớn, đóng gói lại buffer. JSON VRM giữ nguyên."""
import json, struct, sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 512
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl])
binoff = 20 + jl + 8; BIN = b[binoff:binoff + struct.unpack('<I', b[20 + jl:24 + jl])[0]]
bvs = j['bufferViews']; newdata = {}
for im in j.get('images', []):
    i = im['bufferView']; raw = BIN[bvs[i].get('byteOffset', 0):bvs[i].get('byteOffset', 0) + bvs[i]['byteLength']]
    name = (im.get('name') or '').lower()
    img = Image.open(io.BytesIO(raw)); img.load()
    lim = 8 if name.endswith('_nml') or 'nonenormal' in name else 128 if name == 'thumbnail' else (MAX * 2 if 'face_00' in name and not name.endswith('_nml') else MAX)
    if max(img.size) > lim: img = img.resize((max(1, img.size[0] * lim // max(img.size)), max(1, img.size[1] * lim // max(img.size))), Image.LANCZOS)
    hasA = img.mode in ('RGBA', 'LA', 'P') and img.convert('RGBA').getextrema()[3][0] < 250
    out = io.BytesIO()
    if hasA: img.convert('RGBA').save(out, 'PNG', optimize=True); im['mimeType'] = 'image/png'
    else: img.convert('RGB').save(out, 'JPEG', quality=85); im['mimeType'] = 'image/jpeg'
    newdata[i] = out.getvalue()
# morph target: bỏ NORMAL, POSITION → sparse (chỉ giữ đỉnh có dịch chuyển)
import array
A = j['accessors']; extra = []
for m in j['meshes']:
    for pr in m['primitives']:
        for t in pr.get('targets', []):
            t.pop('NORMAL', None); t.pop('TANGENT', None)
            a = t.get('POSITION')
            if a is None or A[a].get('sparse') or A[a].get('_done'): continue
            acc = A[a]; v = bvs[acc['bufferView']]; o = v.get('byteOffset', 0) + acc.get('byteOffset', 0)
            f = array.array('f'); f.frombytes(BIN[o:o + acc['count'] * 12])
            idx = [k for k in range(acc['count']) if abs(f[3*k]) + abs(f[3*k+1]) + abs(f[3*k+2]) > 1e-7]
            ib = array.array('I', idx).tobytes(); vb = array.array('f', [f[3*k+c] for k in idx for c in range(3)]).tobytes()
            if not idx: ib = array.array('I', [0]).tobytes(); vb = array.array('f', [0, 0, 0]).tobytes(); idx = [0]
            bi = len(bvs); bvs.append({'buffer': 0, 'byteLength': len(ib)}); newdata[bi] = ib
            bvv = len(bvs); bvs.append({'buffer': 0, 'byteLength': len(vb)}); newdata[bvv] = vb
            del acc['bufferView']; acc.pop('byteOffset', None)
            acc['sparse'] = {'count': len(idx), 'indices': {'bufferView': bi, 'componentType': 5125}, 'values': {'bufferView': bvv}}
            acc['_done'] = 1
for acc in A: acc.pop('_done', None)
# bỏ bufferView không còn ai dùng
usedbv = set()
def walk(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'bufferView' and isinstance(v, int): usedbv.add(v)
            else: walk(v)
    elif isinstance(o, list):
        for x in o: walk(x)
walk({k: v for k, v in j.items() if k != 'bufferViews'})
# đóng gói lại toàn bộ bufferViews
buf = bytearray()
for i, bv in enumerate(bvs):
    d = newdata.get(i) if i in newdata else (BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']] if i in usedbv else b'')
    while len(buf) % 4: buf.append(0)
    bv['byteOffset'] = len(buf); bv['byteLength'] = len(d); bv['buffer'] = 0; buf += d
while len(buf) % 4: buf.append(0)
# bỏ hẳn bufferView rỗng, đánh lại chỉ số
remap = {}; nb = []
for i, bv in enumerate(bvs):
    if bv['byteLength'] > 0: remap[i] = len(nb); nb.append(bv)
def fix(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'bufferView' and isinstance(v, int): o[k] = remap[v]
            else: fix(v)
    elif isinstance(o, list):
        for x in o: fix(x)
fix({k: v for k, v in j.items() if k != 'bufferViews'}); j['bufferViews'] = nb
j['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(buf), 0x004E4942) + bytes(buf)
open(dst, 'wb').write(glb); print(dst, round(len(glb) / 1e6, 2), 'MB')
