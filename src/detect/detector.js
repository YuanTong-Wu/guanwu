// 本地物体识别：MediaPipe ObjectDetector（Apache-2.0）+ EfficientDet-Lite0 int8（COCO 80 类）。
// 固定用 0.10.35：1.x 起内置了无法关闭的遥测（向谷歌服务器回报），既违背"画面不出手机"，在国内也连不上。
// int8 模型只能用 CPU 后端，放到 GPU 上会静默地返回 0 个结果。
// 模型和运行时都放在自己的站点下（public/models、public/mediapipe）。最大的 wasm（11 MB）先从国内的
// npm 镜像（npmmirror，阿里云 CDN）下载，和自己这份逐字节核对无误才用；镜像连不上、太慢或不一致，就用自己的。
const BASE = import.meta.env.BASE_URL || '/'
const MODEL_URL = `${BASE}models/efficientdet_lite0.tflite`
const WASM_BASE = `${BASE}mediapipe`
const MIRROR = 'https://registry.npmmirror.com/@mediapipe/tasks-vision/0.10.35/files/wasm'
const SCORE = 0.3

// 构建时记下的原始大小和 SHA-256（见 vite.config.js）
const RAW_SIZES = typeof __WQ_RAW_SIZES__ === 'object' ? __WQ_RAW_SIZES__ : {}
const SHA256 = typeof __WQ_SHA256__ === 'object' ? __WQ_SHA256__ : {}

// 下载一个文件，报告进度（0–1）和线上字节数。keep 为假时只下载不留内容（为让浏览器缓存它）。
// total：解压后的字节数（浏览器交给我们的总是解压后的内容；跨域时连是否压缩都看不到，只能按构建时记下的算），
// 也可以是函数：看了第一块数据再定。
// firstByte / stall：多久没有响应、中途多久没有新数据就放弃（毫秒，0 为不限）
async function fetchWithProgress(url, onProgress, keep, { total = 0, firstByte = 0, stall = 0 } = {}) {
  const ctrl = new AbortController()
  let timer = 0
  const arm = (ms) => {
    clearTimeout(timer)
    if (ms) timer = setTimeout(() => ctrl.abort(), ms)
  }
  try {
    arm(firstByte)
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`${url.split('/').pop()} ${res.status}`)
    const wire = Number(res.headers.get('content-length')) || 0
    if (!res.body || !total) {
      arm(stall && stall * 4)
      const buf = new Uint8Array(await res.arrayBuffer())
      return keep ? buf : null
    }
    const chunks = []
    let got = 0
    let size = typeof total === 'number' ? total : 0
    const reader = res.body.getReader()
    for (;;) {
      arm(stall)
      const { done, value } = await reader.read()
      if (done) break
      if (keep) chunks.push(value)
      if (!size) size = total(value)
      got += value.length
      onProgress(Math.min(0.99, got / size), wire)
    }
    if (!keep) return null
    const out = new Uint8Array(got)
    let o = 0
    for (const c of chunks) {
      out.set(c, o)
      o += c.length
    }
    return out
  } finally {
    clearTimeout(timer)
  }
}

// 同一样东西只下一次：首页空闲时先在后台下着（prefetchDetector），点"起卦"时接着用，进度也接得上
const jobs = new Map()
function job(key, wire, run) {
  let j = jobs.get(key)
  if (!j) {
    j = { progress: 0, wire, listeners: new Set() }
    j.promise = run((p, w) => {
      j.progress = p
      if (w) j.wire = w
      for (const f of j.listeners) f()
    })
    j.promise.catch(() => jobs.delete(key))
    jobs.set(key, j)
  }
  return j
}

const isGzip = (b) => b[0] === 0x1f && b[1] === 0x8b
// TFLite 模型在第 4–7 字节写着 "TFL3"
const isTflite = (b) => b.length > 8 && b[4] === 0x54 && b[5] === 0x46 && b[6] === 0x4c && b[7] === 0x33

// 模型：浏览器会解压 gzip 时下 .gz（小三成），否则下原文件
function modelJob() {
  return job('model', RAW_SIZES['efficientdet_lite0.tflite.gz'] || RAW_SIZES['efficientdet_lite0.tflite'] || 1, async (report) => {
    if (typeof DecompressionStream === 'function') {
      try {
        // 一般拿到的是 .gz 原样；个别服务器带着 Content-Encoding 发，浏览器替我们解开了，那就按原大小算
        const gzSize = RAW_SIZES['efficientdet_lite0.tflite.gz']
        const rawSize = RAW_SIZES['efficientdet_lite0.tflite']
        const gz = await fetchWithProgress(`${MODEL_URL}.gz`, report, true, { total: (first) => (isGzip(first) ? gzSize : rawSize) })
        const out = isGzip(gz) ? new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : gz
        if (isTflite(out)) return out
      } catch {
        // 解压失败
      }
      // 没有 .gz（开发服务器会拿首页冒充）或内容不对：下原文件
      report(0)
    }
    return fetchWithProgress(MODEL_URL, report, true, { total: RAW_SIZES['efficientdet_lite0.tflite'] })
  })
}

async function sha256(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}

