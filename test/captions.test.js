import test from 'node:test'
import assert from 'node:assert/strict'
import { castByCount, castByTime } from '../src/core/meihua.js'
import { formulaCaptions } from '../src/captions.js'
import { labelOf, inscription } from '../src/core/labels.js'

test('inscriptions use classical short names', () => {
  assert.equal(inscription(labelOf('cup'), 3), '见杯三')
  assert.equal(inscription(labelOf('dog'), 2), '见犬二')
  assert.equal(inscription(labelOf('carrot'), 1), '见萝卜一')
  assert.equal(inscription(labelOf('person'), 12), '见人十二')
})

test('物数占 captions in the 观梅占 style', () => {
  const c = castByCount(2, new Date(2026, 8, 28, 15, 20))
  const t = formulaCaptions(c, '鸟')
  assert.equal(t.upper, '鸟二数，得兑为上卦')
  assert.equal(t.lower, '申时九数，除八余一，得乾为下卦')
  assert.equal(t.moving, '物时共十一数，除六余五，九五动')
})

test('counts above eight, and exact multiples', () => {
  const t = formulaCaptions(castByCount(11, new Date(2026, 8, 28, 9, 0)), '人')
  assert.equal(t.upper, '人十一数，除八余三，得离为上卦')
  assert.equal(t.lower, '巳时六数，得坎为下卦')
  assert.equal(t.moving, '物时共十七数，除六余五，六五动')
  const u = formulaCaptions(castByCount(16, new Date(2026, 8, 28, 13, 0)), '杯') // 未时 8
  assert.equal(u.upper, '杯十六数，除尽，得坤为上卦')
  assert.equal(u.moving, '物时共二十四数，除尽，上六动')
})

test('time casting captions', () => {
  const c = castByTime({ yearBranchNum: 5, month: 12, day: 17 }, new Date(2026, 8, 28, 15, 0))
  const t = formulaCaptions(c, '')
  assert.equal(t.upper, '年月日共三十四数，除八余二，得兑为上卦')
  assert.equal(t.lower, '加时共四十三数，除八余三，得离为下卦')
  assert.equal(t.moving, '总四十三数，除六余一，初九动')
})
