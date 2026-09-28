// 农历年支、月、日，给"年月日时起卦"用。
// 优先用浏览器自带的中国农历（0 KB）；不支持时再按需加载 lunar-javascript。
// 用设备本地时区；子时（23 点起）按传统算作次日。闰月按本月数。
import { BRANCHES } from './meihua.js'

const MONTHS = { 正: 1, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 冬: 11, 十一: 11, 腊: 12, 十二: 12 }

export function parseLunarMonth(text) {
  const t = String(text).replace('闰', '').replace('月', '')
  if (/^\d+$/.test(t)) return Number(t)
  return MONTHS[t] ?? null
}

function fromIntl(date) {
  const f = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const parts = Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]))
  const year = Number(parts.relatedYear)
  const month = parseLunarMonth(parts.month)
  const day = Number(parts.day)
  if (!year || !month || !day) return null
  const yearBranchNum = ((((year - 4) % 12) + 12) % 12) + 1
  return { year, yearBranchNum, yearBranch: BRANCHES[yearBranchNum - 1], month, day, leap: String(parts.month).includes('闰') }
}

export async function lunarNow(date) {
  // 子时换日
  const d = date.getHours() >= 23 ? new Date(date.getTime() + 60 * 60 * 1000) : date
  try {
    const r = fromIntl(d)
    if (r) return r
  } catch {
    // 退到库
  }
  const { Solar } = await import('lunar-javascript')
  const l = Solar.fromDate(d).getLunar()
  const zhi = l.getYearZhi()
  return { year: l.getYear(), yearBranchNum: BRANCHES.indexOf(zhi) + 1, yearBranch: zhi, month: Math.abs(l.getMonth()), day: l.getDay(), leap: l.getMonth() < 0 }
}

const STEMS = '甲乙丙丁戊己庚辛壬癸'
const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
const DAY_TENS = ['初', '十', '廿', '三']
const DAY_UNITS = '一二三四五六七八九十'

export function yearGanzhi(year) {
  const i = (((year - 4) % 60) + 60) % 60
  return STEMS[i % 10] + BRANCHES[i % 12]
}

export function lunarDayName(day) {
  if (day === 10) return '初十'
  if (day === 20) return '二十'
  if (day === 30) return '三十'
  return DAY_TENS[Math.floor(day / 10)] + DAY_UNITS[(day % 10) - 1]
}

// 年月日时起卦时画面上的纪时：写出起卦实际用的农历日子，如"乙巳年腊月廿三 · 申时"
export function lunarDateLine(lunar, hourLabel) {
  return `${yearGanzhi(lunar.year)}年${lunar.leap ? '闰' : ''}${MONTH_NAMES[lunar.month - 1]}月${lunarDayName(lunar.day)} · ${hourLabel}`
}

// 干支纪时，如"丙午年 · 丁酉月 · 乙巳日 · 申时"（年、月按节气交接）
export async function ganzhiLine(date, hourLabel) {
  try {
    const { Solar } = await import('lunar-javascript')
    const l = Solar.fromDate(date).getLunar()
    return `${l.getYearInGanZhiExact()}年 · ${l.getMonthInGanZhiExact()}月 · ${l.getDayInGanZhiExact()}日 · ${hourLabel}`
  } catch {
    return null
  }
}
