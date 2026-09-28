// 少而准的点缀：一滴墨落下、几点溅墨、盖印后飘落的几片金箔。
import * as THREE from 'three'
import { inkDot, goldFlake, release } from './textures.js'
import { spriteMaterial } from './sprites.js'

const INK = 0x0d0b09

// 一滴墨从画面上方落到 (x, y)。progress 0→1 是下落，落地后返回 true。
export class InkDrop {
  constructor({ x, y, fromY, size = 14 }) {
    this.tex = inkDot()
    this.material = spriteMaterial(this.tex, INK)
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.object.renderOrder = 40
    this.x = x
    this.y = y
    this.fromY = fromY
    this.size = size
    this.fall(0)
    this.object.visible = false
  }

  // 自由落体：越落越快，快的时候被拉长一点
  fall(p) {
    this.object.visible = p > 0 && p < 1
    const e = p * p
    const y = this.fromY + (this.y - this.fromY) * e
    const stretch = 1 + p * 1.2
    this.object.position.set(this.x, y + (this.size * stretch) / 2, 0)
    this.object.scale.set(this.size / Math.sqrt(stretch), this.size * stretch, 1)
  }

  dispose() {
    release(this.tex)
    this.material.dispose()
    this.object.geometry.dispose()
  }
}

// 落点四周溅开的几点墨，随留白一起淡去
export class Spatter {
  constructor({ x, y, count = 7, spread = 60, seed = 1 }) {
    this.object = new THREE.Group()
    this.object.renderOrder = 39
    this.tex = inkDot({ seed: seed + 5 })
    this.dots = []
    let s = seed * 9301 + 49297
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMaterial(this.tex, INK))
      const a = rnd() * Math.PI * 2
      const r = spread * (0.35 + rnd() * 0.8)
      const size = 2 + rnd() * 5
      m.position.set(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, 0)
      m.scale.set(size, size * (0.8 + rnd() * 0.4), 1)
      this.object.add(m)
      this.dots.push(m)
    }
    this.opacity = 0
  }

  set opacity(v) {
    for (const m of this.dots) m.material.uniforms.uOpacity.value = v
  }

  dispose() {
    release(this.tex)
    this.dots.forEach((m) => {
      m.material.dispose()
      m.geometry.dispose()
    })
  }
}

// 金箔：盖印那一下震起来，慢慢飘落到纸上停住，翻转时一明一暗
export class GoldFlakes {
  constructor({ rect, count = 11, seed = 3 }) {
    this.object = new THREE.Group()
    this.object.renderOrder = 45
    this.flakes = []
    let s = seed * 7919 + 17
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < count; i++) {
      const tex = goldFlake({ seed: seed * 31 + i * 7 })
      const mat = spriteMaterial(tex, 0xd4a84a)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      const size = 4 + rnd() * 7
      const tx = rect.x + rnd() * rect.w
      const ty = rect.y - rnd() * rect.h
      this.flakes.push({
        m,
        tex,
        size,
        x0: tx + (rnd() - 0.5) * 60,
        y0: ty + 90 + rnd() * 120,
        tx,
        ty,
        spin: 2 + rnd() * 5,
        phase: rnd() * 6.28,
        delay: rnd() * 0.5,
      })
      m.visible = false
      this.object.add(m)
    }
    this.t = -1
  }

  start() {
    this.t = 0
  }

  update(dt) {
    if (this.t < 0) return
    this.t += dt
    for (const f of this.flakes) {
      const t = Math.max(0, this.t - f.delay)
      f.m.visible = true
      // 飘落约 2.4 秒，越来越慢，左右轻摆
      const p = Math.min(1, t / 2.4)
      const e = 1 - Math.pow(1 - p, 2.2)
      const sway = Math.sin(t * 2.2 + f.phase) * 14 * (1 - p)
      f.m.position.set(f.x0 + (f.tx - f.x0) * e + sway, f.y0 + (f.ty - f.y0) * e, 0)
      const flip = Math.cos(t * f.spin * (1 - p * 0.9) + f.phase)
      f.m.scale.set(f.size * (0.25 + 0.75 * Math.abs(flip)), f.size, 1)
      f.m.rotation.z = f.phase + t * 0.6 * (1 - p)
      // 翻到正面时亮一下
      const glint = 0.75 + 0.5 * Math.pow(Math.abs(flip), 6)
      f.m.material.uniforms.uColor.value.setRGB(0.86 * glint, 0.7 * glint, 0.36 * glint)
      f.m.material.uniforms.uOpacity.value = Math.min(1, t * 4)
    }
  }

  dispose() {
    this.flakes.forEach((f) => {
      release(f.tex)
      f.m.material.dispose()
      f.m.geometry.dispose()
    })
  }
}
