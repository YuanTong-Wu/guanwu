// 开发用：AudioBuffer → 16 位 WAV 的 data URL
export function wavDataUrl(buf) {
  const ch = buf.numberOfChannels
  const len = buf.length
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2))
  const str = (o, t) => [...t].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  data.setUint32(4, 36 + len * ch * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, ch, true)
  data.setUint32(24, buf.sampleRate, true)
  data.setUint32(28, buf.sampleRate * ch * 2, true)
  data.setUint16(32, ch * 2, true)
  data.setUint16(34, 16, true)
  str(36, 'data')
  data.setUint32(40, len * ch * 2, true)
  const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]))
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  }
  let bin = ''
  const bytes = new Uint8Array(data.buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:audio/wav;base64,${btoa(bin)}`
}

function paintScene(n) {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 1280
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, c.height)
  sky.addColorStop(0, '#7fa6c9')
  sky.addColorStop(0.6, '#d9c9a8')
  sky.addColorStop(1, '#6f7d5a')
  g.fillStyle = sky
  g.fillRect(0, 0, c.width, c.height)
  // 远山
  g.fillStyle = 'rgba(70,90,80,0.55)'
  g.beginPath()
  g.moveTo(0, 900)
  for (let x = 0; x <= c.width; x += 40) g.lineTo(x, 820 - Math.sin(x / 90) * 60 - Math.sin(x / 37) * 18)
  g.lineTo(c.width, c.height)
  g.lineTo(0, c.height)
  g.fill()
  // 树枝
  g.strokeStyle = '#3b2a1c'
  g.lineCap = 'round'
  g.lineWidth = 26
  g.beginPath()
  g.moveTo(-20, 760)
  g.quadraticCurveTo(360, 640, 760, 560)
  g.stroke()
  g.lineWidth = 10
  g.beginPath()
  g.moveTo(420, 650)
  g.quadraticCurveTo(470, 560, 560, 520)
  g.stroke()
  // 梅花
  for (let i = 0; i < 24; i++) {
    const x = 60 + i * 28
    const y = 740 - i * 8 + Math.sin(i * 1.7) * 30
    g.fillStyle = i % 3 ? '#f4d0d6' : '#e98ea0'
    g.beginPath()
    g.arc(x, y - 20, 9, 0, Math.PI * 2)
    g.fill()
  }
  const boxes = []
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1)
    const x = 40 + t * 640
    const y = 760 - t * 190 - 44
    const s = n > 3 ? 0.8 : 1
    g.save()
    g.translate(x, y)
    g.scale(i % 2 ? -s : s, s)
    g.fillStyle = '#6b4a2f'
    g.beginPath()
    g.ellipse(0, 0, 40, 27, -0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#8a5d35'
    g.beginPath()
    g.arc(32, -22, 19, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#e9e1cf'
    g.beginPath()
    g.ellipse(6, 8, 22, 12, -0.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#d99a2b'
    g.beginPath()
    g.moveTo(48, -24)
    g.lineTo(66, -18)
    g.lineTo(48, -14)
    g.fill()
    g.fillStyle = '#111'
    g.beginPath()
    g.arc(38, -26, 3.5, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#4a3220'
    g.beginPath()
    g.moveTo(-36, -6)
    g.lineTo(-78, -30)
    g.lineTo(-70, 8)
    g.fill()
    g.restore()
    boxes.push({ x: x - 80 * s, y: y - 50 * s, width: 160 * s, height: 90 * s })
  }
  return { canvas: c, boxes }
}

