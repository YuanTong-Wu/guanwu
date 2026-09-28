// 极简时间轴：按时刻触发补间和事件，整场仪式用它编排节奏。
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t) => {
    const c1 = 2.2
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  },
}

export class Timeline {
  constructor() {
    this.items = []
    this.time = 0
    this.running = false
  }

  // 在 at 秒开始，duration 秒内把 0→1 的进度交给 fn
  tween(at, duration, fn, easing = ease.linear) {
    this.items.push({ at, duration, fn, easing, done: false, started: false })
    return this
  }

  // 在 at 秒触发一次
  call(at, fn) {
    this.items.push({ at, duration: 0, fn, once: true, done: false })
    return this
  }

  get end() {
    return this.items.reduce((m, i) => Math.max(m, i.at + i.duration), 0)
  }

  start() {
    this.time = 0
    this.running = true
    this.items.forEach((i) => {
      i.done = false
      i.started = false
    })
  }

  update(dt) {
    if (!this.running) return
    this.time += dt
    for (const i of this.items) {
      if (i.done || this.time < i.at) continue
      if (i.once) {
        i.done = true
        i.fn()
        continue
      }
      const p = Math.min(1, (this.time - i.at) / i.duration)
      i.fn(i.easing(p), p)
      if (p >= 1) i.done = true
    }
    if (this.items.every((i) => i.done)) this.running = false
  }
}
