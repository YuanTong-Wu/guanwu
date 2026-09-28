// 八卦按先天数排列：乾1 兑2 离3 震4 巽5 坎6 艮7 坤8。
// lines 自下而上，1 为阳爻，0 为阴爻。
export const TRIGRAMS = {
  1: { num: 1, name: '乾', image: '天', element: '金', lines: [1, 1, 1] },
  2: { num: 2, name: '兑', image: '泽', element: '金', lines: [1, 1, 0] },
  3: { num: 3, name: '离', image: '火', element: '火', lines: [1, 0, 1] },
  4: { num: 4, name: '震', image: '雷', element: '木', lines: [1, 0, 0] },
  5: { num: 5, name: '巽', image: '风', element: '木', lines: [0, 1, 1] },
  6: { num: 6, name: '坎', image: '水', element: '水', lines: [0, 1, 0] },
  7: { num: 7, name: '艮', image: '山', element: '土', lines: [0, 0, 1] },
  8: { num: 8, name: '坤', image: '地', element: '土', lines: [0, 0, 0] },
}

// 文王卦序：[序号, 卦名, 上卦先天数, 下卦先天数]
const KING_WEN = [
  [1, '乾', 1, 1], [2, '坤', 8, 8], [3, '屯', 6, 4], [4, '蒙', 7, 6],
  [5, '需', 6, 1], [6, '讼', 1, 6], [7, '师', 8, 6], [8, '比', 6, 8],
  [9, '小畜', 5, 1], [10, '履', 1, 2], [11, '泰', 8, 1], [12, '否', 1, 8],
  [13, '同人', 1, 3], [14, '大有', 3, 1], [15, '谦', 8, 7], [16, '豫', 4, 8],
  [17, '随', 2, 4], [18, '蛊', 7, 5], [19, '临', 8, 2], [20, '观', 5, 8],
  [21, '噬嗑', 3, 4], [22, '贲', 7, 3], [23, '剥', 7, 8], [24, '复', 8, 4],
  [25, '无妄', 1, 4], [26, '大畜', 7, 1], [27, '颐', 7, 4], [28, '大过', 2, 5],
  [29, '坎', 6, 6], [30, '离', 3, 3], [31, '咸', 2, 7], [32, '恒', 4, 5],
  [33, '遁', 1, 7], [34, '大壮', 4, 1], [35, '晋', 3, 8], [36, '明夷', 8, 3],
  [37, '家人', 5, 3], [38, '睽', 3, 2], [39, '蹇', 6, 7], [40, '解', 4, 6],
  [41, '损', 7, 2], [42, '益', 5, 4], [43, '夬', 2, 1], [44, '姤', 1, 5],
  [45, '萃', 2, 8], [46, '升', 8, 5], [47, '困', 2, 6], [48, '井', 6, 5],
  [49, '革', 2, 3], [50, '鼎', 3, 5], [51, '震', 4, 4], [52, '艮', 7, 7],
  [53, '渐', 5, 7], [54, '归妹', 4, 2], [55, '丰', 4, 3], [56, '旅', 3, 7],
  [57, '巽', 5, 5], [58, '兑', 2, 2], [59, '涣', 5, 6], [60, '节', 6, 2],
  [61, '中孚', 5, 2], [62, '小过', 4, 7], [63, '既济', 6, 3], [64, '未济', 3, 6],
]

function fullName(name, upper, lower) {
  const u = TRIGRAMS[upper]
  const l = TRIGRAMS[lower]
  if (upper === lower) return `${u.name}为${u.image}`
  return `${u.image}${l.image}${name}`
}

export const HEXAGRAMS = KING_WEN.map(([num, name, upper, lower]) => ({
  num,
  name,
  upper,
  lower,
  fullName: fullName(name, upper, lower),
  // 自下而上六爻：先下卦三爻，再上卦三爻
  lines: [...TRIGRAMS[lower].lines, ...TRIGRAMS[upper].lines],
}))

const BY_PAIR = new Map(HEXAGRAMS.map((h) => [`${h.upper}-${h.lower}`, h]))
const BY_LINES = new Map(HEXAGRAMS.map((h) => [h.lines.join(''), h]))

export function hexagramOf(upper, lower) {
  return BY_PAIR.get(`${upper}-${lower}`)
}

export function hexagramFromLines(lines) {
  return BY_LINES.get(lines.join(''))
}

export function trigramFromLines(lines) {
  return Object.values(TRIGRAMS).find((t) => t.lines.join('') === lines.join(''))
}
