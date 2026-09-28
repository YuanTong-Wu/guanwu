// 起卦仪式的编排，约 14 秒，正好一条短视频：
// 定格化墨 → 数目砸下 → 墨潮与爆散 → 时辰盘落下卦 → 物化金粒成上卦 → 卦名砸下
// → 动爻烧红翻转 → 变卦 → 盖印。每一步的算法用小字写在屏幕下方。
import { Timeline, ease } from './stage/timeline.js'
import { Particles } from './stage/particles.js'
import { HexagramLines } from './stage/hexagram.js'
import { BaguaRing, BranchRing } from './stage/ring.js'
import { Sprite } from './stage/sprites.js'
import { FONTS } from './stage/textures.js'
import { formulaCaptions } from './captions.js'
import * as sfx from './audio.js'

const GOLD = 0xf2c46b
const PAPER = 0xf3e6c8

export { formulaCaptions }

export function layoutFor(W, H) {
  const lineW = Math.min(W * 0.62, 340)
  const gap = Math.min(H * 0.058, 46, lineW * 0.16)
  const cy = -H * 0.03
  const bigH = Math.min(W * 0.26, H * 0.15, 150)
  return {
    lineW,
    gap,
    cy,
    ring: Math.min(W * 1.2, H * 0.66, 780),
    branchRing: Math.min(W * 0.92, H * 0.5, 560),
    titleY: cy + gap * 3 + bigH * 0.5 + Math.max(36, H * 0.06),
    bigH,
    sealSize: Math.min(W * 0.15, 72),
    sealX: lineW / 2 + Math.min(W * 0.1, 40),
    sealY: cy - gap * 3 - Math.min(W * 0.1, 44),
    captionY: -H / 2 + Math.max(56, H * 0.08),
    captionH: Math.min(W * 0.05, 22),
    headlineY: H * 0.32,
  }
}

