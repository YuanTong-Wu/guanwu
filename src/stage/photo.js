// 画面层：取景时是实时摄像头；定格后"入画"——整幅画面先化成水墨，
// 再只留下被数到的东西，其余褪成宣纸留白，像一幅写意小品。
// 输出带透明度，下面垫着宣纸层（PaperLayer）。
import * as THREE from 'three'
import { ricePaper } from './textures.js'

export const MAX_BOXES = 32

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`

// 一次性"作画"：定格时把整幅画面画成水墨，存进一张贴图（R 通道 = 墨色浓淡）。
// 大半径模糊把细节归并成大块，墨只分浓、淡两层，再加粗的勾线和飞白。
const bakeFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uUvScale;
  uniform vec2 uUvOffset;
  uniform float uMirror;
  uniform vec2 uPx;
  uniform float uAspect;
  uniform int uBoxCount;
  uniform vec4 uBoxes[${MAX_BOXES}];
  varying vec2 vUv;
  ${NOISE}
  vec2 texUv(vec2 uv) {
    vec2 t = uv * uUvScale + uUvOffset;
    if (uMirror > 0.5) t.x = 1.0 - t.x;
    return t;
  }
  // 照片是屏幕颜色（sRGB），按线性亮度判断浓淡，暗部层次更分明
  float lum(vec2 uv) { vec3 c = texture2D(uMap, texUv(uv)).rgb; return dot(c * c, vec3(0.299, 0.587, 0.114)); }
  // 13 点黄金角螺旋采样的圆盘均值
  float disc(vec2 uv, float r) {
    float s = 0.0;
    for (int i = 0; i < 13; i++) {
      float fi = float(i);
      float rr = sqrt((fi + 0.5) / 13.0) * r;
      float a = fi * 2.39996;
      s += lum(uv + vec2(cos(a), sin(a)) * rr * uPx);
    }
    return s / 13.0;
  }
  void main() {
    vec2 uv = vUv;
    vec2 auv = uv * vec2(uAspect, 1.0);
    float soft = disc(uv, 6.0);
    float wide = disc(uv, 26.0);
    // 勾线：在模糊后的明暗上求梯度，只留大的轮廓
    float gx = disc(uv + vec2(3.0, 0.0) * uPx, 4.0) - disc(uv - vec2(3.0, 0.0) * uPx, 4.0);
    float gy = disc(uv + vec2(0.0, 3.0) * uPx, 4.0) - disc(uv - vec2(0.0, 3.0) * uPx, 4.0);
    float edge = smoothstep(0.06, 0.16, length(vec2(gx, gy)));
    // 比四周暗、本身又暗的地方着墨
    float d = (1.0 - soft) * 0.5 + (wide - soft) * 2.6 + (fbm(auv * 5.0) - 0.5) * 0.08;
    float dark = smoothstep(0.6, 0.7, d);
    float wash = smoothstep(0.42, 0.52, d);
    float ink = max(dark * 0.88, wash * 0.17);
    // 勾线有干湿：沿线时浓时淡
    ink = max(ink, edge * (0.55 + 0.4 * fbm(auv * 9.0 + 2.0)));
    // 宣纸吃墨不匀，浓墨里带一点飞白
    ink *= 0.8 + 0.28 * fbm(auv * 16.0 + 7.0);

    // 被数到的东西：每个框取一块羽化的圆角区域，边缘随噪声散开
    float edgeNoise = fbm(auv * 9.0) - 0.5;
    float m = 0.0;
    float dist = 10.0;
    for (int i = 0; i < ${MAX_BOXES}; i++) {
      if (i >= uBoxCount) break;
      vec4 b = uBoxes[i];
      vec2 c = b.xy + b.zw * 0.5;
      vec2 k = (uv - c) * vec2(uAspect, 1.0);
      vec2 h = b.zw * 0.5 * vec2(uAspect, 1.0);
      vec2 ex = abs(k) - h * 0.8;
      float sd = length(max(ex, 0.0)) + min(max(ex.x, ex.y), 0.0);
      float feather = min(h.x, h.y) * 0.45;
      m = max(m, 1.0 - smoothstep(-feather * 0.2, feather + edgeNoise * feather, sd));
      vec2 ex2 = abs(k) - h;
      dist = min(dist, length(max(ex2, 0.0)) + min(max(ex2.x, ex2.y), 0.0));
    }
    // 离物体的远近（带噪声），留白时远处先褪
    float far = clamp(dist * 2.2, 0.0, 1.0) + (fbm(auv * 3.0 + 11.0) - 0.5) * 0.35;
    // 晕开时边缘的参差
    float jag = fbm(auv * 3.0 + 3.0);
    gl_FragColor = vec4(clamp(ink, 0.0, 1.0), m, (far + 0.25) / 1.5, jag);
  }
`

