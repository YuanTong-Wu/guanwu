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

// 下载模型并报告进度（0–1）
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`model ${res.status}`)
  // 压缩传输时读到的是解压后的字节，Content-Length 却是压缩后的大小，只能按原始大小算
  const encoded = !!res.headers.get('content-encoding')
  const total = encoded ? RAW_SIZES[url.split('/').pop()] || 0 : Number(res.headers.get('content-length')) || 0
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    onProgress?.(Math.min(0.99, got / total))
  }
  const out = new Uint8Array(got)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
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
  // wasm 和模型同时下（wasm 先进浏览器缓存），进度按两者总字节算
  const simd = await import('@mediapipe/tasks-vision').then((m) => m.FilesetResolver.isSimdSupported?.()).catch(() => true)
  const wasmUrl = `${WASM_BASE}/${simd === false ? 'vision_wasm_nosimd_internal' : 'vision_wasm_internal'}.wasm`
  const parts = { model: 0, wasm: 0 }
  const report = () => onProgress?.(Math.min(0.99, parts.model * 0.3 + parts.wasm * 0.7))
  const [{ FilesetResolver, ObjectDetector }, model] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    fetchWithProgress(MODEL_URL, (p) => ((parts.model = p), report())),
    fetchWithProgress(wasmUrl, (p) => ((parts.wasm = p), report())).catch(() => null),
  ])
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const det = await ObjectDetector.createFromOptions(fileset, {
    // iOS 16.4–16.7 的内置浏览器里 OffscreenCanvas 没有 WebGL，给一块普通画布就能识别
    canvas: document.createElement('canvas'),
    baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
    runningMode: 'VIDEO',
    scoreThreshold: 0.2,
    maxResults: 60,
  })
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
