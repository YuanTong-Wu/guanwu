// 邵雍"先天六十四卦圆图"做成的金色转盘：外圈六十四卦，内圈先天八卦，中心太极。
// 梅花易数相传出自邵雍，所以用他的圆图作为整场仪式的背景仪器。
import * as THREE from 'three'
import { HEXAGRAMS, TRIGRAMS } from '../core/hexagrams.js'
import { FONTS } from './textures.js'

// 先天序：下卦先天数为主，上卦为次
export function xiantianIndex(hex) {
  return (hex.lower - 1) * 8 + (hex.upper - 1)
}

// 圆图上的角度（弧度，数学坐标，0 在右，逆时针为正）：乾在正上，左半圈乾→复，右半圈姤→坤
export function ringAngle(index) {
  const step = Math.PI / 32
  return index < 32 ? Math.PI / 2 + (index + 0.5) * step : Math.PI / 2 - (index - 32 + 0.5) * step
}

const TRIGRAM_ANGLE = { 1: 90, 2: 135, 3: 180, 4: 225, 5: 45, 6: 0, 7: 315, 8: 270 }

function drawLines(g, cx, cy, theta, r0, step, len, lines, thick) {
  const tx = -Math.sin(theta)
  const ty = -Math.cos(theta)
  lines.forEach((yang, k) => {
    const r = r0 + k * step
    const x = cx + Math.cos(theta) * r
    const y = cy - Math.sin(theta) * r
    const seg = (a, b) => {
      g.beginPath()
      g.moveTo(x + tx * len * a, y + ty * len * a)
      g.lineTo(x + tx * len * b, y + ty * len * b)
      g.stroke()
    }
    g.lineWidth = thick
    if (yang) seg(-0.5, 0.5)
    else {
      seg(-0.5, -0.1)
      seg(0.1, 0.5)
    }
  })
}

function ringCanvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const R = size / 2
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  g.lineCap = 'butt'

  const circle = (r, w, a = 1) => {
    g.globalAlpha = a
    g.lineWidth = w
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.stroke()
    g.globalAlpha = 1
  }
  circle(R * 0.985, 2, 0.8)
  circle(R * 0.955, 1, 0.5)
  // 刻度：64 格
  for (let i = 0; i < 64; i++) {
    const a = ringAngle(i) + Math.PI / 64
    g.globalAlpha = 0.55
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * R * 0.955, cy - Math.sin(a) * R * 0.955)
    g.lineTo(cx + Math.cos(a) * R * 0.985, cy - Math.sin(a) * R * 0.985)
    g.stroke()
  }
  g.globalAlpha = 1
  // 六十四卦
  for (const h of HEXAGRAMS) {
    const i = xiantianIndex(h)
    drawLines(g, cx, cy, ringAngle(i), R * 0.72, R * 0.036, R * 0.068, h.lines, R * 0.017)
  }
  circle(R * 0.69, 1.5, 0.6)
  circle(R * 0.665, 1, 0.35)
  // 先天八卦 + 卦名
  for (const t of Object.values(TRIGRAMS)) {
    const th = (TRIGRAM_ANGLE[t.num] * Math.PI) / 180
    drawLines(g, cx, cy, th, R * 0.44, R * 0.055, R * 0.17, t.lines, R * 0.028)
    g.save()
    g.font = `${R * 0.085}px ${FONTS.brush}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const nx = cx + Math.cos(th) * R * 0.6
    const ny = cy - Math.sin(th) * R * 0.6
    g.translate(nx, ny)
    g.rotate(Math.PI / 2 - th)
    g.fillText(t.name, 0, 0)
    g.restore()
  }
  circle(R * 0.39, 1.5, 0.6)
  return c
}

function taijiCanvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = size / 2 - 4
  const cx = size / 2
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  g.lineWidth = 3
  g.beginPath()
  g.arc(cx, cx, r, 0, Math.PI * 2)
  g.stroke()
  // 阳鱼
  g.beginPath()
  g.arc(cx, cx, r, -Math.PI / 2, Math.PI / 2)
  g.arc(cx, cx + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true)
  g.arc(cx, cx - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false)
  g.fill()
  // 鱼眼
  g.beginPath()
  g.arc(cx, cx - r / 2, r / 7, 0, Math.PI * 2)
  g.globalCompositeOperation = 'destination-out'
  g.fill()
  g.globalCompositeOperation = 'source-over'
  g.beginPath()
  g.arc(cx, cx + r / 2, r / 7, 0, Math.PI * 2)
  g.fill()
  return c
}

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uSweep;
  uniform float uMark;
  uniform float uMarkAngle;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uMap, vUv).a * uOpacity;
    vec2 p = vUv - 0.5;
    float ang = atan(p.y, p.x);
    // 点亮扫描：从乾位顺着转一圈
    float sweep = smoothstep(uSweep * 6.2832 - 0.6, uSweep * 6.2832, mod(1.5708 - ang + 6.2832, 6.2832));
    a *= 1.0 - sweep * step(uSweep, 0.999);
    // 结果所在的卦位高亮
    float d = abs(mod(ang - uMarkAngle + 3.1416, 6.2832) - 3.1416);
    float mark = uMark * smoothstep(0.08, 0.0, d) * step(0.34, length(p));
    if (a < 0.01) discard;
    vec3 col = uColor * uGlow + vec3(1.0, 0.35, 0.15) * mark * 3.0;
    gl_FragColor = vec4(col * a, a);
  }
`

function goldMaterial(texture, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(0xd9a94e) },
      uOpacity: { value: opacity },
      uGlow: { value: 1.0 },
      uSweep: { value: 1 },
      uMark: { value: 0 },
      uMarkAngle: { value: 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
}

// 十二地支时辰盘：子在正上，顺时针排开
const BRANCH_CHARS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

function branchCanvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const cx = size / 2
  const R = size / 2
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  g.lineWidth = 3
  g.beginPath()
  g.arc(cx, cx, R * 0.97, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = 1.5
  g.beginPath()
  g.arc(cx, cx, R * 0.62, 0, Math.PI * 2)
  g.stroke()
  g.font = `${R * 0.2}px ${FONTS.brush}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  BRANCH_CHARS.forEach((ch, i) => {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2
    // 分隔刻度
    const b = a + Math.PI / 12
    g.beginPath()
    g.moveTo(cx + Math.cos(b) * R * 0.62, cx + Math.sin(b) * R * 0.62)
    g.lineTo(cx + Math.cos(b) * R * 0.97, cx + Math.sin(b) * R * 0.97)
    g.stroke()
    g.save()
    g.translate(cx + Math.cos(a) * R * 0.8, cx + Math.sin(a) * R * 0.8)
    g.rotate(a + Math.PI / 2)
    g.fillText(ch, 0, 0)
    g.restore()
  })
  return c
}

export class BranchRing {
  constructor({ diameter }) {
    const tex = new THREE.CanvasTexture(branchCanvas(1024))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    this.mat = goldMaterial(tex, 0)
    this.mat.uniforms.uColor.value.set(0xf2c46b)
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat)
    this.object.scale.set(diameter, diameter, 1)
    this.object.renderOrder = 3
    this.spin = 0
    this.target = null
  }

  set opacity(v) {
    this.mat.uniforms.uOpacity.value = v
  }

  set glow(v) {
    this.mat.uniforms.uGlow.value = v
  }

  // 转几圈后把第 index 个地支停在正上方，并点亮它
  spinTo(index, turns = 3) {
    // 第 index 支在盘面上的角度是 π/2 - index·30°，逆时针转 index·30° 就到正上方
    let t = (index / 12) * Math.PI * 2
    while (t < this.object.rotation.z + turns * Math.PI * 2) t += Math.PI * 2
    this.target = t
    this.mat.uniforms.uMarkAngle.value = Math.PI / 2 - (index / 12) * Math.PI * 2
  }

  set mark(v) {
    this.mat.uniforms.uMark.value = v
  }

  update(dt) {
    if (this.target != null) {
      const r = this.object.rotation
      r.z += (this.target - r.z) * Math.min(1, dt * 3.2)
    } else {
      this.object.rotation.z += dt * 0.3
    }
  }

  dispose() {
    this.mat.uniforms.uMap.value.dispose()
    this.mat.dispose()
    this.object.geometry.dispose()
  }
}

export class BaguaRing {
  constructor({ diameter }) {
    const tex = new THREE.CanvasTexture(ringCanvas(2048))
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const tj = new THREE.CanvasTexture(taijiCanvas(512))
    tj.colorSpace = THREE.SRGBColorSpace
    this.ringMat = goldMaterial(tex, 0)
    this.taijiMat = goldMaterial(tj, 0)
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ringMat)
    this.taiji = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.taijiMat)
    this.object = new THREE.Group()
    this.spinner = new THREE.Group()
    this.spinner.add(this.ring)
    this.object.add(this.spinner, this.taiji)
    this.object.renderOrder = 2
    this.setDiameter(diameter)
    this.speed = 0.05
    this.targetRotation = null
    this.tilt = 0
  }

  setDiameter(d) {
    this.diameter = d
    this.ring.scale.set(d, d, 1)
    this.taiji.scale.set(d * 0.2, d * 0.2, 1)
  }

  set opacity(v) {
    this.ringMat.uniforms.uOpacity.value = v
    this.taijiMat.uniforms.uOpacity.value = v * 0.9
  }

  set glow(v) {
    this.ringMat.uniforms.uGlow.value = v
    this.taijiMat.uniforms.uGlow.value = v
  }

  set sweep(v) {
    this.ringMat.uniforms.uSweep.value = v
  }

  // 让某一卦转到正上方并点亮
  focus(hex) {
    const a = ringAngle(xiantianIndex(hex))
    this.ringMat.uniforms.uMarkAngle.value = a
    let target = Math.PI / 2 - a
    const cur = this.spinner.rotation.z
    // 至少再多转一圈，更有气势
    while (target < cur + Math.PI * 2) target += Math.PI * 2
    this.targetRotation = target
  }

  set mark(v) {
    this.ringMat.uniforms.uMark.value = v
  }

  update(dt) {
    if (this.targetRotation != null) {
      const r = this.spinner.rotation
      r.z += (this.targetRotation - r.z) * Math.min(1, dt * 2.2)
      if (Math.abs(this.targetRotation - r.z) < 0.0005) r.z = this.targetRotation
    } else {
      this.spinner.rotation.z += dt * this.speed
    }
    this.taiji.rotation.z -= dt * (0.4 + this.speed * 4)
    this.object.rotation.x = this.tilt
  }

  dispose() {
    ;[this.ringMat, this.taijiMat].forEach((m) => {
      m.uniforms.uMap.value.dispose()
      m.dispose()
    })
    this.ring.geometry.dispose()
    this.taiji.geometry.dispose()
  }
}
