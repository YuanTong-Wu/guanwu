// 声音全部用 Web Audio 现场合成，不需要任何音频文件。
// 少而准：定格一声磬，墨滴一声"嗒"，每写一爻一声笔擦纸，六爻写完一声钟，盖印一声闷响。
// 数东西时每数到一个，一声木鱼。
let ctx = null
let master = null
let reverb = null
let recordDest = null

function impulse(seconds = 3.4, decay = 2.8) {
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
    comp.threshold.value = -16
    comp.ratio.value = 3
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(comp)
    comp.connect(ctx.destination)
    reverb = ctx.createConvolver()
    reverb.buffer = impulse()
    const wet = ctx.createGain()
    wet.gain.value = 0.38
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

const ready = () => ctx && ctx.state !== 'closed'
// 离线渲染时（合成预览视频的声轨）由调用方指定"此刻"
let offlineAt = null
const now = () => (offlineAt != null ? offlineAt : ctx.currentTime)

function buildChain(context) {
  const comp = context.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.ratio.value = 3
  const m = context.createGain()
  m.gain.value = 0.9
  m.connect(comp)
  comp.connect(context.destination)
  return { comp, master: m }
}

// 把一串 [时刻, 声音名, 参数] 离线渲染成一段音频（仅开发时合成预览视频用）
export async function renderCues(cues, duration) {
  const rate = 44100
  const off = new OfflineAudioContext(2, Math.ceil(rate * duration), rate)
  const saved = { ctx, master, reverb }
  ctx = off
  const chain = buildChain(off)
  master = chain.master
  reverb = off.createConvolver()
  reverb.buffer = impulse()
  const wet = off.createGain()
  wet.gain.value = 0.38
  reverb.connect(wet)
  wet.connect(master)
  const fns = { bell, chime, woodTick, inkDrop, brush, sealThud }
  for (const [at, name, args] of cues) {
    offlineAt = at
    fns[name]?.(...args)
  }
  offlineAt = null
  const buf = await off.startRendering()
  ;({ ctx, master, reverb } = saved)
  return buf
}

// 开发用：记录仪式里每个声音的时刻
export const cueLog = { enabled: false, clock: () => 0, list: [] }
function logCue(name, args) {
  if (cueLog.enabled) cueLog.list.push([cueLog.clock(), name, args])
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

function noise(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

function env(gainNode, t, attack, peak, decay) {
  const g = gainNode.gain
  g.setValueAtTime(0.0001, t)
  g.exponentialRampToValueAtTime(peak, t + attack)
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function partial(freq, amp, decay, t, wet = 0.7) {
  const o = ctx.createOscillator()
  o.frequency.value = freq
  const g = ctx.createGain()
  env(g, t, 0.003, amp, decay)
  o.connect(g)
  out(g, 1, wet)
  o.start(t)
  o.stop(t + decay + 0.05)
}

// 编钟：非谐波泛音，两两微差出拍音，长余韵
export function bell(freq = 110, strength = 1, length = 6) {
  logCue('bell', [freq, strength, length])
  if (!ready()) return
  const t = now()
  for (const [ratio, amp, life] of [[0.5, 0.35, 1], [1, 1, 0.9], [1.19, 0.5, 0.7], [2, 0.35, 0.45], [2.74, 0.22, 0.3], [3.76, 0.12, 0.2]]) {
    partial(freq * ratio - 0.8, 0.09 * amp * strength, length * life, t)
    partial(freq * ratio + 0.8, 0.09 * amp * strength, length * life, t)
  }
}

// 石磬：清亮，一击即收
export function chime(freq = 1046, strength = 1) {
  logCue('chime', [freq, strength])
  if (!ready()) return
  const t = now()
  for (const [ratio, amp, life] of [[1, 1, 1.6], [2.756, 0.35, 0.7], [5.404, 0.15, 0.35], [8.933, 0.06, 0.2]]) partial(freq * ratio, 0.11 * amp * strength, life, t, 0.8)
}

// 木鱼：数到一个东西，"笃"一声
export function woodTick(strength = 1) {
  logCue('woodTick', [strength])
  if (!ready()) return
  const t = now()
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(640, t)
  o.frequency.exponentialRampToValueAtTime(470, t + 0.08)
  const g = ctx.createGain()
  env(g, t, 0.002, 0.28 * strength, 0.1)
  o.connect(g)
  out(g, 1, 0.25)
  o.start(t)
  o.stop(t + 0.2)
}

// 一滴墨落在纸上："嗒"，带一点低沉的回响
export function inkDrop() {
  logCue('inkDrop', [])
  if (!ready()) return
  const t = now()
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(1100, t)
  o.frequency.exponentialRampToValueAtTime(260, t + 0.05)
  const g = ctx.createGain()
  env(g, t, 0.001, 0.22, 0.09)
  o.connect(g)
  out(g, 1, 0.6)
  o.start(t)
  o.stop(t + 0.2)
  const low = ctx.createOscillator()
  low.frequency.setValueAtTime(95, t)
  low.frequency.exponentialRampToValueAtTime(60, t + 0.6)
  const lg = ctx.createGain()
  env(lg, t, 0.005, 0.3, 0.9)
  low.connect(lg)
  out(lg, 1, 0.5)
  low.start(t)
  low.stop(t + 1.1)
}

// 毛笔擦过宣纸：带通噪声，起笔重、收笔轻
export function brush(duration = 0.34, strength = 1) {
  logCue('brush', [duration, strength])
  if (!ready()) return
  const t = now()
  const n = noise(duration + 0.1)
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(1400, t)
  f.frequency.linearRampToValueAtTime(2600, t + duration)
  f.Q.value = 0.7
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16 * strength, t + 0.03)
  g.gain.exponentialRampToValueAtTime(0.05 * strength, t + duration * 0.8)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  n.connect(f)
  f.connect(g)
  out(g, 1, 0.2)
  n.start(t)
  n.stop(t + duration + 0.1)
}

// 盖印："砰"——低沉的一击加一声木质的敲击，不拖尾
export function sealThud() {
  logCue('sealThud', [])
  if (!ready()) return
  const t = now()
  const o = ctx.createOscillator()
  o.frequency.setValueAtTime(92, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.25)
  const g = ctx.createGain()
  env(g, t, 0.003, 0.95, 0.55)
  o.connect(g)
  out(g, 1, 0.25)
  o.start(t)
  o.stop(t + 0.7)
  const n = noise(0.1)
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 850
  f.Q.value = 2.5
  const ng = ctx.createGain()
  env(ng, t, 0.001, 0.55, 0.07)
  n.connect(f)
  f.connect(ng)
  out(ng, 1, 0.3)
  n.start(t)
}
