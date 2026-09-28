// 六道毛笔爻画。阳爻一笔，阴爻两笔；动爻可以"裂开"(阳变阴)或"合拢"(阴变阳)。
import * as THREE from 'three'
import { brushStroke } from './textures.js'

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

// 从左到右"写"出来：显影边缘参差，像笔锋走过
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uReveal;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uHeat;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float edge = uReveal * 1.12 - 0.06 + (hash(vec2(floor(vUv.y * 40.0), 3.0)) - 0.5) * 0.06;
    float shown = smoothstep(edge, edge - 0.04, vUv.x);
    float a = t.a * shown * uOpacity;
    if (a < 0.01) discard;
    // 笔锋最前端最亮，像火线刚走过
    float front = smoothstep(0.1, 0.0, abs(vUv.x - edge)) * step(uReveal, 0.999);
    vec3 col = uColor * uGlow + vec3(1.0, 0.85, 0.5) * front * 2.5;
    // 动爻烧红时的火苗闪烁
    col += vec3(1.0, 0.25, 0.08) * uHeat * (0.7 + 0.3 * sin(uTime * 23.0 + vUv.x * 30.0));
    gl_FragColor = vec4(col * a, a);
  }
`

function strokeMaterial(texture, color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(color) },
      uGlow: { value: 1.3 },
      uHeat: { value: 0 },
      uTime: { value: 0 },
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

export const GOLD = 0xf2c46b
export const CINNABAR = 0xe8412a

export class HexagramLines {
  constructor({ stage, lines, width, gap, y = 0 }) {
    this.stage = stage
    this.lines = lines.slice()
    this.width = width
    this.gap = gap
    this.object = new THREE.Group()
    this.object.position.y = y
    this.object.renderOrder = 10
    this.rows = []
    this.materials = []
    const h = gap * 0.36
    for (let i = 0; i < 6; i++) {
      const row = new THREE.Group()
      row.position.y = this.rowY(i)
      const texFull = brushStroke({ seed: 11 + i * 7, dry: 0.45 })
      const texA = brushStroke({ seed: 101 + i * 13, dry: 0.4 })
      const texB = brushStroke({ seed: 211 + i * 17, dry: 0.4 })
      const full = new THREE.Mesh(new THREE.PlaneGeometry(width, h * 1.75), strokeMaterial(texFull, GOLD))
      const half = width * 0.42
      const left = new THREE.Mesh(new THREE.PlaneGeometry(half, h * 1.75), strokeMaterial(texA, GOLD))
      const right = new THREE.Mesh(new THREE.PlaneGeometry(half, h * 1.75), strokeMaterial(texB, GOLD))
      left.position.x = -width / 2 + half / 2
      right.position.x = width / 2 - half / 2
      row.add(full, left, right)
      this.object.add(row)
      this.rows.push({ row, full, left, right, half })
      this.materials.push(full.material, left.material, right.material)
      this.setYang(i, this.lines[i] === 1)
    }
  }

  rowY(i) {
    return (i - 2.5) * this.gap
  }

  // 该爻上的一个随机落点（场景坐标），给粒子用
  targetFor(i, u, v) {
    const yang = this.lines[i] === 1
    let x = (u - 0.5) * this.width * 0.92
    if (!yang && Math.abs(x) < this.width * 0.09) x = Math.sign(x || 1) * this.width * (0.09 + u * 0.05)
    return { x, y: this.object.position.y + this.rowY(i) + (v - 0.5) * this.gap * 0.3 }
  }

  setYang(i, yang) {
    const r = this.rows[i]
    r.full.visible = yang
    r.left.visible = !yang
    r.right.visible = !yang
  }

  reveal(i, p) {
    const r = this.rows[i]
    r.full.material.uniforms.uReveal.value = p
    // 阴爻两笔先后写
    r.left.material.uniforms.uReveal.value = Math.min(1, p * 2)
    r.right.material.uniforms.uReveal.value = Math.max(0, p * 2 - 1)
  }

  revealAll(p = 1) {
    for (let i = 0; i < 6; i++) this.reveal(i, p)
  }

  heat(i, v) {
    const r = this.rows[i]
    ;[r.full, r.left, r.right].forEach((m) => {
      m.material.uniforms.uHeat.value = v
      m.material.uniforms.uColor.value.lerpColors(new THREE.Color(GOLD), new THREE.Color(CINNABAR), Math.min(1, v))
    })
  }

  // 翻爻动画：p 0→1。阳变阴：从中间裂开、两半弹开；阴变阳：两半撞到一起合成一笔。
  flip(i, p) {
    const r = this.rows[i]
    const wasYang = this.lines[i] === 1
    const open = -this.width / 2 + r.half / 2
    const closed = -r.half / 2
    const setHalves = (x) => {
      r.left.position.x = x
      r.right.position.x = -x
    }
    if (wasYang) {
      if (p < 0.15) {
        this.setYang(i, true)
        r.full.scale.x = 1 + Math.sin(p * 90) * 0.025
        return
      }
      this.setYang(i, false)
      r.left.material.uniforms.uReveal.value = 1
      r.right.material.uniforms.uReveal.value = 1
      const q = (p - 0.15) / 0.85
      const c1 = 2.4
      const e = 1 + (c1 + 1) * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2)
      setHalves(closed + (open - closed) * e)
    } else {
      const q = Math.min(1, p / 0.6)
      setHalves(open + (closed - open) * q * q)
      if (p >= 0.6) {
        this.setYang(i, true)
        r.full.material.uniforms.uReveal.value = 1
        r.full.scale.x = 1 + Math.sin((p - 0.6) * 35) * 0.04 * (1 - p)
      }
    }
    if (p >= 1) this.lines[i] = wasYang ? 0 : 1
  }

  update(dt, time) {
    for (const m of this.materials) m.uniforms.uTime.value = time
  }

  dispose() {
    this.materials.forEach((m) => {
      m.uniforms.uMap.value.dispose()
      m.dispose()
    })
    this.object.traverse((o) => o.geometry?.dispose())
  }
}
