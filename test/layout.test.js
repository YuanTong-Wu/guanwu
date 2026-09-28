import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutFor } from '../src/layout.js'

test('the hexagram name stays above the end buttons and note', () => {
  for (const [W, H, bottom] of [
    [393, 660, 90],
    [360, 600, 110],
    [390, 844, 90],
    [375, 667, 144],
    [844, 390, 90],
  ]) {
    const L = layoutFor(W, H, bottom)
    assert.ok(L.namesY + L.nameH * 0.6 <= H - bottom + 0.5, `${W}x${H}: names bottom ${L.namesY + L.nameH * 0.6} > ${H - bottom}`)
    assert.ok(L.hexY - L.gap * 2.5 > L.leaf.y + (L.landscape ? 0 : L.leaf.h), `${W}x${H}: lines overlap the leaf`)
  }
})

test('tall screens keep the natural layout', () => {
  assert.deepEqual(layoutFor(390, 844, 90), layoutFor(390, 844, 0))
})