// wasm：先试镜像，核对通过就做成 blob: 地址交给 MediaPipe；否则把自己站点上的下进浏览器缓存，给出它的地址
let wasmNamePromise = null
function wasmName(vision) {
  wasmNamePromise ??= Promise.resolve()
    .then(() => vision.FilesetResolver.isSimdSupported?.())
    .catch(() => true)
    .then((simd) => (simd === false ? 'vision_wasm_nosimd_internal' : 'vision_wasm_internal'))
  return wasmNamePromise
}
function wasmJob(name) {
  const file = `${name}.wasm`
  return job(`wasm:${name}`, (RAW_SIZES[file] || 1) * 0.35, async (report) => {
    const hash = SHA256[file]
    if (hash && globalThis.crypto?.subtle) {
      try {
        const bytes = await fetchWithProgress(`${MIRROR}/${file}`, report, true, { total: RAW_SIZES[file], firstByte: 6000, stall: 8000 })
        if ((await sha256(bytes)) === hash) return { local: false, url: URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' })) }
      } catch {
        // 镜像不通或太慢：用自己的
      }
      report(0)
    }
    await fetchWithProgress(`${WASM_BASE}/${file}`, report, false, { total: RAW_SIZES[file] })
    return { local: true, url: `${WASM_BASE}/${file}` }
  })
}

// 首页空闲时调用：先把模型和 wasm 下到本地，不创建识别器（不占 CPU）
let loaded = false
export async function prefetchDetector() {
  if (loaded) return
  try {
    modelJob()
    const vision = await import('@mediapipe/tasks-vision')
    wasmJob(await wasmName(vision))
  } catch {
    // 预下载失败没关系，点"起卦"时会重下
  }
}

function convert(result, minScore) {
  return (result?.detections || [])
    .map((d) => {
      const c = d.categories?.[0]
      const b = d.boundingBox
      return c && b ? { category: c.categoryName, score: c.score, box: { x: b.originX, y: b.originY, width: b.width, height: b.height } } : null
    })
    .filter((d) => d && d.score >= minScore)
}

export async function loadDetector(onProgress) {
  // 模型先开始下，同时加载 MediaPipe 本体，再下对应的 wasm；进度按两者线上字节数加权
  const model = modelJob()
  const vision = await import('@mediapipe/tasks-vision')
  const name = await wasmName(vision)
  const wasm = wasmJob(name)
  // 镜像不通改下自己的、.gz 不行改下原文件时，单项进度会回到 0：显示的数只增不减
  let shown = 0
  const report = () => {
    const p = Math.min(0.99, (model.progress * model.wire + wasm.progress * wasm.wire) / (model.wire + wasm.wire))
    if (p > shown) onProgress?.((shown = p))
  }
  model.listeners.add(report)
  wasm.listeners.add(report)
  report()
  const [bytes, binary] = await Promise.all([model.promise, wasm.promise.catch(() => null)]).finally(() => {
    model.listeners.delete(report)
    wasm.listeners.delete(report)
  })
  const { FilesetResolver, ObjectDetector } = vision
  const options = {
    // iOS 16.4–16.7 的内置浏览器里 OffscreenCanvas 没有 WebGL，给一块普通画布就能识别
    canvas: document.createElement('canvas'),
    baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
    runningMode: 'VIDEO',
    scoreThreshold: 0.2,
    maxResults: 60,
  }
  let det
  try {
    // 加载器（.js）总是用自己的；wasm 本体用镜像下好的那份（blob:）或自己的
    const fileset = binary && !binary.local ? { wasmLoaderPath: `${WASM_BASE}/${name}.js`, wasmBinaryPath: binary.url } : await FilesetResolver.forVisionTasks(WASM_BASE)
    det = await ObjectDetector.createFromOptions(fileset, options)
  } catch (e) {
    // 只有 blob: 地址取不到（个别内置浏览器）才退回自己站点上的；别的错（内存、显卡）换一份同样的文件也没用
    if (!binary || binary.local || !/fetching of the wasm failed/.test(String(e?.message))) throw e
    det = await ObjectDetector.createFromOptions(await FilesetResolver.forVisionTasks(WASM_BASE), options)
  } finally {
    if (binary && !binary.local) {
      URL.revokeObjectURL(binary.url)
      // 地址已作废，下次重试要重新下
      jobs.delete(`wasm:${name}`)
    }
  }
  // 模型已拷进识别器，下载的东西不用再留
  jobs.clear()
  loaded = true
  onProgress?.(1)
  let mode = 'VIDEO'
  let lastTs = 0
  return {
    detect(video, now) {
      if (mode !== 'VIDEO') return []
      // 时间戳必须单调递增
      const ts = Math.max(lastTs + 1, Math.round(now))
      lastTs = ts
      return convert(det.detectForVideo(video, ts), SCORE)
    },
    // 定格的照片：先按常规阈值；一个都没有时放宽到 0.2 再试
    async detectImage(image) {
      await det.setOptions({ runningMode: 'IMAGE' })
      mode = 'IMAGE'
      try {
        const raw = det.detect(image)
        const found = convert(raw, SCORE)
        return found.length ? found : convert(raw, 0.2)
      } finally {
        await det.setOptions({ runningMode: 'VIDEO' })
        mode = 'VIDEO'
      }
    },
  }
}