const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uInkTex;
  uniform vec2 uUvScale;
  uniform vec2 uUvOffset;
  uniform float uMirror;
  uniform float uInk;
  uniform float uIsolate;
  uniform float uAspect;
  uniform vec2 uOrigin;
  uniform vec4 uClip;
  varying vec2 vUv;
  vec2 texUv(vec2 uv) {
    vec2 t = uv * uUvScale + uUvOffset;
    if (uMirror > 0.5) t.x = 1.0 - t.x;
    return t;
  }

  void main() {
    vec2 uv = vUv;
    vec3 photo = texture2D(uMap, texUv(uv)).rgb;
    // 预先画好的：R 墨色，G 物体遮罩，B 远近，A 参差
    vec4 baked = texture2D(uInkTex, uv);
    float far = baked.b * 1.5 - 0.25;

    // —— 留白：离物体越远越先褪去 ——
    float edgeT = 1.15 - uIsolate * 1.6;
    float vanish = smoothstep(edgeT - 0.08, edgeT + 0.08, far);
    float paintAlpha = baked.r * max(baked.g, 1.0 - vanish);

    // —— 从照片到画：从墨滴落点向外晕开，边缘不齐 ——
    float fromDrop = length((uv - uOrigin) * vec2(uAspect, 1.0));
    float p = clamp((uInk * 1.9 - fromDrop * 1.25 - baked.a * 0.3) * 2.4, 0.0, 1.0);
    vec3 grey = vec3(dot(photo, vec3(0.299, 0.587, 0.114)));
    vec3 inkCol = vec3(0.1, 0.092, 0.085);
    vec3 col = mix(mix(photo, grey, min(1.0, p * 2.0)), inkCol, p);
    float alpha = mix(1.0, paintAlpha, p);
    // 册页裁切：只留一块纸
    alpha *= step(uClip.x, uv.x) * step(uv.x, uClip.z) * step(uClip.y, uv.y) * step(uv.y, uClip.w);
    gl_FragColor = vec4(col, alpha);
  }
