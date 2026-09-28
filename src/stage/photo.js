// 画面层：实时摄像头或定格照片。着色器负责"照片 → 水墨画"和"墨从物体处晕开、淹没全屏"。
import * as THREE from 'three'

export const MAX_BOXES = 16

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uPaper;
  uniform vec2 uTexel;
  uniform vec2 uUvScale;
  uniform vec2 uUvOffset;
  uniform float uMirror;
  uniform float uInk;
  uniform float uFlood;
  uniform float uDim;
  uniform float uTime;
  uniform float uAspect;
  uniform float uHighlight;
  uniform int uBoxCount;
  uniform vec4 uBoxes[${MAX_BOXES}];
  varying vec2 vUv;

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
  vec2 texUv(vec2 uv) {
    vec2 t = uv * uUvScale + uUvOffset;
    if (uMirror > 0.5) t.x = 1.0 - t.x;
    return t;
  }
  float lum(vec2 uv) { return dot(texture2D(uMap, texUv(uv)).rgb, vec3(0.299, 0.587, 0.114)); }

  // 到最近一个物体框的"墨团距离"：负值在框内
  float boxField(vec2 uv) {
    float d = 10.0;
    for (int i = 0; i < ${MAX_BOXES}; i++) {
      if (i >= uBoxCount) break;
      vec4 b = uBoxes[i];
      vec2 c = b.xy + b.zw * 0.5;
      vec2 q = (uv - c) * vec2(uAspect, 1.0);
      vec2 h = b.zw * 0.5 * vec2(uAspect, 1.0);
      vec2 e = abs(q) - h;
      d = min(d, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0));
    }
    return d;
  }

  void main() {
    vec2 uv = vUv;
    // 水墨化时画面轻微晕染抖动
    vec2 wob = (vec2(fbm(uv * 6.0 + uTime * 0.05), fbm(uv * 6.0 - uTime * 0.05)) - 0.5) * 0.006 * uInk;
    vec3 photo = texture2D(uMap, texUv(uv + wob)).rgb;

    // 索贝尔描边
    vec2 t = uTexel * 1.5;
    float tl = lum(uv + vec2(-t.x, t.y)), tc = lum(uv + vec2(0, t.y)), tr = lum(uv + t);
    float ml = lum(uv - vec2(t.x, 0)), mr = lum(uv + vec2(t.x, 0));
    float bl = lum(uv - t), bc = lum(uv - vec2(0, t.y)), br = lum(uv + vec2(t.x, -t.y));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
    float edge = smoothstep(0.12, 0.55, length(vec2(gx, gy)));

    float L = dot(photo, vec3(0.299, 0.587, 0.114));
    // 局部明暗：比周围暗的地方着墨（比整体亮度更像画家的判断）
    vec2 o1 = uTexel * 9.0;
    float Lb = (L + lum(uv + o1) + lum(uv - o1) + lum(uv + vec2(o1.x, -o1.y)) + lum(uv + vec2(-o1.x, o1.y))) / 5.0;
    float detail = clamp((Lb - L) * 3.5, 0.0, 1.0);
    // 墨分五色：暗部分三层淡墨、浓墨、焦墨，层与层之间柔和过渡
    float tone = smoothstep(0.22, 0.88, 1.0 - L);
    float q = tone * 3.0;
    float wash = (floor(q) + smoothstep(0.3, 0.7, fract(q))) / 3.0;
    float ink = clamp(wash * 0.72 + edge * 0.9 + detail * 0.55, 0.0, 1.0);
    // 墨色不匀，像宣纸吃墨
    ink *= 0.82 + 0.3 * fbm(uv * 9.0 + 3.0);
    vec3 paper = texture2D(uPaper, uv * vec2(uAspect, 1.0) * 1.3).rgb * 0.97;
    vec3 inkCol = vec3(0.06, 0.055, 0.05);
    vec3 painted = mix(paper, inkCol, clamp(ink, 0.0, 1.0));

    // 被数到的物体保留颜色，泛金
    float inside = 1.0 - smoothstep(-0.002, 0.012, boxField(uv));
    vec3 goldPhoto = photo * vec3(1.18, 1.0, 0.72) + vec3(0.06, 0.04, 0.0);
    painted = mix(painted, goldPhoto, inside * uHighlight);

    vec3 col = mix(photo, painted, uInk);
    col *= 1.0 - uDim;

    // 墨潮：从物体处晕开，边缘有淡墨晕圈，最后淹没全屏
    float field = boxField(uv) + (fbm(uv * 5.0 + uTime * 0.1) - 0.5) * 0.18;
    float radius = uFlood * 1.8 - 0.05;
    float flood = smoothstep(radius + 0.03, radius - 0.03, field);
    float halo = smoothstep(radius + 0.12, radius, field) * (1.0 - flood);
    vec3 floodCol = vec3(0.02, 0.018, 0.016);
    col = mix(col, col * 0.55 + vec3(0.02), halo * 0.6 * step(0.001, uFlood));
    col = mix(col, floodCol, flood * step(0.001, uFlood));
    gl_FragColor = vec4(col, 1.0);
  }
