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
// firstByte / stall：多久没有响应、中途多久没有新数据就放弃（毫秒，0 为不限）
async function fetchWithProgress(url, onProgress, keep, { firstByte = 0, stall = 0 } = {}) {
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
    // 压缩传输时读到的是解压后的字节，Content-Length 却是压缩后的大小（或者没有），只能按原始大小算
    const encoded = !!res.headers.get('content-encoding')
    const length = Number(res.headers.get('content-length')) || 0
    const raw = RAW_SIZES[url.split('/').pop()] || 0
    const total = encoded ? raw : length || raw
    const wire = encoded ? length || raw * 0.35 : length || raw
    const chunks = []
    let got = 0
    if (!res.body || !total) {
      arm(stall && stall * 4)
      const buf = new Uint8Array(await res.arrayBuffer())
      return keep ? buf : null
    }
    const reader = res.body.getReader()
    for (;;) {
      arm(stall)
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
        const gz = await fetchWithProgress(`${MODEL_URL}.gz`, report, true)
        // 有的服务器会带着 Content-Encoding 发 .gz，浏览器已替我们解开了：看开头是 gzip 还是模型本身
        const out = isGzip(gz) ? new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : gz
        if (isTflite(out)) return out
      } catch {
        // 解压失败
      }
      // 没有 .gz（开发服务器会拿首页冒充）或内容不对：下原文件
      report(0)
    }
    return fetchWithProgress(MODEL_URL, report, true)
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
        const bytes = await fetchWithProgress(`${MIRROR}/${file}`, report, true, { firstByte: 6000, stall: 8000 })
        if ((await sha256(bytes)) === hash) return { local: false, url: URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' })) }
      } catch {
        // 镜像不通或太慢：用自己的
      }
      report(0)
    }
    await fetchWithProgress(`${WASM_BASE}/${file}`, report, false)
    return { local: true, url: `${WASM_BASE}/${file}` }
  })
}

// 首页空闲时调用：先把模型和 wasm 下到本地，不创建识别器（不占 CPU）
export async function prefetchDetector() {
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
  const report = () => {
    const sum = model.wire + wasm.wire
    onProgress?.(Math.min(0.99, (model.progress * model.wire + wasm.progress * wasm.wire) / sum))
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
    if (!binary || binary.local) throw e
    // blob: 地址在个别内置浏览器里用不了：退回自己站点上的
    det = await ObjectDetector.createFromOptions(await FilesetResolver.forVisionTasks(WASM_BASE), options)
  } finally {
    if (binary && !binary.local) URL.revokeObjectURL(binary.url)
  }
  // 模型已拷进识别器，下载的东西不用再留
  jobs.clear()
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
