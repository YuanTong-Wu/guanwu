import { Stage } from './stage/renderer.js'
import { PhotoLayer } from './stage/photo.js'
import { ScanOverlay } from './stage/scan.js'
import { BaguaRing } from './stage/ring.js'
import { ricePaper, softDot } from './stage/textures.js'
import { playRitual } from './ritual.js'
import { openCamera, grabFrame, loadPhoto } from './camera.js'
import { loadDetector } from './detect/detector.js'
import { pickCountable } from './core/labels.js'
import { castByCount, castByTime } from './core/meihua.js'
import { lunarNow } from './core/lunar.js'
import { toChinese } from './core/numerals.js'
import { renderReading } from './reading.js'
import { unlockAudio, audioStream, pluck, chime } from './audio.js'
import { startRecording, shareOrSave } from './recorder.js'

const $ = (id) => document.getElementById(id)
const canvas = $('stage')
const video = $('camera')

const stage = new Stage(canvas)
const paper = ricePaper()
const dot = softDot()
const photo = stage.add(new PhotoLayer(paper))
const overlay = stage.add(new ScanOverlay(stage))

// 书法字要画进纹理，必须等字体真正加载完
const fontsReady = Promise.all([
  document.fonts?.load?.('64px "WQ Brush"', '万物起卦乾坤'),
  document.fonts?.load?.('32px "WQ Serif"', '卦之'),
]).catch(() => {})

// 首页背景的先天圆图，字体就绪后再画
const homeRing = { opacity: 0 }
fontsReady.then(() => {
  const r = stage.add(new BaguaRing({ diameter: Math.min(stage.width * 1.25, stage.height * 0.8, 820) }))
  r.speed = 0.035
  r.object.position.z = -200
  Object.defineProperty(homeRing, 'opacity', { set: (v) => (r.opacity = v) })
  homeRing.opacity = state === 'home' ? 0.32 : 0
})

let state = 'home'
let detector = null
let camera = null
let ritual = null
let recording = null
let videoBlob = null
let lastCast = null
let stable = { key: '', since: 0 }
let lastDetections = []
let noneSince = 0
let detecting = false

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

// —— 主循环 ——
// 调试钩子：window.__wq.paused 冻结画面（演示模式 ?at=秒 用到）
const debug = (window.__wq = { paused: false, stage, ritual: null })
let last = performance.now()
function loop(now) {
  const dt = debug.paused ? 0 : Math.min(0.05, (now - last) / 1000)
  last = now
  if (state === 'scan') scanTick(now)
  stage.frame(dt)
  recording?.draw()
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// —— 开始 ——
let wakeLock = null
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen')
  } catch {
    wakeLock = null
  }
}

// 相机打不开的设备：首页按钮直接变成"拍照"，在同一次点击里打开系统相机（浏览器要求必须是用户点击）
let cameraFailed = false
function switchToPhotoMode(message) {
  cameraFailed = true
  $('start').querySelector('span').textContent = '拍照'
  $('start').setAttribute('aria-label', '拍一张照片来起卦')
  show('home')
  toast(message, 3600)
}

$('start').addEventListener('click', async () => {
  unlockAudio()
  if (cameraFailed) {
    $('photo-input').click()
    return
  }
  keepAwake()
  chime(1318, 0.6)
  show('loading')
  $('loading-text').textContent = '正在打开相机…'
  const detectorReady = ensureDetector()
  try {
    camera = await openCamera(video)
  } catch (e) {
    camera = null
    switchToPhotoMode(e.code === 'NotAllowedError' ? '没有相机权限。再点一下"拍照"，拍一张也能起卦' : '这里打不开相机。再点一下"拍照"，拍一张也能起卦')
    return
  }
  photo.setSource(video, { mirror: camera.mirror })
  photo.uniforms.uDim.value = 0
  try {
    await detectorReady
  } catch {
    toast('识别模型没加载成功，可以直接"以此刻起卦"')
  }
  enterScan()
})

async function ensureDetector() {
  if (detector) return detector
  $('loading-text').textContent = '正在准备识别（首次稍慢）…'
  detector = await loadDetector((p) => {
    if (state !== 'scan') $('loading-text').textContent = `正在准备识别 ${Math.round(p * 100)}%`
  })
  return detector
}

