// 一块全屏 WebGL 画布承载整场仪式，方便整段录成视频。
// 相机距离算好，使 z=0 平面上 1 个单位 = 1 个 CSS 像素，原点在屏幕中心。
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

const MAX_WAVES = 4

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uWaves: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, -1, 0)) },
    uAberration: { value: 0 },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.035 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uAberration, uVignette, uGrain;
    uniform vec4 uWaves[${MAX_WAVES}];
    uniform vec4 uFlash;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      // 冲击波：x,y 为圆心(uv)，z 为已过去的时间(秒)，w 为强度
      for (int i = 0; i < ${MAX_WAVES}; i++) {
        vec4 w = uWaves[i];
        if (w.z < 0.0) continue;
        vec2 d = uv - w.xy; d.x *= uAspect;
        float dist = length(d);
        float radius = w.z * 1.35;
        float band = 0.09 + w.z * 0.05;
        float x = (dist - radius) / band;
        float falloff = exp(-x * x) * w.w * (1.0 - smoothstep(0.4, 1.2, w.z));
        vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
        dir.x /= uAspect;
        uv -= dir * falloff * 0.035;
      }
      vec2 c = uv - 0.5;
      float ab = uAberration * (0.4 + dot(c, c) * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ab).b;
      col = mix(col, uFlash.rgb, uFlash.a);
      float vig = smoothstep(0.95, 0.2, length(c * vec2(uAspect * 0.9, 1.0)));
      col *= mix(1.0, vig, uVignette);
      col += (hash(vUv * 900.0 + fract(uTime) * 37.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x050505, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 20000)
    this.shake = 0
    this.shakeSeed = Math.random() * 100
    this.waves = []
    this.time = 0
    this.updaters = new Set()

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // 阈值取高：只有金线、金粒、朱印这些"发光"的东西才起辉光，宣纸不泛白
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.42, 0.72)
    this.composer.addPass(this.bloom)
    // 先转到显示色彩空间，再做颗粒、暗角、冲击波，否则颗粒在线性空间里会被放大成一片灰
    this.composer.addPass(new OutputPass())
    this.final = new ShaderPass(FinalShader)
    this.composer.addPass(this.final)

    this.resize = this.resize.bind(this)
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  get width() {
    return this.canvas.clientWidth || window.innerWidth
  }

  get height() {
    return this.canvas.clientHeight || window.innerHeight
  }

  resize() {
    const w = this.width
    const h = this.height
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.cameraDistance = h / 2 / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    this.camera.position.set(0, 0, this.cameraDistance)
    this.camera.near = this.cameraDistance / 20
    this.camera.far = this.cameraDistance * 20
    this.camera.updateProjectionMatrix()
    this.final.uniforms.uAspect.value = w / h
    this.bloom.resolution.set(w / 2, h / 2)
    for (const fn of this.updaters) fn.resize?.(w, h)
  }

  // 屏幕像素坐标(左上为原点) → 场景坐标(中心为原点，y 向上)
  toScene(x, y) {
    return new THREE.Vector2(x - this.width / 2, this.height / 2 - y)
  }

  // 冲击波：x,y 为场景坐标
  shockwave(x, y, strength = 1) {
    const u = x / this.width + 0.5
    const v = y / this.height + 0.5
    this.waves.push({ u, v, t: 0, s: strength })
    if (this.waves.length > MAX_WAVES) this.waves.shift()
  }

  kick(amount = 1) {
    this.shake = Math.min(1.5, this.shake + amount)
  }

  flash(r, g, b, a) {
    this.final.uniforms.uFlash.value.set(r, g, b, a)
  }

  add(updater) {
    this.updaters.add(updater)
    if (updater.object) this.scene.add(updater.object)
    updater.resize?.(this.width, this.height)
    return updater
  }

  remove(updater) {
    this.updaters.delete(updater)
    if (updater.object) this.scene.remove(updater.object)
    updater.dispose?.()
  }

  frame(dt) {
    this.time += dt
    for (const u of this.updaters) u.update?.(dt, this.time)

    // 震屏：衰减的噪声抖动
    this.shake = Math.max(0, this.shake - dt * 2.8)
    const s = this.shake * this.shake * 18
    const t = this.time * 40 + this.shakeSeed
    this.camera.position.x = Math.sin(t * 1.3) * s
    this.camera.position.y = Math.cos(t * 1.7) * s
    this.camera.rotation.z = Math.sin(t * 0.9) * s * 0.0015

    const u = this.final.uniforms
    u.uTime.value = this.time
    this.waves = this.waves.filter((w) => (w.t += dt) < 1.4)
    u.uWaves.value.forEach((vec, i) => {
      const w = this.waves[i]
      if (w) vec.set(w.u, w.v, w.t, w.s)
      else vec.set(0, 0, -1, 0)
    })
    const f = u.uFlash.value
    f.w = Math.max(0, f.w - dt * 3.2)
    u.uAberration.value = Math.max(0.004, u.uAberration.value - dt * 0.12)

    this.composer.render(dt)
  }

  aberrate(amount) {
    this.final.uniforms.uAberration.value = Math.max(this.final.uniforms.uAberration.value, amount)
  }
}
