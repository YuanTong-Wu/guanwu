// 本地物体识别：MediaPipe ObjectDetector（Apache-2.0）+ EfficientDet-Lite0 int8（COCO 80 类）。
// 固定用 0.10.35：1.x 起内置了无法关闭的遥测（向谷歌服务器回报），既违背"画面不出手机"，在国内也连不上。
// int8 模型只能用 CPU 后端，放到 GPU 上会静默地返回 0 个结果。
// 模型和 wasm 都放在自己的站点下（public/models、public/mediapipe）。
const BASE = import.meta.env.BASE_URL || '/'
const MODEL_URL = `${BASE}models/efficientdet_lite0.tflite`
const WASM_BASE = `${BASE}mediapipe`
const SCORE = 0.3

// 构建时记下的原始大小（见 vite.config.js）
const RAW_SIZES = typeof __WQ_RAW_SIZES__ === 'object' ? __WQ_RAW_SIZES__ : {}

// 下载一个文件并报告进度（0–1）和线上字节数。keep 为假时只下载不留内容（wasm：
// 只为让浏览器缓存它，之后 MediaPipe 自己再取一次）
async function fetchWithProgress(url, onProgress, keep) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`model ${res.status}`)
  // 压缩传输时读到的是解压后的字节，Content-Length 却是压缩后的大小，只能按原始大小算
  const encoded = !!res.headers.get('content-encoding')
  const length = Number(res.headers.get('content-length')) || 0
  const raw = RAW_SIZES[url.split('/').pop()] || 0
  const total = encoded ? raw : length
  const wire = length || raw
  if (!res.body || !total) {
    const buf = await res.arrayBuffer()
    return keep ? new Uint8Array(buf) : null
  }
  const reader = res.body.getReader()
  const chunks = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (keep) chunks.push(value)
    got += value.length
    onProgress(Math.min(0.99, got / total), wire)
  }
  if (!keep) return null
  const out = new Uint8Array(got)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

// 同一个文件只下一次：首页空闲时先在后台下着（prefetchDetector），点"起卦"时接着用，进度也接得上
const downloads = new Map()
function download(url, keep) {
  let d = downloads.get(url)
  if (!d) {
    d = { progress: 0, wire: RAW_SIZES[url.split('/').pop()] || 1, listeners: new Set() }
    d.promise = fetchWithProgress(
      url,
      (p, wire) => {
        d.progress = p
        d.wire = wire
        for (const f of d.listeners) f()
      },
      keep,
    )
    d.promise.catch(() => downloads.delete(url))
    downloads.set(url, d)
  }
  return d
}

let wasmUrlPromise = null
function wasmUrl(vision) {
  wasmUrlPromise ??= Promise.resolve()
    .then(() => vision.FilesetResolver.isSimdSupported?.())
    .catch(() => true)
    .then((simd) => `${WASM_BASE}/${simd === false ? 'vision_wasm_nosimd_internal' : 'vision_wasm_internal'}.wasm`)
  return wasmUrlPromise
}

// 首页空闲时调用：先把模型和 wasm 下到本地，不创建识别器（不占 CPU）
export async function prefetchDetector() {
  try {
    download(MODEL_URL, true)
    const vision = await import('@mediapipe/tasks-vision')
    download(await wasmUrl(vision), false)
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
  const model = download(MODEL_URL, true)
  const vision = await import('@mediapipe/tasks-vision')
  const wasm = download(await wasmUrl(vision), false)
  const report = () => {
    const sum = model.wire + wasm.wire
    onProgress?.(Math.min(0.99, (model.progress * model.wire + wasm.progress * wasm.wire) / sum))
  }
  model.listeners.add(report)
  wasm.listeners.add(report)
  report()
  const [bytes] = await Promise.all([model.promise, wasm.promise.catch(() => null)]).finally(() => {
    model.listeners.delete(report)
    wasm.listeners.delete(report)
  })
  const { FilesetResolver, ObjectDetector } = vision
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const det = await ObjectDetector.createFromOptions(fileset, {
    // iOS 16.4–16.7 的内置浏览器里 OffscreenCanvas 没有 WebGL，给一块普通画布就能识别
    canvas: document.createElement('canvas'),
    baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
    runningMode: 'VIDEO',
    scoreThreshold: 0.2,
    maxResults: 60,
  })
  // 模型已拷进识别器，下载的缓存不用再留
  downloads.clear()
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
