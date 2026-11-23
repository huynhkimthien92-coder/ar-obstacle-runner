// Công chúa 3D: dựng mẫu nhân vật VRM công khai (VRoid Studio sample models — giấy phép CC0) bằng three.js + three-vrm,
// khoác thêm váy dạ hội xoè chạm sàn + vương miện, điều khiển xương theo động tác múa của game.
// Vẽ vào 1 canvas WebGL ẩn rồi dán lên canvas 2D của game (mỗi công chúa một khung nhìn riêng) → không đụng tới phần vẽ khác.
// Nạp muộn (dynamic import) chỉ khi vào game Vũ hội — các game khác không tải three.js.

export const PRINCESS_MODELS = [
  { id: 'victoria', name: 'Hồng Ngọc', url: './assets/princess/v1/victoria.vrm', gown: 0xffcfe3, gown2: 0xfff2f7, trim: 0xf3c85a, gem: 0xff4f9a },
  { id: 'shibu', name: 'Lam Ngọc', url: './assets/princess/v1/shibu.vrm', gown: 0x3348b5, gown2: 0x8fa3ff, trim: 0xd8e4ff, gem: 0x6fd6ff },
  { id: 'vivi', name: 'Diệp Chi', url: './assets/princess/v1/vivi.vrm', wide: 1.12, gown: 0x93c95a, gown2: 0xe6f7c9, trim: 0xf6e7b0, gem: 0xff8a3d },
];

const HALF_PI = Math.PI / 2;

export class Princess3D {
  constructor() { this.ready = false; this.failed = false; this.items = []; this.loading = null; }

