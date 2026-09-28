import { Stage } from './stage/renderer.js'
import { PhotoLayer, PaperLayer } from './stage/photo.js'
import { ScanOverlay } from './stage/scan.js'
import { BaguaRing } from './stage/ring.js'
import { playRitual } from './ritual.js'
import { openCamera, grabFrame, loadPhoto, stopCamera, cameraAlive } from './camera.js'
import { loadDetector, prefetchDetector } from './detect/detector.js'
import { pickCountable, inscription } from './core/labels.js'
import { castByCount, castByTime, shichen } from './core/meihua.js'
import { lunarNow, ganzhiLine, lunarDateLine } from './core/lunar.js'
import { renderReading } from './reading.js'
import { unlockAudio, audioStream, woodTick, chime } from './audio.js'
import { startRecording, shareOrSave } from './recorder.js'

const $ = (id) => document.getElementById(id)
const canvas = $('stage')
const video = $('camera')
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
// 抖音、微信等内置浏览器：相机常常不可用，也不能下载文件
const IN_APP = /aweme|BytedanceWebview|Douyin|MicroMessenger|QQ\/|Weibo|Toutiao|NewsArticle|Kwai|XiaoHongShu|xhsdiscover|DingTalk|Alipay/i.test(navigator.userAgent)
if (IN_APP) $('inapp-tip').hidden = false

// 状态：home → loading → scan（picking 为选照片中）→ ritual → ended
let state = 'home'
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id))
}

function toast(text, ms = 2600) {
  const t = $('toast')
  t.textContent = text
  t.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => (t.hidden = true), ms)
}

// 最多等若干毫秒：个别环境（后台标签页等）会一直挂起，不能因此卡住
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))])
const fontsReady = within(
  Promise.all([document.fonts?.load?.('64px "WQ Brush"', '观物起卦乾坤'), document.fonts?.load?.('32px "WQ Serif"', '卦之')]).catch(() => {}),
  3000,
)

// —— 卦辞页：对话框语义；返回键、Esc 都能关 ——
function openReading(c) {
  $('reading-body').replaceChildren(renderReading(c.cast, c.subject, c.label))
  $('reading').hidden = false
  $('close-reading').focus()
  if (history.state?.reading !== true) history.pushState({ reading: true }, '')
}

function closeReading() {
  if ($('reading').hidden) return
  $('reading').hidden = true
  if (history.state?.reading === true) history.back()
}

$('close-reading').addEventListener('click', closeReading)
$('reading').addEventListener('click', (e) => {
  if (e.target.id === 'reading') closeReading()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeReading()
})
window.addEventListener('popstate', () => {
  $('reading').hidden = true
})

// —— 画布：不支持 WebGL 的设备仍可以时起卦、看卦辞 ——
let stage = null
try {
  stage = new Stage(canvas)
} catch {
  stage = null
}

if (stage) boot()
else {
  document.body.classList.add('no-webgl')
  $('start').querySelector('span').textContent = '以 时 起 卦'
  $('start').addEventListener('click', async () => {
    const now = new Date()
    const cast = castByTime(await lunarNow(now), now)
    openReading({ cast, subject: '以时起卦', label: '' })
  })
  toast('此设备不支持画面效果，可以时起卦，看卦辞', 5000)
}