// 抖音、微信等内置浏览器里相机常常不可用，首页提示去系统浏览器打开
const UA = navigator.userAgent
const IN_APP = /aweme|BytedanceWebview|Douyin|MicroMessenger|QQ\/|Weibo/i.test(UA)
if (IN_APP) $('inapp-tip').hidden = false

// 相机开了却一直没有画面（微信 iOS 偶发黑屏）：4 秒后改用拍照
function watchBlackCamera() {
  const t0 = video.currentTime
  setTimeout(() => {
    if (state !== 'scan') return
    if (!video.videoWidth || video.currentTime === t0) {
      toast('相机没有画面，点下面的"改用拍照"', 4000)
      $('use-photo').classList.add('pulse')
    }
  }, 4000)
}

function enterScan() {
  state = 'scan'
  watchBlackCamera()
  stable = { key: '', since: performance.now() }
  noneSince = performance.now()
  homeRing.opacity = 0
  show('scan')
  $('scan-count').textContent = ''
  $('scan-hint').textContent = '对准想数的东西，稳住手机'
}

// —— 取景：边看边数 ——
function scanTick(now) {
  if (!detector || detecting || !video.videoWidth) return
  if (now - (scanTick.last || 0) < 110) return
  scanTick.last = now
  detecting = true
  let found = []
  try {
    found = detector.detect(video, now)
  } catch {
    found = []
  }
  detecting = false
  const pick = pickCountable(found)
  lastDetections = pick ? pick.items : []
  const boxes = lastDetections
    .map((d) => toScreenBox(d.box))
    .sort((a, b) => a.x - b.x)
  const before = overlay.frames.length
  overlay.setBoxes(boxes)
  if (boxes.length > before) pluck(Math.min(9, boxes.length - 1), 0.5)

  if (!pick) {
    $('scan-count').textContent = ''
    stable = { key: '', since: now }
    if (now - noneSince > 6000) $('scan-hint').textContent = '试试对准杯子、书、植物、人或车'
    return
  }
  noneSince = now
  $('scan-hint').textContent = '稳住，数好了就会自动起卦'
  $('scan-count').textContent = `${toChinese(pick.count)}${pick.label.measure}${pick.label.name}`
  const key = `${pick.category}:${pick.count}`
  if (key !== stable.key) stable = { key, since: now }
  // 同一个数稳定 1.8 秒，自动定格
  if (now - stable.since > 1800) lockFromVideo()
}

function toScreenBox(b) {
  const a = photo.sourceToScreen(b.x, b.y)
  const c = photo.sourceToScreen(b.x + b.width, b.y + b.height)
  return { x: Math.min(a.x, c.x), y: Math.min(a.y, c.y), width: Math.abs(c.x - a.x), height: Math.abs(c.y - a.y) }
}

$('lock').addEventListener('click', () => {
  if (state !== 'scan') return
  if (!lastDetections.length) {
    toast('还没数到东西，对准一点再试，或者"以此刻起卦"')
    return
  }
  lockFromVideo()
})

function lockFromVideo() {
  if (state !== 'scan') return
  const still = grabFrame(video)
  // 识别框是按视频原始分辨率给的，定格图最长边压到了 1280，要同比缩放
  const k = still.width / video.videoWidth
  const items = lastDetections.map((d) => ({
    ...d,
    box: { x: d.box.x * k, y: d.box.y * k, width: d.box.width * k, height: d.box.height * k },
  }))
  begin(still, pickCountable(items), { mirror: camera?.mirror })
}

// —— 拍照兜底 ——
$('use-photo').addEventListener('click', () => $('photo-input').click())
$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  unlockAudio()
  show('loading')
  $('loading-text').textContent = '正在看这张照片…'
  let still
  try {
    still = await loadPhoto(file)
    await ensureDetector()
  } catch {
    if (!still) {
      show('home')
      toast('这张照片读不出来，换一张试试')
      return
    }
  }
  photo.setSource(still, { mirror: false })
  let found = []
  try {
    found = detector ? await detector.detectImage(still) : []
  } catch {
    found = []
  }
  const pick = pickCountable(found)
  homeRing.opacity = 0
  if (!pick) {
    toast('照片里没数到东西，按此刻的时间起卦')
    beginTime(still)
    return
  }
  begin(still, pick, { mirror: false })
})

