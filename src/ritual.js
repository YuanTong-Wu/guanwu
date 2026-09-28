// 起卦仪式，约 15 秒，正好一条短视频。大动作少而准，靠"顿"和"静"：
//   定格，一声磬，停一停 → 一滴墨落下，从落点把整个画面晕成水墨 → 其余褪成留白，只剩被数到的东西
//   → 纸收成一张册页，挪到上方 → 题款"见杯三 · 申时" → 黑底上白墨一笔一爻，写完一声钟，静一秒
//   → 朱笔圈出动爻，停一停，爻变 → 写"夬之大壮" → 印章砸下，几片金箔落在纸上。
import * as THREE from 'three'
import { Timeline, ease } from './stage/timeline.js'
import { HexagramLines, INK_WHITE, CINNABAR } from './stage/hexagram.js'
import { Sprite } from './stage/sprites.js'
import { InkDrop, Spatter, GoldFlakes } from './stage/ink.js'
import { FONTS } from './stage/textures.js'
import { formulaCaptions } from './captions.js'
import * as sfx from './audio.js'

const INK = 0x1c1813

export { formulaCaptions }

export function layoutFor(W, H) {
  const landscape = W > H * 1.1
  if (landscape) {
    const leafH = H * 0.62
    const leafW = Math.min(W * 0.4, leafH * 1.15)
    const leaf = { x: W * 0.07, y: (H - leafH) / 2 - H * 0.02, w: leafW, h: leafH }
    const lineW = Math.min(W * 0.2, 240)
    const gap = Math.min(H * 0.07, 34)
    const hexX = W * 0.68
    const hexY = H * 0.44
    return { landscape, leaf, lineW, gap, hexX, hexY, namesY: hexY + gap * 3 + H * 0.11, nameH: Math.min(H * 0.07, 48), captionY: H - Math.max(36, H * 0.06), dateY: Math.max(28, H * 0.05) }
  }
  const leafW = Math.min(W * 0.8, 440)
  const leafH = Math.min(H * 0.34, leafW * 0.92)
  const leaf = { x: (W - leafW) / 2, y: H * 0.09, w: leafW, h: leafH }
  const lineW = Math.min(W * 0.42, 220)
  const gap = Math.min(H * 0.038, 30)
  const hexY = leaf.y + leafH + H * 0.075 + gap * 2.5
  return {
    landscape,
    leaf,
    lineW,
    gap,
    hexX: W / 2,
    hexY,
    namesY: hexY + gap * 3 + Math.min(H * 0.085, 64),
    nameH: Math.min(W * 0.1, 46),
    captionY: H - Math.max(34, H * 0.045),
    dateY: Math.max(26, H * 0.045),
  }
}

// 以物体为中心，按册页的宽高比裁一块（屏幕像素，左上为原点）
function cropAround(boxes, W, H, aspect) {
  let x0 = W
  let y0 = H
  let x1 = 0
  let y1 = 0
  for (const b of boxes) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.width)
    y1 = Math.max(y1, b.y + b.height)
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  // 四周留出一半的空，写意小品要留白
  let w = Math.max((x1 - x0) * 1.6, W * 0.35)
  let h = Math.max((y1 - y0) * 1.6, H * 0.2)
  if (w / h > aspect) h = w / aspect
  else w = h * aspect
  if (w > W) {
    w = W
    h = w / aspect
  }
  if (h > H) {
    h = H
    w = h * aspect
  }
  const x = Math.min(Math.max(cx - w / 2, 0), W - w)
  const y = Math.min(Math.max(cy - h / 2, 0), H - h)
  return { x, y, w, h }
}

// 细白线框，衬在册页外面一点
function frameLines(color = 0xece5d4) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ])
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
  const line = new THREE.LineLoop(geo, mat)
  line.renderOrder = 5
  return { object: line, set opacity(v) { mat.opacity = v }, dispose() { geo.dispose(); mat.dispose() } }
}