`

export class PhotoLayer {
  constructor(paperTexture) {
    this.uniforms = {
      uMap: { value: null },
      uPaper: { value: paperTexture },
      uTexel: { value: new THREE.Vector2(1 / 640, 1 / 480) },
      uUvScale: { value: new THREE.Vector2(1, 1) },
      uUvOffset: { value: new THREE.Vector2(0, 0) },
      uMirror: { value: 0 },
      uInk: { value: 0 },
      uFlood: { value: 0 },
      uDim: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uHighlight: { value: 0 },
      uBoxCount: { value: 0 },
      uBoxes: { value: Array.from({ length: MAX_BOXES }, () => new THREE.Vector4()) },
    }
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, depthWrite: false })
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.object.renderOrder = -10
    this.object.visible = false
    this.sourceSize = { w: 1, h: 1 }
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
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    this.uniforms.uMap.value = tex
    this.uniforms.uMirror.value = mirror ? 1 : 0
    this.uniforms.uTexel.value.set(1 / this.sourceSize.w, 1 / this.sourceSize.h)
    this.object.visible = true
    old?.dispose()
    this.fit()
  }

  resize(w, h) {
    this.view = { w, h }
    this.object.scale.set(w, h, 1)
    this.uniforms.uAspect.value = w / h
    this.fit()
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

  // 源图像素坐标 → 屏幕像素坐标（cover 裁切之后）
  sourceToScreen(x, y) {
    const s = this.uniforms.uUvScale.value
    const o = this.uniforms.uUvOffset.value
    let u = x / this.sourceSize.w
    if (this.uniforms.uMirror.value > 0.5) u = 1 - u
    const v = y / this.sourceSize.h
    return { x: ((u - o.x) / s.x) * this.view.w, y: ((v - o.y) / s.y) * this.view.h }
  }

  screenToSource(x, y) {
    const s = this.uniforms.uUvScale.value
    const o = this.uniforms.uUvOffset.value
    let u = (x / this.view.w) * s.x + o.x
    if (this.uniforms.uMirror.value > 0.5) u = 1 - u
    const v = (y / this.view.h) * s.y + o.y
    return { x: u * this.sourceSize.w, y: v * this.sourceSize.h }
  }

  // boxes：屏幕像素坐标 {x,y,width,height}（左上为原点）
  setBoxes(boxes) {
    const n = Math.min(boxes.length, MAX_BOXES)
    this.uniforms.uBoxCount.value = n
    for (let i = 0; i < n; i++) {
      const b = boxes[i]
      // 着色器里 uv 的 y 向上
      this.uniforms.uBoxes.value[i].set(
        b.x / this.view.w,
        1 - (b.y + b.height) / this.view.h,
        b.width / this.view.w,
        b.height / this.view.h,
      )
    }
  }

  update(dt, time) {
    this.uniforms.uTime.value = time
  }

  dispose() {
    this.uniforms.uMap.value?.dispose()
    this.material.dispose()
  }
}