`

// 未作画前的占位：无墨、非物体、处处"远"
const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 255, 128]), 1, 1)
BLANK.needsUpdate = true

export class PhotoLayer {
  constructor() {
    this.uniforms = {
      uMap: { value: null },
      uInkTex: { value: BLANK },
      uUvScale: { value: new THREE.Vector2(1, 1) },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uMirror: { value: 0 },
      uInk: { value: 0 },
      uIsolate: { value: 0 },
      uAspect: { value: 1 },
      uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uClip: { value: new THREE.Vector4(0, 0, 1, 1) },
      uBoxCount: { value: 0 },
      uBoxes: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector4()) },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.object.renderOrder = -10
    this.object.visible = false
    this.sourceSize = { w: 1, h: 1 }
    this.placement = { s: 1, x: 0, y: 0 }
  }

  // source：<video> 或 <canvas>/<img>
  setSource(source, { mirror = false } = {}) {
    const old = this.uniforms.uMap.value
    let tex
    if (source instanceof HTMLVideoElement) {
      tex = new THREE.VideoTexture(source)
      this.sourceSize = { w: source.videoWidth || 640, h: source.videoHeight || 480 }
    } else {
      tex = new THREE.CanvasTexture(source)
      this.sourceSize = { w: source.width || source.naturalWidth, h: source.height || source.naturalHeight }
    }
    tex.minFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    this.uniforms.uMap.value = tex
    this.uniforms.uMirror.value = mirror ? 1 : 0
    this.object.visible = true
    old?.dispose()
    this.fit()
  }

  resize(w, h) {
    this.view = { w, h }
    this.uniforms.uAspect.value = w / h
    this.place(this.placement.s, this.placement.x, this.placement.y)
    this.fit()
  }

  // 把整幅画缩放 s 倍并移到场景坐标 (x, y)，用于入画后把小品挪到构图里
  place(s, x, y) {
    this.placement = { s, x, y }
    if (!this.view) return
    this.object.scale.set(this.view.w * s, this.view.h * s, 1)
    this.object.position.set(x, y, 0)
  }

  // 定格后画一次水墨，存成贴图。renderer：three 的 WebGLRenderer
  bake(renderer) {
    if (!this.view) return
    const k = Math.min(1.25, 1280 / Math.max(this.view.w, this.view.h))
    const w = Math.round(this.view.w * k)
    const h = Math.round(this.view.h * k)
    if (!this.inkTarget || this.inkTarget.width !== w || this.inkTarget.height !== h) {
      this.inkTarget?.dispose()
      this.inkTarget = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false })
    }
    const b = this.bakePass(renderer)
    b.material.uniforms.uPx.value.set(1 / w, 1 / h)
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(this.inkTarget)
    renderer.render(b.scene, b.camera)
    renderer.setRenderTarget(prev)
    this.uniforms.uInkTex.value = this.inkTarget.texture
  }

  // 作画用的着色器只建一次；取景时就预先编译，定格那一刻不卡
  bakePass(renderer) {
    if (this._bake) return this._bake
    const u = this.uniforms
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: u.uMap,
        uUvScale: u.uUvScale,
        uUvOffset: u.uUvOffset,
        uMirror: u.uMirror,
        uAspect: u.uAspect,
        uBoxCount: u.uBoxCount,
        uBoxes: u.uBoxes,
        uPx: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: bakeFrag,
      depthTest: false,
      depthWrite: false,
    })
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    const camera = new THREE.Camera()
    this._bake = { material, scene, camera }
    return this._bake
  }

  precompile(renderer) {
    const b = this.bakePass(renderer)
    try {
      renderer.compile(b.scene, b.camera)
    } catch {
      // 编译失败留到真正作画时再报
    }
  }

  reset() {
    this.uniforms.uInkTex.value = BLANK
    this.uniforms.uInk.value = 0
    this.uniforms.uIsolate.value = 0
    this.uniforms.uClip.value.set(0, 0, 1, 1)
    this.setBoxes([])
    this.place(1, 0, 0)
  }

  // 像 CSS 的 object-fit: cover
  fit() {
    if (!this.view) return
    const va = this.view.w / this.view.h
    const sa = this.sourceSize.w / this.sourceSize.h
    const s = this.uniforms.uUvScale.value
    const o = this.uniforms.uUvOffset.value
    if (sa > va) {
      s.set(va / sa, 1)
      o.set((1 - va / sa) / 2, 0)
    } else {
      s.set(1, sa / va)
      o.set(0, (1 - sa / va) / 2)
    }
  }

  // 源图像素坐标 → 屏幕像素坐标（cover 裁切之后，未缩放挪动时）
  sourceToScreen(x, y) {
    const s = this.uniforms.uUvScale.value
    const o = this.uniforms.uUvOffset.value
    let u = x / this.sourceSize.w
    if (this.uniforms.uMirror.value > 0.5) u = 1 - u
    const v = y / this.sourceSize.h
    return { x: ((u - o.x) / s.x) * this.view.w, y: ((v - o.y) / s.y) * this.view.h }
  }

  // boxes：屏幕像素坐标 {x,y,width,height}（左上为原点）
  setBoxes(boxes) {
    const n = Math.min(boxes.length, MAX_BOXES)
    this.uniforms.uBoxCount.value = n
    for (let i = 0; i < n; i++) {
      const b = boxes[i]
      // 着色器里 uv 的 y 向上
      this.uniforms.uBoxes.value[i].set(b.x / this.view.w, 1 - (b.y + b.height) / this.view.h, b.width / this.view.w, b.height / this.view.h)
    }
  }

  dispose() {
    this.uniforms.uMap.value?.dispose()
    this.inkTarget?.dispose()
    this.material.dispose()
  }
}

// 宣纸底：全屏，入画之后露出来；和画面层用同样的缩放、挪动和裁切，合起来就是一张册页
const paperFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uRepeat;
  uniform float uOpacity;
  uniform vec4 uClip;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(uMap, vUv * uRepeat).rgb;
    float inside = step(uClip.x, vUv.x) * step(vUv.x, uClip.z) * step(uClip.y, vUv.y) * step(vUv.y, uClip.w);
    float a = uOpacity * inside;
    gl_FragColor = vec4(c, a);
  }
`

export class PaperLayer {
  constructor() {
    this.texture = ricePaper()
    this.uniforms = {
      uMap: { value: this.texture },
      uRepeat: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 0 },
      uClip: { value: new THREE.Vector4(0, 0, 1, 1) },
    }
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: paperFrag, transparent: true, depthWrite: false, depthTest: false })
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.object.renderOrder = -20
    this.placement = { s: 1, x: 0, y: 0 }
  }

  set opacity(v) {
    this.uniforms.uOpacity.value = v
    this.object.visible = v > 0.001
  }

  resize(w, h) {
    this.view = { w, h }
    // 纸纹按屏幕比例铺，不拉伸
    this.uniforms.uRepeat.value.set(w / 900, h / 900)
    this.place(this.placement.s, this.placement.x, this.placement.y)
  }

  place(s, x, y) {
    this.placement = { s, x, y }
    if (!this.view) return
    this.object.scale.set(this.view.w * s, this.view.h * s, 1)
    this.object.position.set(x, y, 0)
  }

  reset() {
    this.opacity = 0
    this.uniforms.uClip.value.set(0, 0, 1, 1)
    this.place(1, 0, 0)
  }

  dispose() {
    this.texture.dispose()
    this.material.dispose()
  }
}
