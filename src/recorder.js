// 把整场仪式（画面 + 声音）录成一段视频，结束后可以直接分享或保存。
const TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export function canRecord(canvas) {
  return typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function'
}

// 不直接录 WebGL 画布（iOS 会因此强制保留绘图缓冲、掉帧），而是每帧拷到一块 2D 画布上再录。
// 输出最长边 1280，宽高取偶数（H.264 要求）。
export function startRecording(source, audioStream) {
  const canvas = document.createElement('canvas')
  if (!canRecord(canvas)) return null
  const W = source.clientWidth || source.width
  const H = source.clientHeight || source.height
  const scale = 1280 / Math.max(W, H)
  canvas.width = Math.round((W * scale) / 2) * 2
  canvas.height = Math.round((H * scale) / 2) * 2
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#050505'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const stream = canvas.captureStream(30)
  audioStream?.getAudioTracks().forEach((t) => stream.addTrack(t))
  const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
  let rec
  try {
    rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
  } catch {
    try {
      rec = new MediaRecorder(stream)
    } catch {
      return null
    }
  }
  const chunks = []
  rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data)
  rec.start(250)
  let lastFrame = null
  return {
    // 每次渲染之后立即调用（同一帧内 WebGL 画布内容仍然可读）
    draw(now = performance.now()) {
      // 视频只要 30 帧，屏幕是 60/120 帧时不必每帧都拷
      if (now - this.last < 30) return
      this.last = now
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
    },
    last: 0,
    // 最后一帧存成图片，微信里不能下载视频时用来长按保存
    poster() {
      try {
        lastFrame = canvas.toDataURL('image/jpeg', 0.9)
      } catch {
        lastFrame = null
      }
      return lastFrame
    },
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          const type = rec.mimeType || mimeType || 'video/webm'
          const blob = new Blob(chunks, { type })
          stream.getVideoTracks().forEach((t) => t.stop())
          resolve(blob.size > 0 ? blob : null)
        }
        try {
          rec.state !== 'inactive' ? rec.stop() : rec.onstop()
        } catch {
          resolve(null)
        }
      }),
  }
}

export async function shareOrSave(blob, name) {
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const file = new File([blob], `${name}.${ext}`, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
