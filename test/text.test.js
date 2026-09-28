import test from 'node:test'
import assert from 'node:assert/strict'
import { toChinese, lineName } from '../src/core/numerals.js'
import { labelOf, pickCountable } from '../src/core/labels.js'

test('Chinese numerals', () => {
  const cases = { 1: '一', 2: '二', 10: '十', 11: '十一', 20: '二十', 25: '二十五', 100: '一百', 101: '一百零一', 110: '一百一十', 1001: '一千零一' }
  for (const [n, s] of Object.entries(cases)) assert.equal(toChinese(Number(n)), s)
})

test('line names', () => {
  assert.equal(lineName(1, true), '初九')
  assert.equal(lineName(5, true), '九五')
  assert.equal(lineName(2, false), '六二')
  assert.equal(lineName(6, false), '上六')
})

test('labels and aliases', () => {
  assert.deepEqual(labelOf('bird'), { name: '鸟', measure: '只' })
  assert.deepEqual(labelOf('sofa'), { name: '沙发', measure: '张' })
  assert.deepEqual(labelOf('unknown-thing'), { name: '物', measure: '件' })
})

test('pickCountable takes the most numerous category, ties broken by area', () => {
  const box = (w, h) => ({ width: w, height: h })
  const r = pickCountable([
    { category: 'cup', box: box(10, 10) },
    { category: 'bird', box: box(5, 5) },
    { category: 'bird', box: box(5, 5) },
    { category: 'book', box: box(50, 50) },
  ])
  assert.equal(r.category, 'bird')
  assert.equal(r.count, 2)
  assert.equal(r.others.length, 2)
  const t = pickCountable([{ category: 'cup', box: box(10, 10) }, { category: 'book', box: box(50, 50) }])
  assert.equal(t.category, 'book')
  assert.equal(pickCountable([]), null)
})