  /** Nạp three.js + 3 mẫu. onProgress(k, n). Lỗi (máy không có WebGL…) → failed = true, game dùng lại hình 2D. */
  load(onProgress = () => {}) {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('./vendor/three-0.170/loaders/GLTFLoader.js');
        const { VRMLoaderPlugin, VRMUtils } = await import('./vendor/three-0.170/three-vrm-3.5.5.module.min.js');
        this.T = THREE;
        const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
        const r = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
        r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace;
        this.r = r; this.cv = cv;
        const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
        let done = 0;
        this.items = await Promise.all(PRINCESS_MODELS.map(async def => {
          const g = await loader.loadAsync(def.url);
          const vrm = g.userData.vrm;
          VRMUtils.removeUnnecessaryVertices(g.scene); VRMUtils.combineSkeletons?.(g.scene); VRMUtils.rotateVRM0(vrm);
          vrm.scene.traverse(o => { o.frustumCulled = false; });
          const it = this._dress(vrm, def);
          onProgress(++done, PRINCESS_MODELS.length);
          return it;
        }));
        this.ready = true;
      } catch (e) {
        console.warn('Công chúa 3D không dùng được, quay về hình 2D:', e);
        this.failed = true;
      }
      return this.ready;
    })();
    return this.loading;
  }

  /** Tạo cảnh riêng cho 1 công chúa: đèn, camera trực giao, váy xoè, vương miện. */
  _dress(vrm, def) {
    const T = this.T, scene = new T.Scene(), root = new T.Group();
    scene.add(root); root.add(vrm.scene);
    scene.add(new T.HemisphereLight(0xfff6fb, 0xb9a2d6, 1.9));
    const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(1.4, 1.8, 2.0); scene.add(key);
    const H = vrm.humanoid, nb = n => H.getNormalizedBoneNode(n), rb = n => H.getRawBoneNode(n);
    vrm.update(0); vrm.scene.updateMatrixWorld(true);
    const wp = n => { const v = new T.Vector3(); rb(n)?.getWorldPosition(v); return v; };
    const hips0 = wp('hips').y, head = wp('head');
    const box = new T.Box3().setFromObject(vrm.scene); const top = box.max.y;
    // ---- váy dạ hội (tiện xoay) phủ từ eo xuống sàn ----
    const waist = hips0 + 0.13, prof = [[0.0, waist + 0.02], [0.1, waist + 0.02], [0.115, waist - 0.03], [0.18, hips0 - 0.03], [0.255, hips0 - 0.2], [0.32, hips0 * 0.45], [0.375, 0.14], [0.4, 0.04], [0.405, 0.012], [0.0, 0.012]].map(([x, y]) => [x * (def.wide || 1), y]).reverse();
    const mkLathe = (k, waveA) => {
      const curve = new T.SplineCurve(prof.slice(1, -1).map(([x, y]) => new T.Vector2(x * k, y)));
      const pts = [new T.Vector2(0, prof[0][1]), ...curve.getPoints(40), new T.Vector2(0, prof[prof.length - 1][1])];
      const g = new T.LatheGeometry(pts, 96);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { // gợn sóng theo chiều dọc + viền váy lượn
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
        if (r < 0.01) continue;
        const low = Math.max(0, 1 - y / hips0), f = 1 + waveA * Math.pow(low, 1.3) * (0.7 * Math.sin(a * 16) + 0.3 * Math.sin(a * 7 + 1));
        p.setX(i, x * f); p.setZ(i, z * f);
      }
      g.computeVertexNormals(); return g;
    };
    const grad = new T.DataTexture(new Uint8Array([170, 170, 170, 255, 225, 225, 225, 255, 255, 255, 255, 255]), 3, 1); grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true;
    const gown = new T.Group();
    const inner = new T.Mesh(mkLathe(1, 0.06), new T.MeshToonMaterial({ color: def.gown, gradientMap: grad }));
    const tulle = new T.Mesh(mkLathe(1.06, 0.09), new T.MeshToonMaterial({ color: def.gown2, gradientMap: grad, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }));
    const line = new T.Mesh(mkLathe(1.025, 0.06), new T.MeshBasicMaterial({ color: 0x2a1838, side: T.BackSide })); // viền đen kiểu anime
    const hem = new T.Mesh(new T.TorusGeometry(0.41 * (def.wide || 1), 0.011, 6, 96), new T.MeshToonMaterial({ color: def.trim, gradientMap: grad })); hem.rotation.x = HALF_PI; hem.position.y = 0.04;
    const belt = new T.Mesh(new T.TorusGeometry(0.112, 0.013, 6, 48), new T.MeshToonMaterial({ color: def.trim, gradientMap: grad })); belt.rotation.x = HALF_PI; belt.position.y = waist - 0.025;
    const bow = new T.Mesh(new T.SphereGeometry(0.03, 12, 8), new T.MeshToonMaterial({ color: def.gem, gradientMap: grad })); bow.position.set(0, waist - 0.025, 0.115);
    gown.add(line, inner, tulle, hem, belt, bow); root.add(gown);
    // ---- vương miện trên đỉnh đầu ----
    const crown = new T.Group(), gold = new T.MeshToonMaterial({ color: 0xffd45e, gradientMap: grad, emissive: 0x3a2400 });
    const band = new T.Mesh(new T.CylinderGeometry(0.06, 0.066, 0.025, 24, 1, true), gold); crown.add(band);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, spike = new T.Mesh(new T.ConeGeometry(0.012, k % 2 ? 0.035 : 0.055, 6), gold);
      spike.position.set(Math.sin(a) * 0.063, 0.03, Math.cos(a) * 0.063); crown.add(spike);
    }
    const gem = new T.Mesh(new T.OctahedronGeometry(0.016), new T.MeshToonMaterial({ color: def.gem, gradientMap: grad, emissive: def.gem, emissiveIntensity: 0.35 })); gem.position.set(0, 0.012, 0.068); crown.add(gem);
    const headRaw = rb('head'), hq = new T.Quaternion(); headRaw.getWorldQuaternion(hq);
    crown.position.copy(headRaw.worldToLocal(new T.Vector3(0, top - 0.035, head.z - 0.01)));
    crown.quaternion.copy(hq.invert()); crown.rotateX(-0.22); crown.scale.setScalar(1.35);
    headRaw.add(crown);
    // ---- camera trực giao (khung chứa cả tay giơ cao) ----
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, -10, 10); cam.position.set(0, 0, 3);
    const look = new T.Object3D(); look.position.set(0, top * 0.9, 2.5); scene.add(look);
    if (vrm.lookAt) vrm.lookAt.target = look;
    return { vrm, scene, root, gown, cam, nb, hips0, top, def, hipRest: nb('hips').position.clone(), blinkT: Math.random() * 3 };
  }

  /**
   * Đặt tư thế công chúa i theo tham số của game (giống hình 2D):
   * a1/a2 góc tay bên trái/phải MÀN HÌNH (0 buông … π giơ thẳng), e1/e2 gập khuỷu, squat 0..1, twirl 0..1, bob, sway, headTilt, mood.
   */
  pose(i, A, dt) {
    const it = this.items[i]; if (!it) return;
    const { nb, vrm } = it;
    const set = (n, x, y, z) => { const b = nb(n); if (b) b.rotation.set(x, y, z); };
    // tay bên trái màn hình = tay PHẢI của nhân vật (nhân vật quay mặt ra phía người xem)
    const a1 = Math.max(0.42, A.a1), a2 = Math.max(0.42, A.a2); // tay buông vẫn hơi mở ra để không chìm vào váy xoè
    const up = a => Math.min(1, Math.max(0, (a - 1.7) / 0.9)); // tay càng giơ cao → gập khuỷu theo mặt phẳng trước mặt (vỗ tay trên đầu)
    set('rightUpperArm', 0, -0.3 * (1 - up(a1)), a1 - HALF_PI);
    set('leftUpperArm', 0, 0.3 * (1 - up(a2)), HALF_PI - a2);
    set('rightLowerArm', 0, -A.e1 * 0.9 * (1 - up(a1)), A.e1 * (0.2 + 0.8 * up(a1)));
    set('leftLowerArm', 0, A.e2 * 0.9 * (1 - up(a2)), -A.e2 * (0.2 + 0.8 * up(a2)));
    set('rightHand', 0, 0, (A.a1 > 2 ? 0.25 : -0.15));
    set('leftHand', 0, 0, (A.a2 > 2 ? -0.25 : 0.15));
    const sq = A.squat || 0;
    set('rightUpperLeg', -1.05 * sq, 0, 0.05 * sq); set('leftUpperLeg', -1.05 * sq, 0, -0.05 * sq);
    set('rightLowerLeg', 1.9 * sq, 0, 0); set('leftLowerLeg', 1.9 * sq, 0, 0);
    set('rightFoot', -0.85 * sq, 0, 0); set('leftFoot', -0.85 * sq, 0, 0);
    const hips = nb('hips'), drop = sq * 0.34 * it.hips0 / 0.85 - (A.bob || 0) * 1.4;
    hips.position.set(it.hipRest.x + (A.sway || 0) * 0.6, it.hipRest.y - drop, it.hipRest.z); hips.rotation.set(0, 0, (A.sway || 0) * 0.6);
    set('spine', sq * 0.35, 0, -(A.sway || 0) * 0.9); set('chest', 0.04, 0, 0);
    set('neck', 0, 0, (A.headTilt || 0) * 0.4); set('head', -0.05, 0, (A.headTilt || 0) * 0.6 + (A.sway || 0) * 0.5);
    // váy theo hông: viền váy luôn chạm sàn
    const k = Math.max(0.55, 1 - drop / it.hips0);
    it.gown.scale.set(1 + sq * 0.12, k, 1 + sq * 0.12); it.gown.position.x = hips.position.x;
    it.root.rotation.y = (A.twirl || 0) * Math.PI * 2;
    // nét mặt
    const E = vrm.expressionManager;
    if (E) {
      it.blinkT -= dt; const blink = it.blinkT < 0.12 ? 1 : 0; if (it.blinkT < 0) it.blinkT = 2 + Math.random() * 3;
      E.setValue('happy', A.mood === 'happy' ? 0.3 : 0); E.setValue('relaxed', A.mood === 'happy' ? 0.25 : 0); E.setValue('sad', A.mood === 'sad' ? 0.8 : 0); E.setValue('surprised', A.mood === 'wow' ? 0.6 : 0);
      E.setValue('blink', blink * (A.mood === 'happy' ? 0.7 : 1)); E.setValue('aa', A.mood === 'wow' ? 0.3 : 0);
    }
    vrm.update(Math.min(0.05, dt)); // tóc / váy gốc đung đưa (spring bone)
  }

  /**
   * Vẽ những công chúa trong `ids` lên ctx 2D. spots[i] = { x, y (chân), h (cao) } toạ độ màn hình.
   * q: tỉ lệ độ phân giải canvas 3D so với màn hình (máy yếu → 0,6).
   */
  draw(ctx, ids, spots, W, H, q = 1) {
    if (!this.ready) return;
    const r = this.r, cw = Math.round(W * q), chh = Math.round(H * q);
    if (this.cv.width !== cw || this.cv.height !== chh) r.setSize(cw, chh, false);
    r.setScissorTest(false); r.setViewport(0, 0, cw, chh); r.clear();
    r.setScissorTest(true);
    for (const i of ids) {
      const it = this.items[i], sp = spots[i]; if (!it || !sp) continue;
      const ppm = sp.h / it.top;                   // px / mét
      const bw = sp.h * 1.15, bh = sp.h * 1.42;    // khung: rộng cho tay dang, cao cho tay giơ
      const x0 = sp.x - bw / 2, y0 = sp.y + sp.h * 0.04 - bh; // góc trên-trái (màn hình)
      const c = it.cam; c.left = -bw / 2 / ppm; c.right = bw / 2 / ppm; c.bottom = -sp.h * 0.04 / ppm; c.top = (bh - sp.h * 0.04) / ppm; c.updateProjectionMatrix();
      const vx = Math.round(x0 * q), vy = Math.round((H - (y0 + bh)) * q), vw = Math.round(bw * q), vh = Math.round(bh * q);
      r.setViewport(vx, vy, vw, vh); r.setScissor(vx, vy, vw, vh);
      r.render(it.scene, c);
    }
    r.setScissorTest(false);
    ctx.drawImage(this.cv, 0, 0, W, H);
  }
}