// —— 以时起卦兜底 ——
$('use-time').addEventListener('click', () => {
  unlockAudio()
  const still = video.videoWidth ? grabFrame(video) : null
  beginTime(still)
})

async function beginTime(still) {
  const now = new Date()
  const cast = castByTime(await lunarNow(now), now)
  // 没有物体时，以画面中心一块作为"化墨"的源头
  const W = stage.width
  const H = stage.height
  const box = { x: W * 0.3, y: H * 0.35, width: W * 0.4, height: H * 0.3 }
  if (still) photo.setSource(still, { mirror: camera?.mirror })
  else photo.setSource(blankCanvas(), { mirror: false })
  runRitual(still || blankCanvas(), [box], cast, '此刻')
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

// —— 起卦 ——
function begin(still, pick, { mirror }) {
  const now = new Date()
  const cast = castByCount(pick.count, now)
  photo.setSource(still, { mirror })
  const boxes = pick.items.map((d) => toScreenBox(d.box))
  const subject = `${toChinese(pick.count)}${pick.label.measure}${pick.label.name}`
  return runRitual(still, boxes, cast, subject)
}

async function runRitual(still, boxes, cast, subject) {
  state = 'ritual'
  await fontsReady
  homeRing.opacity = 0
  overlay.clear()
  show(null)
  lastCast = { cast, subject }
  photo.uniforms.uInk.value = 0
  photo.uniforms.uFlood.value = 0
  photo.uniforms.uHighlight.value = 0
  photo.setBoxes(boxes)
  videoBlob = null
  recording = startRecording(canvas, audioStream())
  ritual = playRitual({ stage, photo, image: still, boxes, cast, subjectText: subject, dotTexture: dot })
  debug.ritual = ritual
  ritual.done.then(async () => {
    state = 'ended'
    show('ended')
    if (recording) {
      const poster = recording.poster()
      videoBlob = await recording.stop()
      recording = null
      // 微信内置浏览器不能下载文件：给一张可长按保存的图，并提示去浏览器打开
      const inWeChat = /MicroMessenger/i.test(navigator.userAgent)
      $('save-video').hidden = !videoBlob || inWeChat
      if (poster && (inWeChat || !videoBlob)) {
        $('poster').src = poster
        $('poster-wrap').hidden = false
      }
    }
  })
}

// —— 结束后 ——
$('show-reading').addEventListener('click', () => {
  if (!lastCast) return
  $('reading-body').replaceChildren(renderReading(lastCast.cast, lastCast.subject))
  $('reading').hidden = false
})
$('close-reading').addEventListener('click', () => ($('reading').hidden = true))
$('reading').addEventListener('click', (e) => {
  if (e.target.id === 'reading') $('reading').hidden = true
})

$('save-video').addEventListener('click', async () => {
  if (!videoBlob || !lastCast) return
  const c = lastCast.cast
  const r = await shareOrSave(videoBlob, `万物起卦-${c.original.name}之${c.changed.name}`)
  if (r === 'downloaded') toast('视频已保存')
})

let lastAgain = 0
$('again').addEventListener('click', () => {
  // 一事不二占：连着再起，先提一句《蒙》卦的话，但不拦着
  if (Date.now() - lastAgain < 90_000) toast('初筮告，再三渎，渎则不告。——换一件事再问吧', 3200)
  lastAgain = Date.now()
  $('poster-wrap').hidden = true
  ritual?.dispose()
  ritual = null
  photo.uniforms.uInk.value = 0
  photo.uniforms.uFlood.value = 0
  photo.uniforms.uHighlight.value = 0
  photo.setBoxes([])
  if (camera && video.videoWidth) {
    photo.setSource(video, { mirror: camera.mirror })
    enterScan()
  } else {
    state = 'home'
    photo.object.visible = false
    homeRing.opacity = 0.32
    show('home')
  }
})


// 调试：?demo 用内置示意图直接跑一遍仪式（没有相机也能看效果）
if (new URLSearchParams(location.search).has('demo')) {
  import('./demo.js').then((m) => m.runDemo({ begin, stage }))
}
