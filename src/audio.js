// 全部声音用 Web Audio 现场合成：大鼓、编钟、石磬、古琴拨弦、风声。不需要任何音频文件。
let ctx = null
let master = null
let reverb = null
let recordDest = null
let droneNodes = null

function impulse(seconds = 3.2, decay = 2.6) {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

// 必须在用户点击里调用一次（iOS 要求）
export function unlockAudio() {
  if (!ctx) {
    // iOS 17+：静音键打开时也出声
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'
    } catch {
      // 旧系统没有这个接口
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(comp)
    comp.connect(ctx.destination)
    reverb = ctx.createConvolver()
    reverb.buffer = impulse()
    const wet = ctx.createGain()
    wet.gain.value = 0.42
    reverb.connect(wet)
    wet.connect(master)
    if (ctx.createMediaStreamDestination) {
      recordDest = ctx.createMediaStreamDestination()
      comp.connect(recordDest)
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function audioStream() {
  return recordDest?.stream || null
}

function out(node, dry = 1, wet = 0.6) {
  const d = ctx.createGain()
  d.gain.value = dry
  node.connect(d)
  d.connect(master)
  if (wet > 0) {
    const w = ctx.createGain()
    w.gain.value = wet
    node.connect(w)
    w.connect(reverb)
  }
}

function noiseBuffer(seconds = 1) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function env(gainNode, t, attack, peak, decay) {
  const g = gainNode.gain
  g.setValueAtTime(0.0001, t)
  g.exponentialRampToValueAtTime(peak, t + attack)
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

const ready = () => ctx && ctx.state !== 'closed'

// 大鼓：低频下滑 + 鼓皮噪声
export function drum(strength = 1) {
  if (!ready()) return
  const t = ctx.currentTime
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(120, t)
  o.frequency.exponentialRampToValueAtTime(38, t + 0.35)
  const g = ctx.createGain()
  env(g, t, 0.004, 0.9 * strength, 1.1)
  o.connect(g)
  out(g, 1, 0.35)
  o.start(t)
  o.stop(t + 1.3)
  const n = ctx.createBufferSource()
  n.buffer = noiseBuffer(0.3)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 700
  const ng = ctx.createGain()
  env(ng, t, 0.002, 0.5 * strength, 0.18)
  n.connect(f)
  f.connect(ng)
  out(ng, 1, 0.3)
  n.start(t)
}

// 编钟：非谐波泛音，两两微差产生拍音，长余韵
export function bell(freq = 220, strength = 1, length = 4) {
  if (!ready()) return
  const t = ctx.currentTime
  const partials = [
    [1, 1, 1],
    [2.32, 0.55, 0.7],
    [4.25, 0.35, 0.45],
    [6.63, 0.2, 0.3],
    [9.38, 0.12, 0.2],
  ]
  for (const [ratio, amp, life] of partials) {
    for (const detune of [-1.2, 1.2]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq * ratio + detune
      const g = ctx.createGain()
      env(g, t, 0.003, 0.16 * amp * strength, length * life)
      o.connect(g)
      out(g, 1, 0.7)
      o.start(t)
      o.stop(t + length * life + 0.1)
    }
  }
  // 敲击声
  const n = ctx.createBufferSource()
  n.buffer = noiseBuffer(0.05)
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq * 6
  const ng = ctx.createGain()
  env(ng, t, 0.001, 0.25 * strength, 0.04)
  n.connect(f)
  f.connect(ng)
  out(ng, 1, 0.4)
  n.start(t)
}

// 石磬：清亮短促
export function chime(freq = 880, strength = 1) {
  if (!ready()) return
  const t = ctx.currentTime
  for (const [ratio, amp, life] of [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.2, 0.3], [8.93, 0.1, 0.2]]) {
    const o = ctx.createOscillator()
    o.frequency.value = freq * ratio
    const g = ctx.createGain()
    env(g, t, 0.002, 0.12 * amp * strength, 1.6 * life)
    o.connect(g)
    out(g, 1, 0.8)
    o.start(t)
    o.stop(t + 1.8 * life)
  }
}

// 古琴拨弦：Karplus-Strong，离线算好一段波形
const PENTATONIC = [146.83, 164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88]
export function pluck(step = 0, strength = 1) {
  if (!ready()) return
  const freq = PENTATONIC[Math.max(0, Math.min(PENTATONIC.length - 1, step))]
  const rate = ctx.sampleRate
  const len = Math.floor(rate * 2.2)
  const buf = ctx.createBuffer(1, len, rate)
  const d = buf.getChannelData(0)
  const period = Math.floor(rate / freq)
  const ring = new Float32Array(period)
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1
  let idx = 0
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % period
    const v = (ring[idx] + ring[next]) * 0.4985
    d[i] = ring[idx]
    ring[idx] = v
    idx = next
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 2400
  const g = ctx.createGain()
  g.gain.value = 0.5 * strength
  src.connect(f)
  f.connect(g)
  out(g, 1, 0.6)
  src.start()
}

// 风声/气流：带通噪声扫频
export function whoosh(duration = 1.2, up = true, strength = 1) {
  if (!ready()) return
  const t = ctx.currentTime
  const n = ctx.createBufferSource()
  n.buffer = noiseBuffer(duration + 0.2)
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.2
  f.frequency.setValueAtTime(up ? 180 : 2400, t)
  f.frequency.exponentialRampToValueAtTime(up ? 2600 : 160, t + duration)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.35 * strength, t + duration * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  n.connect(f)
  f.connect(g)
  out(g, 1, 0.5)
  n.start(t)
  n.stop(t + duration + 0.2)
}

// 裂响：翻爻时
export function crack(strength = 1) {
  if (!ready()) return
  const t = ctx.currentTime
  const n = ctx.createBufferSource()
  n.buffer = noiseBuffer(0.4)
  const f = ctx.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 1800
  const g = ctx.createGain()
  env(g, t, 0.001, 0.6 * strength, 0.25)
  n.connect(f)
  f.connect(g)
  out(g, 1, 0.5)
  n.start(t)
  drum(0.8 * strength)
}

// 盖印：闷响 + 木声 + 钟尾
export function sealThud() {
  if (!ready()) return
  drum(1.3)
  const t = ctx.currentTime
  const n = ctx.createBufferSource()
  n.buffer = noiseBuffer(0.12)
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 1100
  f.Q.value = 3
  const g = ctx.createGain()
  env(g, t, 0.001, 0.7, 0.09)
  n.connect(f)
  f.connect(g)
  out(g, 1, 0.3)
  n.start(t)
  setTimeout(() => bell(110, 0.9, 6), 60)
}

// 低沉持续音：动爻烧红时的张力
export function drone(on) {
  if (!ready()) return
  const t = ctx.currentTime
  if (on && !droneNodes) {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.6)
    const oscs = [55, 82.5, 110.4].map((f) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(g)
      o.start(t)
      return o
    })
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(200, t)
    lp.frequency.exponentialRampToValueAtTime(1400, t + 1.2)
    g.connect(lp)
    out(lp, 1, 0.5)
    droneNodes = { g, oscs }
  } else if (!on && droneNodes) {
    const { g, oscs } = droneNodes
    g.gain.cancelScheduledValues(t)
    g.gain.setValueAtTime(g.gain.value, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
    oscs.forEach((o) => o.stop(t + 0.2))
    droneNodes = null
  }
}
