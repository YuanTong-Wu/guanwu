// 起卦每一步的算法说明，展示在仪式画面和解读页里。
import { toChinese, lineName } from './core/numerals.js'

const divide = (v, n, name) => (v > n ? `${toChinese(v)}，除${name}余${toChinese(v % n || n)}` : toChinese(v))

export function formulaCaptions(cast, subject) {
  const f = cast.formula
  const lowerDesc = `${cast.lower.name}（${cast.lower.image}）`
  const upperDesc = `${cast.upper.name}（${cast.upper.image}）`
  const moving = lineName(cast.movingLine, cast.original.lines[cast.movingLine - 1] === 1)
  if (cast.method === 'time') {
    return {
      lower: `年月日时共${divide(f.lower.value, 8, '八')} → 下卦${lowerDesc}`,
      upper: `年月日共${divide(f.upper.value, 8, '八')} → 上卦${upperDesc}`,
      moving: `${toChinese(f.moving.value)}，除六余${toChinese(f.moving.value % 6 || 6)} → ${moving}动`,
    }
  }
  const hourPart = `${cast.hour.label}数${toChinese(cast.hour.num)}`
  const lower =
    cast.rule === 'count+hour'
      ? `${toChinese(cast.count)}加${toChinese(cast.hour.num)}得${divide(f.lower.value, 8, '八')} → 下卦${lowerDesc}`
      : `${hourPart}${cast.hour.num > 8 ? `，除八余${toChinese(cast.hour.num % 8 || 8)}` : ''} → 下卦${lowerDesc}`
  return {
    lower,
    upper: `见${subject}${cast.count > 8 ? `，除八余${toChinese(cast.count % 8 || 8)}` : ''} → 上卦${upperDesc}`,
    moving: `${toChinese(cast.count)}加${toChinese(cast.hour.num)}得${divide(f.moving.value, 6, '六')} → ${moving}动`,
  }
}

