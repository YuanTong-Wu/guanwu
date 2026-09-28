// 演示模式：画一张"树枝上两只鸟"的示意图，跳过相机和识别，直接跑一遍仪式。
// 用法：在网址后加 ?demo（可选 &hour=15 固定时辰，&n=3 改鸟的数量）
import { labelOf, pickCountable } from './core/labels.js'
import { cueLog, renderCues } from './audio.js'

// AudioBuffer → 16 位 WAV 的 data URL
function wavDataUrl(buf) {
  const ch = buf.numberOfChannels
  const len = buf.length
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2))
  const str = (o, t) => [...t].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  data.setUint32(4, 36 + len * ch * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, ch, true)
  data.setUint32(24, buf.sampleRate, true)
  data.setUint32(28, buf.sampleRate * ch * 2, true)
  data.setUint16(32, ch * 2, true)
  data.setUint16(34, 16, true)
  str(36, 'data')
  data.setUint32(40, len * ch * 2, true)
  const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]))
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  }
  let bin = ''
  const bytes = new Uint8Array(data.buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:audio/wav;base64,${btoa(bin)}`
}

function paintScene(n) {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 1280
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, c.height)
  sky.addColorStop(0, '#7fa6c9')
  sky.addColorStop(0.6, '#d9c9a8')
  sky.addColorStop(1, '#6f7d5a')
  g.fillStyle = sky
  g.fillRect(0, 0, c.width, c.height)
  // 远山
  g.fillStyle = 'rgba(70,90,80,0.55)'
  g.beginPath()
  g.moveTo(0, 900)
  for (let x = 0; x <= c.width; x += 40) g.lineTo(x, 820 - Math.sin(x / 90) * 60 - Math.sin(x / 37) * 18)
  g.lineTo(c.width, c.height)
  g.lineTo(0, c.height)
  g.fill()
  // 树枝
  g.strokeStyle = '#3b2a1c'
  g.lineCap = 'round'
  g.lineWidth = 26
  g.beginPath()
  g.moveTo(-20, 760)
  g.quadraticCurveTo(360, 640, 760, 560)
  g.stroke()
  g.lineWidth = 10
  g.beginPath()
  g.moveTo(420, 650)
  g.quadraticCurveTo(470, 560, 560, 520)
  g.stroke()
  // 梅花
  for (let i = 0; i < 24; i++) {
    const x = 60 + i * 28
    const y = 740 - i * 8 + Math.sin(i * 1.7) * 30
    g.fillStyle = i % 3 ? '#f4d0d6' : '#e98ea0'
    g.beginPath()
    g.arc(x, y - 20, 9, 0, Math.PI * 2)
    g.fill()
  }
  const boxes = []
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1)
    const x = 40 + t * 640
    const y = 760 - t * 190 - 44
    const s = n > 3 ? 0.8 : 1
    g.save()
    g.translate(x, y)
    g.scale(i % 2 ? -s : s, s)
    g.fillStyle = '#6b4a2f'
    g.beginPath()
    g.ellipse(0, 0, 40, 27, -0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#8a5d35'
    g.beginPath()
    g.arc(32, -22, 19, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#e9e1cf'
    g.beginPath()
    g.ellipse(6, 8, 22, 12, -0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#d99a2b'
    g.beginPath()
    g.moveTo(48, -24)
    g.lineTo(66, -18)
    g.lineTo(48, -14)
    g.fill()
    g.fillStyle = '#111'
    g.beginPath()
    g.arc(38, -26, 3.5, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#4a3220'
    g.beginPath()
    g.moveTo(-36, -6)
    g.lineTo(-78, -30)
    g.lineTo(-70, 8)
    g.fill()
    g.restore()
    boxes.push({ x: x - 80 * s, y: y - 50 * s, width: 160 * s, height: 90 * s })
  }
  return { canvas: c, boxes }
}

// ?demo&img=/_test/cups.jpg：用一张真照片走完整流程（真识别、真入画）
async function loadImage(url) {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight))
  c.width = Math.round(img.naturalWidth * k)
  c.height = Math.round(img.naturalHeight * k)
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height)
  return c
}

export function runDemo({ begin, detectPhoto, beginTime }) {
  const q = new URLSearchParams(location.search)
  const n = Math.max(1, Math.min(9, Number(q.get('n')) || 2))
  const hour = q.get('hour')
  if (hour != null) {
    const RealDate = Date
    const fixed = new RealDate()
    fixed.setHours(Number(hour), 20, 0, 0)
    // 只替换无参构造，固定演示时辰
    window.Date = class extends RealDate {
      constructor(...a) {
        super(...(a.length ? a : [fixed.getTime()]))
      }
      static now() {
        return fixed.getTime()
      }
    }
  }
  const at = q.get('at')
  const wantAudio = q.has('snapfps') || q.has('snapaudio')
  if (wantAudio) {
    cueLog.enabled = true
    cueLog.clock = () => window.__wq.ritual?.time ?? 0
  }
  setTimeout(async () => {
    const img = q.get('img')
    if (img) {
      const canvas = await loadImage(img)
      const pick = pickCountable(await detectPhoto(canvas))
      console.log('demo detections', pick && pick.category, pick && pick.count)
      await (pick ? begin(canvas, pick, { mirror: false }) : beginTime(canvas))
    } else {
      const { canvas, boxes } = paintScene(n)
      const items = boxes.map((box) => ({ category: 'bird', score: 0.9, box }))
      await begin(canvas, { items, count: n, category: 'bird', label: labelOf('bird') }, { mirror: false })
    }
    // ?snaps=秒,秒…：依次快进到这些时刻，把画面存到开发服务器的 .snaps/ 目录
    let snaps = q.get('snaps')
    // ?snapfps=30&snapto=16：按帧率连续截图，用来合成预览视频
    const fps = Number(q.get('snapfps'))
    if (fps) {
      const to = Number(q.get('snapto')) || 16
      snaps = Array.from({ length: Math.floor(to * fps) }, (_, i) => (i / fps).toFixed(3)).join(',')
    }
    if (snaps) {
      const dbg = window.__wq
      dbg.paused = true
      const tag = q.get('tag') || 'f'
      for (const t of snaps.split(',').map(Number)) {
        // 仪式结束后时间轴就停了，截到仪式时长为止
        const until = Math.min(t, dbg.ritual?.duration ?? t)
        while (dbg.ritual && dbg.ritual.time < until) dbg.stage.frame(1 / 60)
        dbg.stage.frame(0)
        const url = dbg.stage.canvas.toDataURL('image/jpeg', 0.82)
        const name = fps ? `${tag}-${String(Math.round(t * fps)).padStart(4, '0')}` : `${tag}-${String(t).padStart(5, '0')}`
        await fetch(`/__snap?name=${name}`, { method: 'POST', body: url })
      }
      if (wantAudio) {
        const to = Number(q.get('snapto')) || Number(q.get('snapaudio')) || 16
        const buf = await renderCues(cueLog.list, to + 4)
        await fetch(`/__snap?name=${tag}-audio&ext=wav`, { method: 'POST', body: wavDataUrl(buf) })
      }
      document.title = 'snaps done'
      return
    }
    // ?at=秒：快进到那一刻并冻结，方便逐帧检查
    if (at != null) {
      const dbg = window.__wq
      const target = Math.min(Number(at), dbg.ritual?.duration ?? Number(at))
      while (dbg.ritual && dbg.ritual.time < target) dbg.stage.frame(1 / 60)
      dbg.paused = true
    }
  }, 600)
}
