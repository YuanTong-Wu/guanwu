// 一块全屏 WebGL 画布承载整场仪式，方便整段录成视频。
// 相机距离算好，使 z=0 平面上 1 个单位 = 1 个 CSS 像素，原点在屏幕中心。
// 画面风格克制：不加辉光、色差、颗粒，只留纸边一点暗角和盖印时的一下震动。
import * as THREE from 'three'

// 全程按"所见即所值"处理颜色：贴图不解码、输出不编码，颜色常量就是屏幕上的颜色。
// 照片定格前后亮度一致，朱砂、纸白也不会发闷。
THREE.ColorManagement.enabled = false

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: 1 },
    uVignette: { value: 0.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAspect, uVignette;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 c = vUv - 0.5;
      // 旧纸四边微微发暗
      float vig = 1.0 - smoothstep(0.35, 0.95, length(c * vec2(uAspect * 0.9, 1.0)));
      col *= mix(1.0, vig, uVignette);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x050505, 1)
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 20000)
    this.shake = 0
    this.time = 0
    this.updaters = new Set()

    // 8 位、无深度缓冲的中间画布就够了：全是平面叠加，不需要半浮点和深度
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false })
    this.composer = new EffectComposer(this.renderer, rt)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.final = new ShaderPass(FinalShader)
    this.composer.addPass(this.final)

    this.resize = this.resize.bind(this)
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  get width() {
    return this.locked ? this.locked.w : this.canvas.clientWidth || window.innerWidth
  }

  get height() {
    return this.locked ? this.locked.h : this.canvas.clientHeight || window.innerHeight
  }

  // 仪式进行和结束画面时锁住画幅：转屏只把画布等比缩放居中，构图和录像都不变形
  lockSize() {
    this.locked = { w: this.width, h: this.height }
  }

  unlockSize() {
    this.locked = null
    this.canvas.style.cssText = ''
    this.resize()
  }

  resize() {
    if (this.locked) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const k = Math.min(vw / this.locked.w, vh / this.locked.h)
      Object.assign(this.canvas.style, {
        width: `${this.locked.w * k}px`,
        height: `${this.locked.h * k}px`,
        left: `${(vw - this.locked.w * k) / 2}px`,
        top: `${(vh - this.locked.h * k) / 2}px`,
      })
      return
    }
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
    for (const fn of this.updaters) fn.resize?.(w, h)
  }

  // 屏幕像素坐标(左上为原点) → 场景坐标(中心为原点，y 向上)
  toScene(x, y) {
    return new THREE.Vector2(x - this.width / 2, this.height / 2 - y)
  }

  // 一下短促的震动，只在盖印这类"砰"的时刻用
  kick(amount = 1) {
    this.shake = Math.min(1, this.shake + amount)
  }

  set vignette(v) {
    this.final.uniforms.uVignette.value = v
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
    // 震动快速衰减，干脆利落
    this.shake = Math.max(0, this.shake - dt * 6)
    const s = this.shake * this.shake * 7
    const t = this.time * 60
    this.camera.position.x = Math.sin(t * 1.3) * s
    this.camera.position.y = Math.cos(t * 1.7) * s
    this.composer.render(dt)
  }
}
