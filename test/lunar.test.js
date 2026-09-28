import test from 'node:test'
import assert from 'node:assert/strict'
import { lunarNow, parseLunarMonth } from '../src/core/lunar.js'

test('lunar month names', () => {
  assert.equal(parseLunarMonth('正月'), 1)
  assert.equal(parseLunarMonth('八月'), 8)
  assert.equal(parseLunarMonth('冬月'), 11)
  assert.equal(parseLunarMonth('腊月'), 12)
  assert.equal(parseLunarMonth('闰六月'), 6)
  assert.equal(parseLunarMonth('10'), 10)
})

test('2026-09-28 15:00 is 丙午年八月十八', async () => {
  const r = await lunarNow(new Date(2026, 8, 28, 15, 0))
  assert.deepEqual([r.yearBranch, r.yearBranchNum, r.month, r.day], ['午', 7, 8, 18])
})

test('子时 after 23:00 counts as the next day', async () => {
  const r = await lunarNow(new Date(2026, 8, 28, 23, 30))
  assert.equal(r.day, 19)
})

test('leap month keeps its base number', async () => {
  const r = await lunarNow(new Date(2025, 7, 1, 12, 0))
  assert.equal(r.month, 6)
  assert.equal(r.leap, true)
})
