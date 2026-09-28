// 取景时叠在画面上的细笔框：每个被识别的东西四角一笔，旁边一个中文数字。
import * as THREE from 'three'
import { brushCorner, release } from './textures.js'
import { Sprite } from './sprites.js'
import { spriteMaterial } from './sprites.js'
import { toChinese } from '../core/numerals.js'

const WHITE = 0xece5d4

class Frame {
  constructor(cornerTex, index) {
    this.object = new THREE.Group()
    this.corners = []
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMaterial(cornerTex, WHITE))
      m.rotation.z = [0, -Math.PI / 2, Math.PI, Math.PI / 2][k]
      this.object.add(m)
      this.corners.push(m)
    }
    this.number = Sprite.text(toChinese(index + 1), 38, WHITE, { size: 200, cache: true })
    this.object.add(this.number.object)
    this.cur = null
    this.life = 0
    this.alive = true
  }

  // box：场景坐标系中心点和宽高
  place(box) {
    const snap = !this.cur
    this.target = box
    if (snap) this.cur = { ...box }
  }

  update(dt) {
    this.life += dt
    const k = Math.min(1, dt * 14)
    const c = this.cur
    const t = this.target
    c.cx += (t.cx - c.cx) * k
    c.cy += (t.cy - c.cy) * k
    c.w += (t.w - c.w) * k
    c.h += (t.h - c.h) * k
    const s = Math.max(18, Math.min(c.w, c.h) * 0.22)
    const pos = [
      [c.cx - c.w / 2 + s / 2, c.cy + c.h / 2 - s / 2],
      [c.cx + c.w / 2 - s / 2, c.cy + c.h / 2 - s / 2],
      [c.cx + c.w / 2 - s / 2, c.cy - c.h / 2 + s / 2],
      [c.cx - c.w / 2 + s / 2, c.cy - c.h / 2 + s / 2],
    ]
    // 出现时从外往里收，像笔刷扫出来
    const appear = Math.min(1, this.life / 0.25)
    const grow = 1 + (1 - appear) * 0.35
    this.corners.forEach((m, i) => {
      m.position.set(c.cx + (pos[i][0] - c.cx) * grow, c.cy + (pos[i][1] - c.cy) * grow, 0)
      m.scale.set(s, s, 1)
      m.material.uniforms.uOpacity.value = appear * (this.alive ? 1 : 0)
    })
    this.number.object.position.set(c.cx - c.w / 2 + 6, c.cy + c.h / 2 + 26, 0)
    this.number.opacity = appear
  }

  dispose() {
    this.corners.forEach((m) => {
      m.material.dispose()
      m.geometry.dispose()
    })
    this.number.dispose()
  }
}

export class ScanOverlay {
  constructor(stage) {
    this.stage = stage
    this.object = new THREE.Group()
    this.object.renderOrder = 30
    this.cornerTex = brushCorner()
    this.frames = []
    this.onNewFrame = null
  }

  // boxes：屏幕像素 {x,y,width,height}，已按从左到右排好
  setBoxes(boxes) {
    while (this.frames.length < boxes.length) {
      const f = new Frame(this.cornerTex, this.frames.length)
      this.frames.push(f)
      this.object.add(f.object)
      this.onNewFrame?.(this.frames.length)
    }
    while (this.frames.length > boxes.length) {
      const f = this.frames.pop()
      this.object.remove(f.object)
      f.dispose()
    }
    boxes.forEach((b, i) => {
      const c = this.stage.toScene(b.x + b.width / 2, b.y + b.height / 2)
      this.frames[i].place({ cx: c.x, cy: c.y, w: b.width, h: b.height })
    })
  }

  update(dt) {
    this.frames.forEach((f) => f.update(dt))
  }

  clear() {
    this.setBoxes([])
  }

  dispose() {
    this.clear()
    release(this.cornerTex)
  }
}
