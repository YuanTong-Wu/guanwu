// 梅花易数的起卦算法。只做"排"，不做"断"。
import { TRIGRAMS, hexagramOf, hexagramFromLines, trigramFromLines } from './hexagrams.js'

export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

// 时辰：子时 23:00–00:59 为 1，丑时 01:00–02:59 为 2，……亥时 21:00–22:59 为 12。
export function shichen(date) {
  const index = Math.floor(((date.getHours() + 1) % 24) / 2)
  return { num: index + 1, branch: BRANCHES[index], label: `${BRANCHES[index]}时` }
}

const mod = (n, m) => n % m || m

// 由上卦、下卦、动爻排出本卦、变卦和互卦。
export function arrange(upperNum, lowerNum, movingLine) {
  const original = hexagramOf(upperNum, lowerNum)
  const changedLines = original.lines.slice()
  changedLines[movingLine - 1] = 1 - changedLines[movingLine - 1]
  const changed = hexagramFromLines(changedLines)
  // 互卦：本卦二三四爻为下，三四五爻为上
  const l = original.lines
  const mutual = hexagramFromLines([l[1], l[2], l[3], l[2], l[3], l[4]])
  // 体用：动爻所在的卦为用，另一卦为体
  const movingInUpper = movingLine > 3
  const ti = TRIGRAMS[movingInUpper ? lowerNum : upperNum]
  const yong = TRIGRAMS[movingInUpper ? upperNum : lowerNum]
  return {
    upper: TRIGRAMS[upperNum],
    lower: TRIGRAMS[lowerNum],
    movingLine,
    original,
    changed,
    mutual,
    changedUpper: trigramFromLines(changedLines.slice(3)),
    changedLower: trigramFromLines(changedLines.slice(0, 3)),
    ti,
    yong,
  }
}

// 物数占的下卦，原文两处都说只用时数：
//   卷一「凡見有可數之物，即以此數起作上卦，以時數配作下卦。即以卦數並時數總除六取動爻。」
//   序「所見之物，則以件目之多寡起數而為上卦，以所值之時數作下卦」
// 现代不少教程按声音占类推为"物数加时数"。这里默认从原文，改这一个常量即可切换。
export const COUNT_LOWER_RULE = 'hour' // 'hour'：原文；'count+hour'：流行类推

// 物数占：见可数之物，以其数为上卦，以时数为下卦，以卦数并时数总除六取动爻。
export function castByCount(count, date, rule = COUNT_LOWER_RULE) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer')
  const hour = shichen(date)
  const total = count + hour.num
  const lowerValue = rule === 'count+hour' ? total : hour.num
  return {
    method: 'count',
    rule,
    count,
    hour,
    formula: {
      upper: { value: count, remainder: mod(count, 8) },
      lower: { value: lowerValue, remainder: mod(lowerValue, 8) },
      moving: { value: total, remainder: mod(total, 6) },
    },
    ...arrange(mod(count, 8), mod(lowerValue, 8), mod(total, 6)),
  }
}

// 声音占：「凡聞聲音，數得幾數，起作上卦，加時數配作下卦。」这里原文明确加时数。
export function castBySound(count, date) {
  return { ...castByCount(count, date, 'count+hour'), method: 'sound' }
}

// 年月日时起卦：年支数 + 农历月 + 农历日为上卦，再加时数为下卦，总数除六取动爻。
// lunar = { yearBranchNum, month, day }，由调用方用农历库算好传入。
export function castByTime(lunar, date) {
  const hour = shichen(date)
  const base = lunar.yearBranchNum + lunar.month + lunar.day
  const total = base + hour.num
  return {
    method: 'time',
    lunar,
    hour,
    formula: {
      upper: { value: base, remainder: mod(base, 8) },
      lower: { value: total, remainder: mod(total, 8) },
      moving: { value: total, remainder: mod(total, 6) },
    },
    ...arrange(mod(base, 8), mod(total, 8), mod(total, 6)),
  }
}

const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
const CONTROLS = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }

// 体用生克：只报告关系本身，吉凶交给传统说法，界面上不做预测。
export function tiYongRelation(ti, yong) {
  const a = ti.element
  const b = yong.element
  if (a === b) return { key: 'same', text: `体用同为${a}（比和）` }
  if (GENERATES[b] === a) return { key: 'yong-generates-ti', text: `用${b}生体${a}` }
  if (GENERATES[a] === b) return { key: 'ti-generates-yong', text: `体${a}生用${b}` }
  if (CONTROLS[a] === b) return { key: 'ti-controls-yong', text: `体${a}克用${b}` }
  return { key: 'yong-controls-ti', text: `用${b}克体${a}` }
}