// 名字的书写进度：先写本卦名，"之"和变卦名随后。按等宽字估算每个字在贴图里的横向位置
function namesRevealAt(chars, spacing, pad, upto) {
  const unit = 1 + spacing
  const total = chars * 1 + (chars - 1) * spacing + pad * 2
  return (pad + upto * unit - spacing / 2) / total
}

// photo、paper：画面层和宣纸层；boxes：被数到的物体（屏幕像素）
// label：题款用的简称（如"鸟"），inscription：题款正文（如"见鸟二"）；ganzhi：可选的干支纪时
export function playRitual({ stage, photo, paper, boxes, cast, label, inscription, ganzhi }) {
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
  const S = (x, y) => stage.toScene(x, y)

  // —— 墨滴落点：物体群的中心 ——
  const has = boxes.length > 0
  const union = has
    ? boxes.reduce((a, b) => ({ x: a.x + (b.x + b.width / 2) / boxes.length, y: a.y + (b.y + b.height / 2) / boxes.length }), { x: 0, y: 0 })
    : { x: W / 2, y: H * 0.42 }
  photo.uniforms.uOrigin.value.set(union.x / W, 1 - union.y / H)
  const dropAt = S(union.x, union.y)
  const drop = add(new InkDrop({ x: dropAt.x, y: dropAt.y, fromY: H / 2 + 40, size: Math.max(16, Math.min(W, H) * 0.05) }))
  const spatter = add(new Spatter({ x: dropAt.x, y: dropAt.y, spread: Math.min(W, H) * 0.12, seed: cast.count || 7 }))

  // —— 册页：裁切区域和目标位置 ——
  const leafAspect = L.leaf.w / L.leaf.h
  const crop = has ? cropAround(boxes, W, H, leafAspect) : cropAround([{ x: W * 0.3, y: H * 0.3, width: W * 0.4, height: H * 0.3 }], W, H, leafAspect)
  const clipTo = new THREE.Vector4(crop.x / W, 1 - (crop.y + crop.h) / H, (crop.x + crop.w) / W, 1 - crop.y / H)
  const s1 = L.leaf.w / crop.w
  const cropC = S(crop.x + crop.w / 2, crop.y + crop.h / 2)
  const leafC = S(L.leaf.x + L.leaf.w / 2, L.leaf.y + L.leaf.h / 2)
  const setClip = (p) => {
    for (const u of [photo.uniforms.uClip.value, paper.uniforms.uClip.value]) u.set(clipTo.x * p, clipTo.y * p, 1 + (clipTo.z - 1) * p, 1 + (clipTo.w - 1) * p)
  }
  const setPlace = (p) => {
    const s = 1 + (s1 - 1) * p
    const x = (leafC.x - cropC.x * s1) * p
    const y = (leafC.y - cropC.y * s1) * p
    photo.place(s, x, y)
    paper.place(s, x, y)
  }
  const frame = add(frameLines())
  frame.object.position.set(leafC.x, leafC.y, 0)
  frame.object.scale.set(L.leaf.w + 14, L.leaf.h + 14, 1)

  // —— 题款：竖排，写在册页右上，右起第一行"见鸟二"，左边一行时辰 ——
  const insH = Math.min(L.leaf.w * 0.07, 24)
  const ins1 = add(Sprite.text(inscription, insH, INK, { size: 160, vertical: true, order: 30 }))
  const ins2 = add(Sprite.text(cast.hour.label, insH * 0.72, INK, { size: 160, vertical: true, order: 30 }))
  const insRight = L.leaf.x + L.leaf.w - insH * 1.1
  const insTop = L.leaf.y + insH * 0.8
  const p1 = S(insRight - ins1.width / 2, insTop + ins1.baseHeight / 2)
  ins1.object.position.set(p1.x, p1.y, 0)
  const p2 = S(insRight - ins1.width - insH * 0.25 - ins2.width / 2, insTop + insH * 0.4 + ins2.baseHeight / 2)
  ins2.object.position.set(p2.x, p2.y, 0)
  ins1.reveal = 0
  ins2.reveal = 0

  // —— 印章：题款下方，册页右侧 ——
  const sealSize = Math.min(L.leaf.w * 0.15, 56)
  const seal = add(Sprite.seal('万物起卦', sealSize, CINNABAR, { order: 32 }))
  const sealPos = S(insRight - sealSize * 0.1 - sealSize / 2 + insH * 0.5, insTop + ins1.baseHeight + sealSize * 0.85)
  seal.object.position.set(sealPos.x, sealPos.y, 0)
  seal.opacity = 0
  const flakes = add(new GoldFlakes({ rect: { x: leafC.x - L.leaf.w / 2, y: leafC.y + L.leaf.h / 2, w: L.leaf.w, h: L.leaf.h }, count: 10, seed: cast.original.num }))

  // —— 六爻：黑底白墨 ——
  const hexC = S(L.hexX, L.hexY)
  const lines = add(new HexagramLines({ lines: cast.original.lines, width: L.lineW, gap: L.gap, x: hexC.x, y: hexC.y, color: INK_WHITE }))
  const mi = cast.movingLine - 1
  const mark = lines.addMark(mi, L.gap * 0.95)

  // —— 卦名："夬之大壮"，横排，白字，字距疏朗 ——
  const namesText = `${cast.original.name}之${cast.changed.name}`
  const spacing = 0.35
  const names = add(Sprite.text(namesText, L.nameH, INK_WHITE, { size: 200, spacing, pad: 0.12, order: 25 }))
  const np = S(L.hexX, L.namesY)
  names.object.position.set(np.x, np.y, 0)
  names.reveal = 0

  // —— 小字：算法、纪时 ——
  const caps = formulaCaptions(cast, label)
  const small = (text, y, h) => {
    const s = add(Sprite.text(text, h, INK_WHITE, { size: 72, font: FONTS.serif, spacing: 0.18, order: 26 }))
    const maxW = W * 0.9
    if (s.width > maxW) s.baseHeight *= maxW / s.width
    s.setScale(1)
    const p = S(W / 2, y)
    s.object.position.set(p.x, p.y, 0)
    s.opacity = 0
    return s
  }
  const capH = Math.min(W * 0.037, 16)
  const capLower = small(caps.lower, L.captionY, capH)
  const capUpper = small(caps.upper, L.captionY, capH)
  const capMoving = small(caps.moving, L.captionY, capH)
  const dateLine = ganzhi ? small(ganzhi, L.dateY, capH * 0.95) : null
  const fadeIn = (s, at, d = 0.4, to = 0.8) => tl.tween(at, d, (p) => (s.opacity = p * to), ease.outQuad)
  const fadeOut = (s, at, d = 0.35, from = 0.8) => tl.tween(at, d, (p) => (s.opacity = from * (1 - p)), ease.inQuad)

  // ================= 时间轴 =================
  // 1. 定格：一声磬，然后停住不动
  tl.call(0, () => sfx.chime(1046, 0.9))

  // 2. 一滴墨落下
  const tDrop = 0.55
  const fall = 0.42
  tl.tween(tDrop, fall, (p) => drop.fall(p))
  tl.call(tDrop + fall, () => {
    drop.object.visible = false
    spatter.opacity = 1
    sfx.inkDrop()
  })
  // 3. 从落点晕开，整个画面化成水墨；宣纸同时铺底
  const tInk = tDrop + fall
  tl.tween(tInk, 2.1, (p) => {
    photo.uniforms.uInk.value = p * 1.3
    paper.opacity = Math.min(1, p * 2)
  }, ease.outQuad)

  // 4. 留白：只剩被数到的东西
  const tIso = tInk + 2.25
  if (has) {
    tl.tween(tIso, 1.1, (p) => {
      photo.uniforms.uIsolate.value = p
      spatter.opacity = 1 - p
    }, ease.inOutCubic)
  } else {
    tl.tween(tIso, 0.8, (p) => (spatter.opacity = 1 - p))
  }

  // 5. 纸收成册页，挪到上方
  const tCrop = tIso + 1.2
  tl.tween(tCrop, 0.6, (p) => setClip(p), ease.inOutCubic)
  const tMove = tCrop + 0.6
  tl.tween(tMove, 0.85, (p) => setPlace(p), ease.inOutCubic)
  tl.tween(tMove + 0.5, 0.6, (p) => (frame.opacity = p * 0.35), ease.outQuad)

  // 6. 题款
  const tIns = tMove + 1.0
  tl.call(tIns, () => sfx.brush(0.5, 0.7))
  tl.tween(tIns, 0.6, (p) => (ins1.reveal = p), ease.linear)
  tl.call(tIns + 0.75, () => sfx.brush(0.35, 0.55))
  tl.tween(tIns + 0.75, 0.4, (p) => (ins2.reveal = p), ease.linear)

  // 7. 一笔一爻：下卦三笔，稍停，上卦三笔
  const tLines = tIns + 1.45
  const step = 0.44
  const lineAt = (i) => tLines + i * step + (i >= 3 ? 0.4 : 0)
  fadeIn(capLower, tLines - 0.1)
  fadeOut(capLower, lineAt(3) - 0.35)
  fadeIn(capUpper, lineAt(3) - 0.05)
  for (let i = 0; i < 6; i++) {
    const at = lineAt(i)
    tl.call(at, () => sfx.brush(0.32, 0.9))
    tl.tween(at, 0.3, (p) => lines.reveal(i, p), ease.outQuad)
  }

  // 8. 六爻写完，一声钟，静一秒
  const tBell = lineAt(5) + 0.55
  tl.call(tBell, () => sfx.bell(110, 1, 6))
  fadeOut(capUpper, tBell + 0.3)

  // 9. 朱笔圈出动爻
  const tMark = tBell + 1.1
  tl.call(tMark, () => sfx.brush(0.4, 0.6))
  tl.tween(tMark, 0.45, (p) => (mark.reveal = p), ease.inOutCubic)
  fadeIn(capMoving, tMark)

  // 10. 停一停，爻变
  const tFlip = tMark + 0.85
  tl.call(tFlip, () => sfx.woodTick(1.2))
  tl.tween(tFlip, 0.28, (p) => lines.flip(mi, p), ease.linear)
  fadeOut(capMoving, tFlip + 0.6)

  // 11. 写卦名：先本卦，再"之"和变卦
  const tNames = tFlip + 0.55
  const firstEnd = namesRevealAt([...namesText].length, spacing, 0.12, [...cast.original.name].length)
  tl.call(tNames, () => sfx.brush(0.4, 0.8))
  tl.tween(tNames, 0.4, (p) => (names.reveal = firstEnd * p), ease.linear)
  tl.call(tNames + 0.55, () => sfx.brush(0.55, 0.8))
  tl.tween(tNames + 0.55, 0.6, (p) => (names.reveal = firstEnd + (1 - firstEnd) * p), ease.linear)

  // 12. 印章砸下："砰"，几片金箔飘落
  const tSeal = tNames + 1.55
  tl.tween(tSeal, 0.12, (p) => {
    seal.opacity = 1
    seal.setScale(1.45 - 0.45 * p * p)
  })
  tl.call(tSeal + 0.12, () => {
    stage.kick(0.9)
    sfx.sealThud()
    flakes.start()
    try {
      navigator.vibrate?.(40)
    } catch {
      // 忽略
    }
  })
  if (dateLine) fadeIn(dateLine, tSeal + 0.8, 0.8, 0.6)

  const total = tSeal + 2.6
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
      disposables.forEach((d) => stage.remove(d))
    },
  }
}