function boot() {
  const paper = stage.add(new PaperLayer())
  const photo = stage.add(new PhotoLayer())
  const overlay = stage.add(new ScanOverlay(stage))

  // 首页背景的先天圆图，字体就绪后再画
  let ring = null
  const setRing = (v) => ring && (ring.opacity = v)
  fontsReady.then(() => {
    ring = stage.add(new BaguaRing({ diameter: Math.min(stage.width * 1.5, stage.height * 0.85, 900) }))
    ring.speed = 0.03
    ring.breathe = !REDUCED
    ring.object.position.z = -200
    setRing(state === 'home' ? 0.3 : 0)
  })

  let detector = null
  let detectorPromise = null
  let camera = null
  let ritual = null
  let recording = null
  let castToken = 0
  let lastCast = null
  let videoBlob = null

  // —— 主循环：仪式和取景满帧；首页和结束画面降帧，省电 ——
  const debug = import.meta.env.DEV ? (window.__wq = { paused: false, stage, ritual: null }) : { paused: false }
  let last = performance.now()
  let skip = 0
  function loop(now) {
    requestAnimationFrame(loop)
    const idle = state === 'home' || (state === 'ended' && (ritual?.time ?? 0) > (ritual?.duration ?? 0) + 3)
    if (idle && ++skip % (state === 'home' ? 2 : 4) !== 0) return
    const dt = debug.paused ? 0 : Math.min(0.05, (now - last) / 1000)
    last = now
    stage.frame(dt)
    recording?.rec.draw(now)
  }
  requestAnimationFrame(loop)

  // 显卡上下文丢失（手机切后台太久等）：恢复后重画当前这幅
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault())
  canvas.addEventListener('webglcontextrestored', () => {
    if (state === 'ritual' || state === 'ended') photo.bake(stage.renderer)
  })

  // —— 常亮与前后台 ——
  async function keepAwake() {
    try {
      await navigator.wakeLock?.request('screen')
    } catch {
      // 不支持就算了
    }
  }

  // —— 取景的计数状态 ——
  let stable = { key: '', since: 0, last: 0 }
  let lastDetections = []
  let noneSince = 0
  let detectFailures = 0
  let lastTick = 0
  let lastCount = 0
  let detectTimer = 0

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      // 切到后台：取景中就关相机，回来再开；计数重来
      if (state === 'scan' && camera) {
        stopCamera(camera.stream)
        camera = null
      }
      stable = { key: '', since: 0, last: 0 }
      return
    }
    unlockAudio()
    if (state === 'scan' || state === 'ritual') keepAwake()
    if (state === 'scan' && !cameraAlive(camera?.stream)) {
      try {
        camera = await openCamera(video)
        photo.setSource(video, { mirror: camera.mirror })
      } catch {
        toast('相机未能重开，可"以照片起卦"或"以时起卦"', 4000)
      }
    }
  })

  // —— 识物之法：只加载一次 ——
  // 首页上先在后台把模型和 wasm 下好（不占 CPU），点"起卦"时少等一会儿；省流量模式下不预先下
  if (!navigator.connection?.saveData) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500))
    fontsReady.then(() => idle(() => state === 'home' && !detectorPromise && prefetchDetector(), { timeout: 3000 }))
  }

  function ensureDetector() {
    if (!detectorPromise) {
      detectorPromise = loadDetector((p) => {
        if (state === 'loading') $('loading-text').textContent = p < 1 ? `备识物之法　${Math.round(p * 100)}%` : '备识物之法　稍候'
      })
        .then((d) => (detector = d))
        .catch((e) => {
          detectorPromise = null
          throw e
        })
    }
    return detectorPromise
  }

  // —— 开始 ——
  let cameraFailed = false
  function switchToPhotoMode(message) {
    cameraFailed = true
    $('start').querySelector('span').textContent = '以照片起卦'
    $('start').setAttribute('aria-label', '选一张照片或拍一张来起卦')
    state = 'home'
    show('home')
    setRing(0.3)
    toast(message, 4200)
  }

  $('start').addEventListener('click', async () => {
    unlockAudio()
    if (state !== 'home') return
    if (cameraFailed) {
      state = 'picking'
      $('photo-input').click()
      return
    }
    keepAwake()
    chime(1046, 0.5)
    state = 'loading'
    show('loading')
    $('loading-text').textContent = '备识物之法'
    // 识物之法太久没好（网络慢）：先进入取景，留"以时起卦"和"以照片起卦"
    const detectorReady = within(ensureDetector().catch(() => null), 25000)
    try {
      camera = await openCamera(video)
    } catch (e) {
      camera = null
      switchToPhotoMode(e.code === 'NotAllowedError' ? '未得相机之许。可以照片起卦' : '此处开不了相机。可以照片起卦')
      return
    }
    photo.setSource(video, { mirror: camera.mirror })
    photo.precompile(stage.renderer)
    await detectorReady
    if (!detector) toast('识物之法未能载入。可"以照片起卦"或"以时起卦"', 5000)
    enterScan()
  })

  function enterScan() {
    state = 'scan'
    stable = { key: '', since: 0, last: 0 }
    noneSince = performance.now()
    lastCount = 0
    setRing(0)
    show('scan')
    $('scan-count').textContent = ''
    setHint('对准可数之物，静候片刻')
    $('use-photo').classList.remove('pulse')
    watchBlackCamera()
    scheduleDetect(300)
  }

  function setHint(text) {
    if ($('scan-hint').textContent !== text) $('scan-hint').textContent = text
  }

  // 相机开了却一直没有画面（微信 iOS 偶发黑屏）
  function watchBlackCamera() {
    const t0 = video.currentTime
    setTimeout(() => {
      if (state !== 'scan') return
      if (!video.videoWidth || video.currentTime === t0) {
        toast('相机无画面，请点下方"以照片起卦"', 4000)
        $('use-photo').classList.add('pulse')
      }
    }, 4000)
  }

  // 识别不放在渲染循环里：按上一次用时自适应间隔，画面不卡
  function scheduleDetect(ms) {
    clearTimeout(detectTimer)
    detectTimer = setTimeout(detectTick, ms)
  }

  function toScreenBox(b) {
    const a = photo.sourceToScreen(b.x, b.y)
    const c = photo.sourceToScreen(b.x + b.width, b.y + b.height)
    return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y) }
  }

  // 只数屏幕上看得见的：画面按 cover 裁切，边上被裁掉的不算
  function visibleOnly(dets) {
    const W = stage.width
    const H = stage.height
    return dets.filter((d) => {
      const b = toScreenBox(d.box)
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      return cx > 0 && cx < W && cy > 0 && cy < H
    })
  }

  function detectTick() {
    if (state !== 'scan') return
    if (!detector || !video.videoWidth || document.hidden) return scheduleDetect(400)
    const t0 = performance.now()
    let found = []
    try {
      found = visibleOnly(detector.detect(video, t0))
      detectFailures = 0
    } catch {
      detectFailures++
    }
    const took = performance.now() - t0
    onDetections(found, performance.now())
    if (detectFailures > 5) {
      setHint('此处识物不成。可"以照片起卦"或"以时起卦"')
      return
    }
    scheduleDetect(Math.max(180, took * 2))
  }

  function onDetections(found, now) {
    const pick = pickCountable(found)
    lastDetections = pick ? pick.items : []
    const boxes = lastDetections.map((d) => toScreenBox(d.box)).sort((a, b) => a.x - b.x)
    overlay.setBoxes(boxes)
    // 木鱼：数目变多才敲，且不连敲
    if (boxes.length > lastCount && now - lastTick > 160) {
      woodTick(0.7)
      lastTick = now
    }
    lastCount = boxes.length
    if (!pick) {
      $('scan-count').textContent = ''
      stable = { key: '', since: 0, last: now }
      if (now - noneSince > 6000) setHint('未见可数之物。杯、瓶、书、盆栽、人、车皆可')
      return
    }
    noneSince = now
    $('scan-count').textContent = inscription(pick.label, pick.count)
    const key = `${pick.label.short}:${pick.count}:${shichen(new Date()).num}`
    // 要连续看见同一个数；中断超过 0.7 秒就重新计时
    if (key !== stable.key || now - stable.last > 700) stable = { key, since: now, last: now }
    stable.last = now
    // 刚占过的同物同数同时辰，不自动再起：卦必同前
    if (lastCast && key === lastCast.key) {
      setHint('同物同数同时，卦同前。换一物再占')
      return
    }
    setHint('数定即起卦')
    if (now - stable.since > 1800) lockFromVideo()
  }

  $('lock').addEventListener('click', () => {
    unlockAudio()
    if (state !== 'scan') return
    if (!lastDetections.length) {
      toast('尚未见物。对准些再试，或"以时起卦"')
      return
    }
    lockFromVideo()
  })

  function lockFromVideo() {
    if (state !== 'scan' || !video.videoWidth) return
    const still = grabFrame(video)
    // 识别框是按视频原始分辨率给的，定格图最长边压到了 1280，要同比缩放
    const k = still.width / video.videoWidth
    const items = lastDetections.map((d) => ({ ...d, box: { x: d.box.x * k, y: d.box.y * k, width: d.box.width * k, height: d.box.height * k } }))
    begin(still, pickCountable(items), { mirror: camera?.mirror })
  }

  // —— 拍照兜底 ——
  function backFromPicking() {
    if (cameraAlive(camera?.stream)) enterScan()
    else {
      state = 'home'
      show('home')
      setRing(0.3)
    }
  }
  $('use-photo').addEventListener('click', () => {
    unlockAudio()
    if (state !== 'scan') return
    state = 'picking'
    clearTimeout(detectTimer)
    $('photo-input').click()
  })
  // 首页直接以照片起卦：相册里选一张或现拍一张
  $('home-photo').addEventListener('click', () => {
    unlockAudio()
    if (state !== 'home') return
    state = 'picking'
    $('photo-input').click()
  })
  // 选照片时点了取消：回到原来的地方
  $('photo-input').addEventListener('cancel', () => {
    if (state === 'picking') backFromPicking()
  })
  $('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (state !== 'picking') return
    if (!file) return backFromPicking()
    unlockAudio()
    state = 'loading'
    show('loading')
    $('loading-text').textContent = '观图中'
    let still = null
    try {
      still = await loadPhoto(file)
    } catch {
      still = null
    }
    if (!still) {
      toast('此图读不出，换一张再试')
      return backFromPicking()
    }
    $('loading-text').textContent = '备识物之法'
    await within(ensureDetector().catch(() => null), 25000)
    // 照片完整显示，照片里的东西全都算数
    photo.setSource(still, { mirror: false, fit: 'contain' })
    let found = []
    try {
      found = detector ? visibleOnly(await detector.detectImage(still)) : []
    } catch {
      found = []
    }
    const pick = pickCountable(found)
    if (!pick) {
      toast('图中未见可数之物，以时起卦')
      return beginTime(still, false, 'contain')
    }
    return begin(still, pick, { mirror: false, fit: 'contain' })
  })

  // —— 以时起卦 ——
  $('use-time').addEventListener('click', () => {
    unlockAudio()
    if (state !== 'scan') return
    beginTime(video.videoWidth ? grabFrame(video) : null, !!camera?.mirror)
  })

  async function beginTime(still, mirror, fit = 'cover') {
    const token = claim()
    const now = new Date()
    const cast = castByTime(await lunarNow(now), now)
    if (token !== castToken) return
    photo.setSource(still || blankCanvas(), { mirror: still ? mirror : false, fit })
    return runRitual(token, [], cast, '', '以时起卦', `time:${cast.original.num}:${cast.hour.num}`)
  }

  function blankCanvas() {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 960
    const g = c.getContext('2d')
    g.fillStyle = '#d8c9a6'
    g.fillRect(0, 0, c.width, c.height)
    return c
  }

  // 占住这一次起卦：从这一刻起取景界面不可再点，别的入口一律让路
  function claim() {
    state = 'ritual'
    show(null)
    clearTimeout(detectTimer)
    return ++castToken
  }

  // —— 起卦 ——
  function begin(still, pick, { mirror, fit = 'cover' }) {
    const token = claim()
    const cast = castByCount(pick.count, new Date())
    photo.setSource(still, { mirror, fit })
    const boxes = pick.items.map((d) => toScreenBox(d.box))
    return runRitual(token, boxes, cast, pick.label.short, inscription(pick.label, pick.count), `${pick.label.short}:${pick.count}:${cast.hour.num}`)
  }

  async function runRitual(token, boxes, cast, label, text, key) {
    // 定格后不再需要相机：关掉，省电也让人放心
    if (camera) {
      stopCamera(camera.stream)
      camera = null
    }
    ritual?.dispose()
    ritual = null
    if (recording) {
      recording.rec.stop()
      recording = null
    }
    const dateLine = cast.method === 'time' ? Promise.resolve(lunarDateLine(cast.lunar, cast.hour.label)) : within(ganzhiLine(new Date(), cast.hour.label), 1500)
    const [, ganzhi] = await Promise.all([fontsReady, dateLine])
    if (token !== castToken) return
    setRing(0)
    overlay.clear()
    lastCast = { cast, subject: text, label, key, at: Date.now() }
    $('result-text').textContent = `${text}，${cast.hour.label}，得${cast.original.name}之${cast.changed.name}`
    photo.reset()
    paper.reset()
    photo.setBoxes(boxes)
    photo.bake(stage.renderer)
    stage.lockSize()
    videoBlob = null
    $('poster-wrap').hidden = true
    $('poster-note').hidden = true
    $('save-video').hidden = true
    const rec = startRecording(canvas, audioStream())
    recording = rec ? { rec, token } : null
    if (REDUCED) stage.kick = () => {}
    // 结束时底部要放按钮和一行提示（微信等内置浏览器里提示可能两行）：卦名画在它们上面
    const actionsTop = document.querySelector('#ended .end-actions').getBoundingClientRect().top
    const bottom = Math.max(0, stage.height - actionsTop) + (IN_APP ? 54 : 34)
    ritual = playRitual({ stage, photo, paper, boxes, cast, label, inscription: text, ganzhi, bottom })
    debug.ritual = ritual
    // 仪式开始即返回；结束后的事另外接着做
    ritual.done.then(() => finishRitual(token))
  }

  async function finishRitual(token) {
    if (token !== castToken) return
    state = 'ended'
    show('ended')
    // 结束画面存一张图：微信等内置浏览器里长按保存用；录不了视频时也用它
    let posterUrl = null
    try {
      stage.frame(0)
      posterUrl = canvas.toDataURL('image/jpeg', 0.9)
    } catch {
      posterUrl = null
    }
    if (recording && recording.token === token) {
      const r = recording.rec
      recording = null
      videoBlob = await r.stop()
    }
    if (token !== castToken) return
    const playable = videoBlob && /mp4/.test(videoBlob.type)
    $('save-video').hidden = !videoBlob || IN_APP
    if (posterUrl && (IN_APP || !playable)) {
      $('poster').src = posterUrl
      $('poster-wrap').hidden = false
      $('poster-note').textContent = IN_APP ? '长按画面可存图。存视频：点右上角"…"，在浏览器打开' : '长按画面可存图'
      $('poster-note').hidden = false
    }
  }

  // —— 结束后 ——
  $('show-reading').addEventListener('click', () => {
    if (lastCast) openReading(lastCast)
  })

  let sharing = false
  $('save-video').addEventListener('click', async () => {
    unlockAudio()
    if (!videoBlob || !lastCast || sharing) return
    sharing = true
    try {
      const c = lastCast.cast
      const r = await shareOrSave(videoBlob, `观物-${c.original.name}之${c.changed.name}`)
      if (r === 'shared') toast('已存')
      else if (r === 'downloaded') toast('若未见下载，可截屏留存')
    } finally {
      sharing = false
    }
  })

  $('again').addEventListener('click', async () => {
    unlockAudio()
    if (state !== 'ended') return
    // 一事不二占：刚占过又占，提一句《蒙》卦的话，但不拦着
    if (lastCast && Date.now() - lastCast.at < 90_000) toast('初筮告，再三渎，渎则不告。换一事再问', 3600)
    castToken++
    ritual?.dispose()
    ritual = null
    debug.ritual = null
    $('poster-wrap').hidden = true
    $('poster-note').hidden = true
    photo.reset()
    paper.reset()
    stage.unlockSize()
    closeReading()
    state = 'loading'
    show('loading')
    $('loading-text').textContent = '开镜'
    try {
      camera = await openCamera(video)
      photo.setSource(video, { mirror: camera.mirror })
      keepAwake()
      enterScan()
    } catch {
      camera = null
      photo.object.visible = false
      switchToPhotoMode('此处开不了相机。可以照片起卦')
    }
  })

  // —— 开发用（正式构建里没有） ——
  if (import.meta.env.DEV) {
    const QS = new URLSearchParams(location.search)
    // ?autostart 自动点"起卦"；?snaplive=0.5 每隔 0.5 秒把画面存到开发服务器（配合无头浏览器和假摄像头做端到端检查）
    if (QS.has('autostart')) fontsReady.then(() => setTimeout(() => $('start').click(), 300))
    if (QS.has('snaplive')) {
      const every = Number(QS.get('snaplive')) || 0.5
      let n = 0
      setInterval(() => {
        stage.frame(0)
        const url = canvas.toDataURL('image/jpeg', 0.8)
        const ui = [...document.querySelectorAll('.screen.active')].map((e) => e.id).join('+') || 'none'
        fetch(`/__snap?name=live-${String(n++).padStart(3, '0')}-${state}-${ui}`, { method: 'POST', body: url })
      }, every * 1000)
    }
    // ?demo 用内置示意图或 &img= 照片直接跑一遍仪式（没有相机也能看效果）
    if (QS.has('demo')) {
      const detectPhoto = async (image) => {
        await ensureDetector()
        photo.setSource(image, { mirror: false })
        return visibleOnly(await detector.detectImage(image))
      }
      const demoTime = (still) => beginTime(still, false)
      import('./demo.js').then((m) => m.runDemo({ begin, stage, detectPhoto, beginTime: demoTime }))
    }
  }
}
