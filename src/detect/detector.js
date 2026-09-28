// 本地物体识别：MediaPipe ObjectDetector（Apache-2.0）+ EfficientDet-Lite0（COCO 80 类）。
// 模型和 wasm 都放在自己的站点下（public/models、public/mediapipe），不连谷歌，画面不出手机。
const BASE = import.meta.env.BASE_URL || '/'
const MODEL_URL = `${BASE}models/efficientdet_lite0.tflite`
const WASM_BASE = `${BASE}mediapipe`
const SCORE = 0.35

// 下载模型并报告进度（0–1）
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`model ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
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

function convert(result) {
  return (result?.detections || [])
    .map((d) => {
      const c = d.categories?.[0]
      const b = d.boundingBox
      return c && b ? { category: c.categoryName, score: c.score, box: { x: b.originX, y: b.originY, width: b.width, height: b.height } } : null
    })
    .filter((d) => d && d.score >= SCORE)
}

export async function loadDetector(onProgress) {
  const [{ FilesetResolver, ObjectDetector }, model] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    fetchWithProgress(MODEL_URL, onProgress),
  ])
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const make = (delegate) =>
    ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: 'VIDEO',
      scoreThreshold: SCORE,
      maxResults: 24,
    })
  let det
  try {
    det = await make('GPU')
  } catch {
    det = await make('CPU')
  }
  onProgress?.(1)
  let mode = 'VIDEO'
  let lastTs = 0
  return {
    detect(video, now) {
      if (mode !== 'VIDEO') return []
      // 时间戳必须单调递增
      const ts = Math.max(lastTs + 1, Math.round(now))
      lastTs = ts
      return convert(det.detectForVideo(video, ts))
    },
    async detectImage(image) {
      await det.setOptions({ runningMode: 'IMAGE' })
      mode = 'IMAGE'
      try {
        return convert(det.detect(image))
      } finally {
        await det.setOptions({ runningMode: 'VIDEO' })
        mode = 'VIDEO'
      }
    },
  }
}
