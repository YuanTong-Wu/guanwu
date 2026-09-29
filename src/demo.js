// 演示模式：画一张"树枝上两只鸟"的示意图，跳过相机和识别，直接跑一遍仪式。
// 用法：在网址后加 ?demo（可选 &hour=15 固定时辰，&n=3 改鸟的数量）
import { labelOf, pickCountable } from './core/labels.js'
import { cueLog } from './audio.js'

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
        const url = dbg.stage.canvas.toDataURL('image/jpeg', Number(q.get('snapq')) || 0.82)
        const name = fps ? `${tag}-${String(Math.round(t * fps)).padStart(4, '0')}` : `${tag}-${String(t).padStart(5, '0')}`
        await fetch(`/__snap?name=${name}`, { method: 'POST', body: url })
      }
      // 声音的时刻表存成 JSON；声轨由 scripts/render-audio.mjs 在一个干净页面里合成
      // （跑完整场仪式的页面里，识别引擎占着大块内存，离线合成会分配失败）
      if (wantAudio) {
        const json = JSON.stringify({ duration: dbg.ritual?.duration ?? 17, cues: cueLog.list })
        await fetch(`/__snap?name=${tag}-cues&ext=json`, { method: 'POST', body: `data:application/json;base64,${btoa(unescape(encodeURIComponent(json)))}` })
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
