// 运行时用 Canvas2D 画出所有纹理：笔触、宣纸、朱印、书法字。整个项目不需要一张图片。
import * as THREE from 'three'

export const FONTS = {
  brush: '"WQ Brush", "WQ Serif", "Kaiti SC", "STKaiti", "KaiTi", serif',
  serif: '"WQ Serif", "Songti SC", "STSong", "Noto Serif SC", serif',
}

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  return t
}

// 一道横向毛笔笔画：起笔顿、行笔带飞白、收笔回锋。白色画在透明底上，颜色交给材质。
export function brushStroke({ width = 1024, height = 160, seed = 1, dry = 0.5 } = {}) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const g = c.getContext('2d')
  const r = rng(seed)
  const mid = height / 2
  const body = height * 0.3
  g.fillStyle = '#fff'
  // 主体：沿笔路铺几十根"笔毛"。每根毛带的墨沿笔路递减，墨尽处断开，形成飞白；
  // 越靠笔锋两侧越容易先干。
  const hairs = 64
  const steps = 160
  for (let h = 0; h < hairs; h++) {
    const off = (h / (hairs - 1) - 0.5) * 2
    const y0 = mid + off * body
    const thick = 1.4 + r() * 3.2
    const load = 1.25 - Math.abs(off) * 0.55 * dry - r() * 0.35 * dry
    const drain = (0.35 + r() * 0.9) * dry
    const phase = r() * 100
    const wobble = (r() - 0.5) * height * 0.03
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // 起笔处压得宽，收笔处略收
      const press = t < 0.08 ? 0.78 + t * 2.75 : t > 0.9 ? 1 - (t - 0.9) * 3.5 : 1
      if (Math.abs(off) > press) continue
      const ink = load - t * drain + (Math.sin(t * 37 + phase) * 0.5 + Math.sin(t * 91 + phase * 2) * 0.35) * 0.25 * dry
      if (ink < 0.45) continue
      g.globalAlpha = Math.min(1, 0.35 + ink * 0.6)
      const x = width * (0.04 + t * 0.9)
      const y = y0 + Math.sin(t * 5 + seed) * height * 0.018 + wobble * t
      g.fillRect(x, y - thick / 2, width / steps + 1.2, thick)
    }
  }
  // 起笔的顿笔：一个压扁的墨团
  g.globalAlpha = 1
  g.beginPath()
  g.ellipse(width * 0.06, mid - body * 0.05, height * 0.2, body * 1.12, -0.35, 0, Math.PI * 2)
  g.fill()
  // 收笔回锋
  g.beginPath()
  g.ellipse(width * 0.93, mid + body * 0.1, height * 0.15, body * 0.85, 0.5, 0, Math.PI * 2)
  g.fill()
  // 墨点飞溅
  for (let i = 0; i < 26; i++) {
    g.globalAlpha = 0.4 + r() * 0.6
    g.beginPath()
    g.arc(width * (0.05 + r() * 0.9), mid + (r() - 0.5) * height * 0.9, 0.8 + r() * 2.8, 0, Math.PI * 2)
    g.fill()
  }
  return toTexture(c)
}

// 宣纸：暖色底 + 纤维 + 斑点
export function ricePaper({ size = 1024, seed = 7 } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = rng(seed)
  g.fillStyle = '#e9dfc9'
  g.fillRect(0, 0, size, size)
  for (let i = 0; i < 2200; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(120,100,70,0.06)' : 'rgba(255,250,235,0.09)'
    g.lineWidth = 0.5 + r()
    const x = r() * size
    const y = r() * size
    const a = r() * Math.PI * 2
    const l = 6 + r() * 40
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.5, y + Math.sin(a + 0.5) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(110,90,60,${0.02 + r() * 0.05})`
    g.beginPath()
    g.arc(r() * size, r() * size, 1 + r() * 14, 0, Math.PI * 2)
    g.fill()
  }
  const t = toTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

// 书法大字，白色，交给材质着色。返回纹理和宽高比。
export function glyph(text, { size = 512, font = FONTS.brush, weight = 400, pad = 0.12 } = {}) {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')
  g.font = `${weight} ${size}px ${font}`
  const m = g.measureText(text)
  const w = Math.ceil(m.width + size * pad * 2)
  const h = Math.ceil(size * (1 + pad * 2))
  c.width = w
  c.height = h
  g.font = `${weight} ${size}px ${font}`
  g.fillStyle = '#fff'
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.fillText(text, w / 2, h / 2 + size * 0.04)
  return { texture: toTexture(c), aspect: w / h }
}

// 朱砂方印：边缘残破，阳文白字留空（朱底白字）
export function seal(text, { size = 512, seed = 3, font = FONTS.brush } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = rng(seed)
  const m = size * 0.08
  g.fillStyle = '#fff'
  g.beginPath()
  const pts = 44
  for (let i = 0; i < pts; i++) {
    const side = Math.floor(i / (pts / 4))
    const t = (i % (pts / 4)) / (pts / 4)
    const j = (r() - 0.5) * size * 0.025
    const x = [m + t * (size - 2 * m), size - m + j, size - m - t * (size - 2 * m), m + j][side]
    const y = [m + j, m + t * (size - 2 * m), size - m + j, size - m - t * (size - 2 * m)][side]
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
  }
  g.closePath()
  g.fill()
  // 挖出文字（白文印）
  g.globalCompositeOperation = 'destination-out'
  const chars = [...text]
  const cols = chars.length > 2 ? 2 : 1
  const rows = Math.ceil(chars.length / cols)
  const cell = (size - 2 * m) / Math.max(cols, rows)
  g.font = `${cell * 0.86}px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // 印文从右往左、从上往下
  chars.forEach((ch, i) => {
    const col = cols - 1 - Math.floor(i / rows)
    const row = i % rows
    const x = m + cell * (col + 0.5) + ((size - 2 * m) - cell * cols) / 2
    const y = m + cell * (row + 0.5) + ((size - 2 * m) - cell * rows) / 2
    g.fillText(ch, x, y)
  })
  // 残破：随机啃掉边缘和内部的小块
  for (let i = 0; i < 90; i++) {
    const edge = r() < 0.7
    const x = edge ? (r() < 0.5 ? m + r() * 8 : size - m - r() * 8) : m + r() * (size - 2 * m)
    const y = edge ? m + r() * (size - 2 * m) : m + r() * (size - 2 * m)
    g.beginPath()
    g.arc(r() < 0.5 ? x : y, r() < 0.5 ? y : x, 1 + r() * (edge ? 6 : 2.5), 0, Math.PI * 2)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  return toTexture(c)
}

// 柔和光点（粒子用）
export function softDot(size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return toTexture(c)
}

// 毛笔画的取景框角（一个角），白色
export function brushCorner({ size = 256, seed = 5 } = {}) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const r = rng(seed)
  g.fillStyle = '#fff'
  const w = size * 0.1
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = 0.5 + r() * 0.5
    const o = (r() - 0.5) * w
    g.fillRect(w * 0.6, w * 0.6 + o * 0.3 + w / 2, size * (0.55 + r() * 0.35), 1.5 + r() * 2)
    g.fillRect(w * 0.6 + o * 0.3 + w / 2, w * 0.6, 1.5 + r() * 2, size * (0.55 + r() * 0.35))
  }
  g.globalAlpha = 1
  g.beginPath()
  g.arc(w * 1.1, w * 1.1, w * 0.75, 0, Math.PI * 2)
  g.fill()
  return toTexture(c)
}
