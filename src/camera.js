// 摄像头：优先后置；失败时由调用方退到"拍照"。
export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no-getusermedia'), { code: 'unsupported' })
  const tries = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ]
  let lastError
  for (const constraints of tries) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      video.srcObject = stream
      video.setAttribute('playsinline', '')
      video.muted = true
      await video.play().catch(() => {})
      await waitForSize(video)
      const track = stream.getVideoTracks()[0]
      const facing = track.getSettings?.().facingMode
      return { stream, mirror: facing === 'user' }
    } catch (e) {
      lastError = e
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break
    }
  }
  throw Object.assign(lastError || new Error('camera-failed'), { code: lastError?.name || 'failed' })
}

function waitForSize(video) {
  return new Promise((resolve) => {
    if (video.videoWidth) return resolve()
    const on = () => {
      if (video.videoWidth) {
        video.removeEventListener('loadedmetadata', on)
        video.removeEventListener('resize', on)
        resolve()
      }
    }
    video.addEventListener('loadedmetadata', on)
    video.addEventListener('resize', on)
    setTimeout(resolve, 3000)
  })
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop())
}

// 把当前画面冻结成一张 canvas（原始分辨率，最长边不超过 1280）
export function grabFrame(source) {
  const w = source.videoWidth || source.naturalWidth || source.width
  const h = source.videoHeight || source.naturalHeight || source.height
  const scale = Math.min(1, 1280 / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.round(h * scale)
  c.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, c.width, c.height)
  return c
}

// 读用户选的照片，按 EXIF 方向摆正
export async function loadPhoto(file) {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * scale)
      c.height = Math.round(bmp.height * scale)
      c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, c.width, c.height)
      bmp.close?.()
      return c
    } catch {
      // 退到 <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return grabFrame(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}
