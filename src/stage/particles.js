// 被数到的物体炸成金墨粒子：爆开 → 太极式回旋 → 一爻一爻汇聚成六道笔画。
// 运动全部在顶点着色器里按统一进度算，几万颗粒子在手机上也流畅。
import * as THREE from 'three'

const vert = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aTarget;
  attribute vec4 aSeed;
  attribute vec3 aColor;
  attribute float aLine;
  uniform float uBurst;
  uniform float uSwirl;
  uniform float uGather;
  uniform float uTime;
  uniform float uSize;
  uniform float uGold;
  uniform float uFade;
  uniform vec2 uCenter;
  varying vec3 vColor;
  varying float vAlpha;

  vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

  void main() {
    // 1. 爆开：从物体处向外，带一点朝镜头的纵深
    float ang = aSeed.x * 6.2831;
    float dist = 30.0 + pow(aSeed.y, 1.6) * 280.0;
    vec3 burstPos = aStart + vec3(cos(ang) * dist, sin(ang) * dist, (aSeed.z - 0.3) * 520.0);
    float b = 1.0 - pow(1.0 - clamp(uBurst, 0.0, 1.0), 3.0);
    vec3 p = mix(aStart, burstPos, b);

    // 2. 回旋：绕中心卷成一个旋涡，半径收拢，像墨在水里打转
    float s = clamp(uSwirl, 0.0, 1.0);
    vec2 rel = p.xy - uCenter;
    float spin = s * (4.0 + aSeed.w * 3.0) / (0.6 + length(rel) / 400.0);
    rel = rot(rel, spin);
    // 收成一个扁平的旋涡盘，半径 60–220 像素
    float targetR = 60.0 + aSeed.y * 160.0;
    float r0 = max(1.0, length(rel));
    float shrink = mix(1.0, targetR / r0, smoothstep(0.0, 1.0, s));
    p.xy = uCenter + rel * shrink;
    p.z *= 1.0 - 0.85 * s;
    p.y += sin(uTime * 3.0 + aSeed.x * 30.0) * 6.0 * s;

    // 3. 汇聚：按爻位依次落到笔画上，下爻先到
    float g = clamp(uGather - aLine - aSeed.w * 0.35, 0.0, 1.0);
    g = g * g * (3.0 - 2.0 * g);
    p = mix(p, aTarget, g);

    vec3 gold = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.78, 0.38), aSeed.z);
    vColor = mix(aColor, gold, uGold) * (0.8 + 1.4 * g * (1.0 - g) * 4.0);
    vAlpha = (1.0 - uFade) * (0.35 + 0.45 * aSeed.y);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.7 + 0.3 * sin(uTime * 9.0 + aSeed.x * 50.0);
    gl_PointSize = uSize * (0.5 + aSeed.y) * twinkle * (1.0 + b * (1.0 - s) * 0.8) * (1200.0 / -mv.z);
  }
`

const frag = /* glsl */ `
  uniform sampler2D uDot;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = texture2D(uDot, gl_PointCoord).a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`

export class Particles {
  // boxes: [{x,y,width,height}] 屏幕像素框；image: 定格画面 canvas；toSource: 屏幕像素 → 画面像素；
  // lineTargets: 每爻上的落点生成函数
  constructor({ stage, image, toSource, boxes, lineTargets, dotTexture, count = 16000, targetLines = [0, 1, 2, 3, 4, 5] }) {
    this.stage = stage
    const ctx = image.getContext('2d', { willReadFrequently: true })
    const px = ctx.getImageData(0, 0, image.width, image.height).data

    const start = new Float32Array(count * 3)
    const target = new Float32Array(count * 3)
    const seed = new Float32Array(count * 4)
    const color = new Float32Array(count * 3)
    const line = new Float32Array(count)
    const perBox = Math.floor(count / Math.max(1, boxes.length))

    for (let i = 0; i < count; i++) {
      const b = boxes[Math.min(boxes.length - 1, Math.floor(i / perBox))]
      // 框内取点，越靠中心越密（物体多在框中央）
      const gx = 0.5 + (Math.random() + Math.random() + Math.random() - 1.5) / 3
      const gy = 0.5 + (Math.random() + Math.random() + Math.random() - 1.5) / 3
      const x = b.x + gx * b.width
      const y = b.y + gy * b.height
      const p = stage.toScene(x, y)
      start.set([p.x, p.y, 0], i * 3)
      const src = toSource(x, y)
      const ix = Math.min(image.width - 1, Math.max(0, Math.round(src.x)))
      const iy = Math.min(image.height - 1, Math.max(0, Math.round(src.y)))
      const k = (iy * image.width + ix) * 4
      color.set([px[k] / 255, px[k + 1] / 255, px[k + 2] / 255], i * 3)
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
      const li = targetLines[i % targetLines.length]
      line[i] = li
      const t = lineTargets(li, Math.random(), Math.random())
      target.set([t.x, t.y, 0], i * 3)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3))
    geo.setAttribute('aTarget', new THREE.BufferAttribute(target, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('aLine', new THREE.BufferAttribute(line, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.uniforms = {
      uBurst: { value: 0 },
      uSwirl: { value: 0 },
      uGather: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 4.2 * stage.renderer.getPixelRatio() },
      uGold: { value: 0 },
      uFade: { value: 0 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uDot: { value: dotTexture },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    this.object = new THREE.Points(geo, this.material)
    this.object.renderOrder = 5
    this.object.frustumCulled = false
  }

  update(dt, time) {
    this.uniforms.uTime.value = time
  }

  dispose() {
    this.object.geometry.dispose()
    this.material.dispose()
  }
}
