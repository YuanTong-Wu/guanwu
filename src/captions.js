// 起卦每一步的算法，仿《梅花易数·观梅占》的句式写，展示在仪式画面和解读页里。
// 例："鸟二数，得兑为上卦"、"申时九数，除八余一，得乾为下卦"、"物时共十一数，除六余五，九五动"。
import { toChinese, lineName } from './core/numerals.js'

function divided(v, n) {
  if (v <= n) return ''
  const r = v % n
  return r === 0 ? '，除尽' : `，除${n === 8 ? '八' : '六'}余${toChinese(r)}`
}

export function formulaCaptions(cast, label) {
  const f = cast.formula
  const moving = lineName(cast.movingLine, cast.original.lines[cast.movingLine - 1] === 1)
  if (cast.method === 'time') {
    return {
      upper: `年月日共${toChinese(f.upper.value)}数${divided(f.upper.value, 8)}，得${cast.upper.name}为上卦`,
      lower: `加时共${toChinese(f.lower.value)}数${divided(f.lower.value, 8)}，得${cast.lower.name}为下卦`,
      moving: `总${toChinese(f.moving.value)}数${divided(f.moving.value, 6)}，${moving}动`,
    }
  }
  const lower =
    cast.rule === 'count+hour'
      ? `物时共${toChinese(f.lower.value)}数${divided(f.lower.value, 8)}，得${cast.lower.name}为下卦`
      : `${cast.hour.label}${toChinese(cast.hour.num)}数${divided(cast.hour.num, 8)}，得${cast.lower.name}为下卦`
  return {
    upper: `${label}${toChinese(cast.count)}数${divided(cast.count, 8)}，得${cast.upper.name}为上卦`,
    lower,
    moving: `物时共${toChinese(f.moving.value)}数${divided(f.moving.value, 6)}，${moving}动`,
  }
}
