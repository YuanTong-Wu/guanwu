import test from 'node:test'
import assert from 'node:assert/strict'
import { castByCount, castByTime } from '../src/core/meihua.js'

// ritual.js 引用了 three 和浏览器模块，这里只测纯文字函数，所以动态导入并跳过浏览器依赖
const { formulaCaptions } = await import('../src/captions.js')

test('物数占 captions follow the original rule', () => {
  const c = castByCount(2, new Date(2026, 8, 28, 15, 20))
  const t = formulaCaptions(c, '二只鸟')
  assert.equal(t.upper, '见二只鸟 → 上卦兑（泽）')
  assert.equal(t.lower, '申时数九，除八余一 → 下卦乾（天）')
  assert.equal(t.moving, '二加九得十一，除六余五 → 九五动')
})

test('counts above eight show the remainder', () => {
  const c = castByCount(11, new Date(2026, 8, 28, 9, 0)) // 巳时 6
  const t = formulaCaptions(c, '十一个人')
  assert.equal(t.upper, '见十一个人，除八余三 → 上卦离（火）')
  assert.equal(t.lower, '巳时数六 → 下卦坎（水）')
  assert.equal(t.moving, '十一加六得十七，除六余五 → 六五动')
})

test('time casting captions', () => {
  const c = castByTime({ yearBranchNum: 5, month: 12, day: 17 }, new Date(2026, 8, 28, 15, 0))
  const t = formulaCaptions(c, '此刻')
  assert.equal(t.upper, '年月日共三十四，除八余二 → 上卦兑（泽）')
  assert.equal(t.lower, '年月日时共四十三，除八余三 → 下卦离（火）')
  assert.equal(t.moving, '四十三，除六余一 → 初九动')
})
