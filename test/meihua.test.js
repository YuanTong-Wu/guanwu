import test from 'node:test'
import assert from 'node:assert/strict'
import { HEXAGRAMS, TRIGRAMS, hexagramOf } from '../src/core/hexagrams.js'
import { shichen, castByCount, castBySound, castByTime, arrange, tiYongRelation } from '../src/core/meihua.js'

test('64 hexagrams, each line pattern unique', () => {
  assert.equal(HEXAGRAMS.length, 64)
  assert.equal(new Set(HEXAGRAMS.map((h) => h.lines.join(''))).size, 64)
  assert.equal(new Set(HEXAGRAMS.map((h) => `${h.upper}-${h.lower}`)).size, 64)
})

test('well-known hexagram structures', () => {
  assert.equal(hexagramOf(2, 3).name, '革')
  assert.equal(hexagramOf(2, 3).fullName, '泽火革')
  assert.equal(hexagramOf(4, 3).fullName, '雷火丰')
  assert.equal(hexagramOf(1, 1).fullName, '乾为天')
  assert.equal(hexagramOf(6, 3).fullName, '水火既济')
  assert.deepEqual(hexagramOf(6, 3).lines, [1, 0, 1, 0, 1, 0])
  assert.deepEqual(hexagramOf(8, 1).lines, [1, 1, 1, 0, 0, 0]) // 泰：地在上，天在下
})

test('shichen boundaries', () => {
  const at = (h, m = 0) => shichen(new Date(2026, 8, 28, h, m))
  assert.equal(at(23).label, '子时')
  assert.equal(at(0, 59).label, '子时')
  assert.equal(at(1).label, '丑时')
  assert.equal(at(15).label, '申时')
  assert.equal(at(15).num, 9)
  assert.equal(at(22, 59).label, '亥时')
  assert.equal(at(22, 59).num, 12)
})

test('物数占 (原文): two birds at 申时 → 兑上乾下 夬, fifth line moving, changes to 大壮', () => {
  const r = castByCount(2, new Date(2026, 8, 28, 15, 20))
  assert.equal(r.upper.name, '兑')
  assert.equal(r.lower.name, '乾') // 申时 9，除 8 余 1
  assert.equal(r.original.name, '夬')
  assert.equal(r.movingLine, 5) // (2+9) 除 6 余 5
  assert.equal(r.changed.name, '大壮')
  assert.equal(r.yong.name, '兑') // 动爻在上卦，上卦为用
  assert.equal(r.ti.name, '乾')
})

test('物数占 (流行类推 count+hour): two birds at 申时 → 革之丰', () => {
  const r = castByCount(2, new Date(2026, 8, 28, 15, 20), 'count+hour')
  assert.equal(r.original.name, '革')
  assert.equal(r.changed.name, '丰')
})

test('research check: 7 things at 午时 → 艮为山 (原文) or 山水蒙 (类推)', () => {
  const at = new Date(2026, 8, 28, 12, 0)
  assert.equal(castByCount(7, at).original.fullName, '艮为山')
  assert.equal(castByCount(7, at, 'count+hour').original.fullName, '山水蒙')
})

test('remainders of zero map to 坤 and the sixth line', () => {
  // 8 件物品、子时：8 除 8 余 0 → 坤；子时 1 → 乾；9 除 6 余 3
  const r = castByCount(8, new Date(2026, 8, 28, 23, 30))
  assert.equal(r.upper.name, '坤')
  assert.equal(r.lower.name, '乾')
  assert.equal(r.movingLine, 3)
  // 4 件物品、未时(8)：未时 8 除 8 余 0 → 坤；12 除 6 余 0 → 第六爻
  const s = castByCount(4, new Date(2026, 8, 28, 13, 0))
  assert.equal(s.lower.name, '坤')
  assert.equal(s.movingLine, 6)
})

test('牡丹占: 巳6+3+16=25 → 乾; +卯4=29 → 巽; 5th line → 姤之鼎', () => {
  const r = castByTime({ yearBranchNum: 6, month: 3, day: 16 }, new Date(2026, 8, 28, 5, 30))
  assert.equal(r.original.name, '姤')
  assert.equal(r.movingLine, 5)
  assert.equal(r.changed.name, '鼎')
  assert.equal(r.ti.name, '巽')
})

test('声音占 adds the hour for the lower trigram', () => {
  // 3 声、巳时(6)：上 离；下 9 → 乾；动爻 9 除 6 余 3
  const r = castBySound(3, new Date(2026, 8, 28, 9, 30))
  assert.equal(r.upper.name, '离')
  assert.equal(r.lower.name, '乾')
  assert.equal(r.movingLine, 3)
})

test('观梅占: 辰年(5)十二月十七日申时(9) gives 革 changing to 咸 at the first line', () => {
  const r = castByTime({ yearBranchNum: 5, month: 12, day: 17 }, new Date(2026, 8, 28, 15, 0))
  assert.equal(r.formula.upper.value, 34)
  assert.equal(r.original.name, '革')
  assert.equal(r.movingLine, 1)
  assert.equal(r.changed.name, '咸')
  assert.equal(r.mutual.name, '姤') // 互卦：乾上巽下
})

test('count must be positive', () => {
  assert.throws(() => castByCount(0, new Date()))
})

test('tiYong relations', () => {
  assert.equal(tiYongRelation(TRIGRAMS[3], TRIGRAMS[2]).key, 'ti-controls-yong') // 火克金
  assert.equal(tiYongRelation(TRIGRAMS[3], TRIGRAMS[4]).key, 'yong-generates-ti') // 木生火
  assert.equal(tiYongRelation(TRIGRAMS[1], TRIGRAMS[2]).key, 'same')
  assert.equal(arrange(2, 3, 5).original.name, '革')
})

test('timeline keeps running until its last event', async () => {
  const { Timeline } = await import('../src/stage/timeline.js')
  const tl = new Timeline()
  let fired = false
  tl.tween(0, 1, () => {})
  tl.call(3, () => (fired = true))
  tl.start()
  for (let i = 0; i < 200; i++) tl.update(1 / 60)
  assert.equal(fired, true)
  assert.ok(tl.time >= 3)
})