// cast：起卦结果；boxes：被数到的物体（屏幕像素）；image：定格画面 canvas
export function playRitual({ stage, photo, image, boxes, cast, subjectText, dotTexture }) {
  const W = stage.width
  const H = stage.height
  const L = layoutFor(W, H)
  const tl = new Timeline()
  const disposables = []
  const add = (u) => {
    stage.add(u)
    disposables.push(u)
    return u
  }
  const boom = (x, y, s = 1) => {
    stage.shockwave(x, y, s)
    stage.kick(s)
    // 安卓上随冲击轻震一下（iOS 浏览器没有震动接口，自动忽略）
    try {
      navigator.vibrate?.(Math.round(15 + 45 * Math.min(1.5, s)))
    } catch {
      // 忽略
    }
  }

  const lines = add(new HexagramLines({ stage, lines: cast.original.lines, width: L.lineW, gap: L.gap, y: L.cy }))
  const ring = add(new BaguaRing({ diameter: L.ring }))
  ring.object.position.y = L.cy
  ring.object.position.z = -80
  ring.opacity = 0
  ring.sweep = 0
  const branch = add(new BranchRing({ diameter: L.branchRing }))
  branch.object.position.y = L.cy
  branch.opacity = 0

  const particles = new Particles({
    stage,
    image,
    toSource: (x, y) => photo.screenToSource(x, y),
    boxes,
    lineTargets: (i, u, v) => lines.targetFor(i, u, v),
    dotTexture,
    count: W * H > 600000 ? 20000 : 14000,
    targetLines: [3, 4, 5],
  })
  particles.uniforms.uCenter.value.set(0, L.cy)

  const headline = add(Sprite.text(subjectText, Math.min(W * 0.16, 84), PAPER, { size: 256, glow: 1.2 }))
  headline.object.position.set(0, L.headlineY, 0)
  headline.opacity = 0

  const titleOpts = { size: 384, glow: 1.3 }
  const orig = add(Sprite.text(cast.original.name, L.bigH, GOLD, titleOpts))
  const origFull = add(Sprite.text(cast.original.fullName, L.bigH * 0.22, PAPER, { size: 128, font: FONTS.serif, glow: 1 }))
  const zhi = add(Sprite.text('之', L.bigH * 0.42, PAPER, { size: 256, glow: 1.1 }))
  const chg = add(Sprite.text(cast.changed.name, L.bigH, GOLD, titleOpts))
  const chgFull = add(Sprite.text(cast.changed.fullName, L.bigH * 0.22, PAPER, { size: 128, font: FONTS.serif, glow: 1 }))
  for (const s of [orig, origFull, zhi, chg, chgFull]) {
    s.opacity = 0
    s.object.position.y = L.titleY
  }
  origFull.object.position.y = L.titleY - L.bigH * 0.62
  chgFull.object.position.y = L.titleY - L.bigH * 0.62

  const sealSprite = add(Sprite.seal('万物起卦', L.sealSize, 0xd0321e, { glow: 1.25 }))
  sealSprite.object.position.set(L.sealX, L.sealY, 0)
  sealSprite.opacity = 0

  // 底部小字：算法与落款
  const caps = formulaCaptions(cast, subjectText)
  const captionSprite = (text) => {
    const s = add(Sprite.text(text, L.captionH, PAPER, { size: 96, font: FONTS.serif, glow: 0.95 }))
    s.object.position.set(0, L.captionY, 0)
    s.opacity = 0
    // 太长就缩到屏宽以内
    const maxW = W * 0.9
    const w = L.captionH * s.aspect
    if (w > maxW) s.baseHeight = (L.captionH * maxW) / w
    s.setScale(1)
    return s
  }
  const capLower = captionSprite(caps.lower)
  const capUpper = captionSprite(caps.upper)
  const capMoving = captionSprite(caps.moving)
  const capFinal = captionSprite(`${subjectText} · ${cast.hour.label} · ${cast.original.name}之${cast.changed.name}`)
  const showCaption = (s, at, hold) => {
    tl.tween(at, 0.35, (p) => (s.opacity = p), ease.outQuad)
    if (hold != null) tl.tween(at + hold, 0.35, (p) => (s.opacity = 1 - p), ease.inQuad)
  }

  const boxCenters = boxes.map((b) => stage.toScene(b.x + b.width / 2, b.y + b.height / 2))

  // —— 1. 定格：白闪，画面化成水墨，被数的东西泛金 ——
  tl.call(0, () => {
    stage.flash(1, 1, 1, 0.85)
    stage.kick(0.5)
    stage.aberrate(0.03)
    sfx.chime(1318, 0.9)
    sfx.whoosh(0.9, false, 0.6)
  })
  tl.tween(0, 1.1, (p) => {
    photo.uniforms.uInk.value = p
    photo.uniforms.uHighlight.value = p
  }, ease.inOutCubic)

  // —— 2. 数目砸下 ——
  tl.tween(0.35, 0.45, (p) => headline.stamp(p, 3.4))
  tl.call(0.47, () => {
    boom(0, L.headlineY, 0.8)
    sfx.drum(0.9)
    sfx.pluck(Math.min(9, cast.count || 3), 1)
  })

  // —— 3. 墨潮淹没，物体炸成金粒 ——
  tl.call(1.45, () => {
    stage.add(particles)
    disposables.push(particles)
    boxCenters.forEach((c) => stage.shockwave(c.x, c.y, 1.2))
    stage.kick(1.1)
    stage.flash(1, 0.78, 0.35, 0.35)
    stage.aberrate(0.07)
    sfx.drum(1.3)
    sfx.whoosh(1.6, true, 0.9)
  })
  tl.tween(1.45, 1.3, (p) => (photo.uniforms.uFlood.value = p), ease.inCubic)
  tl.tween(1.45, 0.5, (p) => (headline.dissolve = p))
  tl.tween(1.45, 1.0, (p) => (particles.uniforms.uBurst.value = p))
  tl.tween(1.7, 1.1, (p) => (particles.uniforms.uGold.value = p), ease.outQuad)
  // 金粒在中心回旋，等时辰盘落下卦
  tl.tween(2.1, 3.1, (p) => (particles.uniforms.uSwirl.value = p), ease.inOutCubic)
  tl.call(2.2, () => sfx.bell(147, 0.6, 5))
  tl.tween(2.3, 1.6, (p) => {
    ring.opacity = p * 0.4
    ring.sweep = p
    ring.speed = 0.05 + p * 0.6
  }, ease.outCubic)

  // —— 4. 时辰盘转停，落下卦（初、二、三爻） ——
  const hourIndex = cast.hour.num - 1
  tl.call(2.5, () => {
    branch.spinTo(hourIndex, 2)
    sfx.whoosh(1.1, false, 0.5)
  })
  tl.tween(2.5, 0.4, (p) => (branch.opacity = p * 0.95), ease.outQuad)
  tl.call(3.6, () => {
    boom(0, L.cy + L.branchRing * 0.4, 0.6)
    sfx.chime(988, 1)
  })
  tl.tween(3.6, 0.4, (p) => (branch.mark = p), ease.outQuad)
  showCaption(capLower, 3.6, 1.5)
  for (let i = 0; i < 3; i++) {
    const at = 3.9 + i * 0.4
    tl.tween(at, 0.32, (p) => lines.reveal(i, p), ease.outCubic)
    tl.call(at + 0.05, () => {
      boom(0, L.cy + lines.rowY(i), 0.35 + i * 0.05)
      sfx.drum(0.45 + i * 0.06)
      sfx.pluck(2 + i, 0.55)
    })
  }
  tl.tween(5.0, 0.6, (p) => (branch.opacity = 0.95 * (1 - p)), ease.inQuad)

  // —— 5. 金粒落成上卦（四、五、上爻） ——
  showCaption(capUpper, 5.2, 1.7)
  tl.tween(5.2, 1.6, (p) => (particles.uniforms.uGather.value = 3 + p * 3.6))
  for (let i = 3; i < 6; i++) {
    const at = 5.55 + (i - 3) * 0.4
    tl.tween(at, 0.32, (p) => lines.reveal(i, p), ease.outCubic)
    tl.call(at + 0.05, () => {
      boom(0, L.cy + lines.rowY(i), 0.45 + i * 0.05)
      sfx.drum(0.55 + i * 0.06)
      sfx.pluck(2 + i, 0.6)
    })
  }
  tl.tween(6.8, 0.7, (p) => {
    particles.uniforms.uFade.value = p
    ring.speed = 0.65 - p * 0.55
  })

  // —— 6. 本卦名砸下，圆图转到这一卦 ——
  const t6 = 7.2
  tl.tween(t6, 0.42, (p) => orig.stamp(p, 3.6))
  tl.call(t6 + 0.4, () => {
    boom(0, L.titleY, 1.3)
    stage.flash(1, 1, 1, 0.5)
    stage.aberrate(0.08)
    sfx.drum(1.4)
    sfx.bell(98, 1.1, 7)
    ring.focus(cast.original)
  })
  tl.tween(t6 + 0.5, 0.5, (p) => {
    origFull.opacity = p
    ring.mark = p
    ring.opacity = 0.4 + p * 0.15
  }, ease.outQuad)

  // —— 7. 动爻烧红 ——
  const mi = cast.movingLine - 1
  const t7 = t6 + 1.3
  showCaption(capMoving, t7, 1.5)
  tl.call(t7, () => sfx.drone(true))
  tl.tween(t7, 0.8, (p) => {
    lines.heat(mi, p)
    stage.kick(0.04)
  }, ease.inQuad)

  // —— 8. 翻爻：阳裂为阴，或阴合为阳 ——
  const t8 = t7 + 0.9
  tl.call(t8, () => {
    sfx.drone(false)
    sfx.crack(1.2)
    boom(0, L.cy + lines.rowY(mi), 1.4)
    stage.flash(1, 0.3, 0.15, 0.45)
    stage.aberrate(0.1)
  })
  tl.tween(t8, 0.75, (p) => lines.flip(mi, p))
  tl.tween(t8 + 0.4, 0.9, (p) => lines.heat(mi, 1 - p * 0.55))

  // —— 9. 本卦让位，"之"，变卦砸下 ——
  const shift = L.bigH * 0.95
  tl.tween(t8 + 0.3, 0.6, (p) => {
    orig.object.position.x = -shift * p
    orig.setScale(1 - 0.3 * p)
    origFull.object.position.x = -shift * p
    origFull.opacity = 1 - p
    zhi.opacity = p
  }, ease.inOutCubic)
  const t9 = t8 + 0.95
  chg.object.position.x = shift
  tl.tween(t9, 0.42, (p) => {
    chg.stamp(p, 3.6)
    chg.setScale(3.6 + (0.7 - 3.6) * (1 - Math.pow(1 - p, 4)))
  })
  tl.call(t9 + 0.4, () => {
    boom(shift, L.titleY, 1.35)
    stage.flash(1, 0.95, 0.8, 0.45)
    sfx.drum(1.3)
    sfx.bell(131, 1.1, 7)
    ring.focus(cast.changed)
  })
  tl.tween(t9 + 0.5, 0.6, (p) => (chgFull.opacity = p), ease.outQuad)

  // —— 10. 盖印，落款 ——
  const t10 = t9 + 1.3
  tl.tween(t10, 0.3, (p) => {
    sealSprite.stamp(p, 4.2)
    sealSprite.object.rotation.z = -0.12 * (1 - p)
  })
  tl.call(t10 + 0.28, () => {
    boom(L.sealX, L.sealY, 1.6)
    stage.flash(0.9, 0.2, 0.1, 0.35)
    stage.aberrate(0.09)
    sfx.sealThud()
  })
  showCaption(capFinal, t10 + 0.6, null)

  const total = t10 + 2.2
  tl.start()
  let finished
  const done = new Promise((r) => (finished = r))
  const driver = {
    update: (dt) => {
      tl.update(dt)
      if (tl.time >= total) finished()
    },
  }
  stage.add(driver)

  return {
    done,
    duration: total,
    get time() {
      return tl.time
    },
    dispose() {
      stage.remove(driver)
      sfx.drone(false)
      disposables.forEach((d) => stage.remove(d))
    },
  }
}
