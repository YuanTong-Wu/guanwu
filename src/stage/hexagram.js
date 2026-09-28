// 六道毛笔爻画，黑底白墨。阳爻一笔，阴爻两笔，都是从左往右"写"出来的。
// 动爻：先由朱笔圈出（阳爻画圈，阴爻打叉，依旧时六爻记法），停一停，再变。
import * as THREE from 'three'
import { brushStroke, brushCircle, brushCross, release } from './textures.js'
import { Sprite } from './sprites.js'

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReveal;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float a = texture2D(uMap, vUv).a * uOpacity;
    // 笔锋走过的地方才显出来，前沿参差
    float edge = uReveal * 1.1 - 0.05 + (hash(vec2(floor(vUv.y * 40.0), 3.0)) - 0.5) * 0.05;
    a *= 1.0 - smoothstep(edge - 0.035, edge, vUv.x);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`

function strokeMaterial(texture, color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
}

export const INK_WHITE = 0xece5d4
export const CINNABAR = 0xb8321f

export class HexagramLines {
  constructor({ lines, width, gap, x = 0, y = 0, color = INK_WHITE }) {
    this.lines = lines.slice()
    this.width = width
    this.gap = gap
    this.object = new THREE.Group()
    this.object.position.set(x, y, 0)
    this.object.renderOrder = 10
    this.rows = []
    this.materials = []
    const h = gap * 0.3
    for (let i = 0; i < 6; i++) {
      const row = new THREE.Group()
      row.position.y = this.rowY(i)
      const half = width * 0.43
      const full = new THREE.Mesh(new THREE.PlaneGeometry(width, h * 1.75), strokeMaterial(brushStroke({ seed: 11 + i * 7, dry: 0.55 }), color))
      const left = new THREE.Mesh(new THREE.PlaneGeometry(half, h * 1.75), strokeMaterial(brushStroke({ seed: 101 + i * 13, dry: 0.5 }), color))
      const right = new THREE.Mesh(new THREE.PlaneGeometry(half, h * 1.75), strokeMaterial(brushStroke({ seed: 211 + i * 17, dry: 0.5 }), color))
      left.position.x = -width / 2 + half / 2
      right.position.x = width / 2 - half / 2
      row.add(full, left, right)
      this.object.add(row)
      this.rows.push({ row, full, left, right, half })
      this.materials.push(full.material, left.material, right.material)
      this.setYang(i, this.lines[i] === 1)
    }
    this.mark = null
  }

  rowY(i) {
    return (i - 2.5) * this.gap
  }

  // 第 i 爻（0 起，自下而上）在场景里的位置
  rowPosition(i) {
    return { x: this.object.position.x, y: this.object.position.y + this.rowY(i) }
  }

  setYang(i, yang) {
    const r = this.rows[i]
    r.full.visible = yang
    r.left.visible = !yang
    r.right.visible = !yang
  }

  // 写一爻：p 0→1。阴爻两笔先后写
  reveal(i, p) {
    const r = this.rows[i]
    r.full.material.uniforms.uReveal.value = p
    r.left.material.uniforms.uReveal.value = Math.min(1, p * 1.9)
    r.right.material.uniforms.uReveal.value = Math.max(0, p * 1.9 - 0.9)
  }

  revealAll(p = 1) {
    for (let i = 0; i < 6; i++) this.reveal(i, p)
  }

  set opacity(v) {
    for (const m of this.materials) m.uniforms.uOpacity.value = v
  }

  // 朱笔记动爻：阳爻画圈，阴爻打叉，记在这一爻右边
  addMark(i, size) {
    const yang = this.lines[i] === 1
    const tex = yang ? brushCircle() : brushCross()
    const s = Sprite.image(tex, size, CINNABAR, { order: 12, dir: yang ? 2 : 0 })
    s.reveal = 0
    s.object.position.set(this.width / 2 + size * 0.75, this.rowY(i), 0)
    this.object.add(s.object)
    this.mark = s
    return s
  }

  // 变爻：p 0→1。阳变阴：笔画从中间断开，两半各退一步；阴变阳：两笔合成一笔。干脆，不弹跳。
  flip(i, p) {
    const r = this.rows[i]
    const wasYang = this.lines[i] === 1
    const open = -this.width / 2 + r.half / 2
    const closed = -r.half / 2 - this.width * 0.004
    const place = (x) => {
      r.left.position.x = x
      r.right.position.x = -x
    }
    const e = 1 - Math.pow(1 - Math.min(1, p), 3)
    if (wasYang) {
      this.setYang(i, false)
      r.left.material.uniforms.uReveal.value = 1
      r.right.material.uniforms.uReveal.value = 1
      place(closed + (open - closed) * e)
    } else {
      place(open + (closed - open) * e)
      if (p >= 1) {
        this.setYang(i, true)
        r.full.material.uniforms.uReveal.value = 1
      }
    }
    if (p >= 1) this.lines[i] = wasYang ? 0 : 1
  }

  dispose() {
    this.materials.forEach((m) => {
      release(m.uniforms.uMap.value)
      m.dispose()
    })
    this.mark?.dispose()
    this.object.traverse((o) => o.geometry?.dispose())
  }
}
