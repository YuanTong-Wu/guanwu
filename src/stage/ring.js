// 邵雍"先天六十四卦圆图"做成的细线转盘（白线黑底）：外圈六十四卦，内圈先天八卦，中心太极。
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
  circle(R * 0.985, 1.2, 0.7)
  circle(R * 0.955, 0.8, 0.4)
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
    drawLines(g, cx, cy, ringAngle(i), R * 0.74, R * 0.032, R * 0.052, h.lines, R * 0.009)
  }
  circle(R * 0.7, 1, 0.5)
  circle(R * 0.68, 0.8, 0.3)
  // 先天八卦 + 卦名
  for (const t of Object.values(TRIGRAMS)) {
    const th = (TRIGRAM_ANGLE[t.num] * Math.PI) / 180
    drawLines(g, cx, cy, th, R * 0.46, R * 0.04, R * 0.1, t.lines, R * 0.012)
    g.save()
    g.font = `${R * 0.05}px ${FONTS.serif}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const nx = cx + Math.cos(th) * R * 0.6
    const ny = cy - Math.sin(th) * R * 0.6
    g.globalAlpha = 0.8
    g.translate(nx, ny)
    g.rotate(Math.PI / 2 - th)
    g.fillText(t.name, 0, 0)
    g.restore()
  }
  circle(R * 0.39, 1, 0.45)
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
  g.lineWidth = 2
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
    vec3 col = mix(uColor * uGlow, vec3(0.72, 0.2, 0.12), clamp(mark, 0.0, 1.0));
    gl_FragColor = vec4(col * a, a);
  }
`

function goldMaterial(texture, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(0xe8e2d4) },
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
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
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
    this.breathe = false
  }

  setDiameter(d) {
    this.diameter = d
    this.ring.scale.set(d, d, 1)
    this.taiji.scale.set(d * 0.2, d * 0.2, 1)
  }

  set opacity(v) {
    this.ringMat.uniforms.uOpacity.value = v
    this.taijiMat.uniforms.uOpacity.value = v * 0.55
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

  update(dt, time = 0) {
    // 像天秩的周天盘：在平面与立体之间缓缓往复
    if (this.breathe) this.tilt = Math.sin(time * 0.21) * 0.62
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
