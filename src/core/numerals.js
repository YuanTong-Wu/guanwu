const DIGITS = '零一二三四五六七八九'
const UNITS = ['', '十', '百', '千']

// 1–9999 转中文数字：11 → 十一，20 → 二十，101 → 一百零一。
export function toChinese(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n)
  if (n === 0) return '零'
  const digits = String(n).split('').map(Number)
  const len = digits.length
  let out = ''
  let pendingZero = false
  digits.forEach((d, i) => {
    const unit = UNITS[len - 1 - i]
    if (d === 0) {
      pendingZero = out !== ''
      return
    }
    if (pendingZero) out += '零'
    pendingZero = false
    out += DIGITS[d] + unit
  })
  // 十几读作"十几"而不是"一十几"
  if (len === 2 && out.startsWith('一十')) out = out.slice(1)
  return out
}

// 爻位名：初九、六二……上六
export function lineName(position, isYang) {
  const n = isYang ? '九' : '六'
  if (position === 1) return `初${n}`
  if (position === 6) return `上${n}`
  return `${n}${DIGITS[position]}`
}
