// 由 data/sources 下的 freizl 周易数据（MIT）生成 src/data/zhouyi.json：
// 去掉"卦名："/"初九："前缀，按 data/patches.json 校勘修正（每条修正都要求原文先对得上），
// 并核对爻题（九/六）与卦画是否一致。用法：node scripts/build-zhouyi.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { hexagramFromLines, HEXAGRAMS } from '../src/core/hexagrams.js'
import { lineName } from '../src/core/numerals.js'

const root = new URL('..', import.meta.url)
const src = JSON.parse(readFileSync(new URL('data/sources/freizl-yijing-2.1.0-64gua.json', root), 'utf8'))
const patches = JSON.parse(readFileSync(new URL('data/patches.json', root), 'utf8'))

// 遯为遁的异体字，简体通行本作"遁"，统一用"遁"（只此一处替换，不做自动繁简转换）
const clean = (s) => String(s || '').replace(/\s+/g, '').replace(/遯/g, '遁').trim()

function splitLabel(s) {
  const m = clean(s).match(/^(初[九六]|[九六][二三四五]|上[九六]|用[九六])[：:，,](.*)$/)
  if (!m) throw new Error(`cannot parse line: ${s}`)
  return { label: m[1], text: m[2] }
}

const out = []
for (const g of src) {
  const bits = g.id.split('').map(Number)
  const hex = hexagramFromLines(bits)
  if (!hex) throw new Error(`unknown bits ${g.id}`)
  if (hex.name !== clean(g.name)) throw new Error(`name mismatch ${g.id}: ${hex.name} vs ${g.name}`)
  const judgment = clean(g.gua_ci).replace(new RegExp(`^${clean(g.name)}[：:，,]`), '')
  const parsed = g.yao_ci.map(splitLabel)
  const lines = parsed.filter((p) => !p.label.startsWith('用'))
  const extra = parsed.find((p) => p.label.startsWith('用')) || null
  if (lines.length !== 6) throw new Error(`${g.name}: expected 6 lines, got ${lines.length}`)
  out.push({
    num: hex.num,
    name: hex.name,
    fullName: hex.fullName,
    judgment,
    lines,
    extra,
    daxiang: clean(g.da_xiang),
    tuan: clean(g.tuan_ci),
    xiaoxiang: (g.xiao_xiang || []).map(clean),
  })
}
out.sort((a, b) => a.num - b.num)

// 校勘修正
const applied = []
for (const p of patches) {
  const h = out.find((x) => x.name === p.hexagram)
  if (!h) throw new Error(`patch: no hexagram ${p.hexagram}`)
  let target
  if (p.field === 'judgment') target = { get: () => h.judgment, set: (v) => (h.judgment = v) }
  else if (p.field === 'line') {
    const i = p.line - 1
    target = {
      get: () => `${h.lines[i].label}：${h.lines[i].text}`,
      set: (v) => (h.lines[i] = splitLabel(v)),
    }
  } else if (p.field === 'extra') target = { get: () => `${h.extra.label}：${h.extra.text}`, set: (v) => (h.extra = splitLabel(v)) }
  else if (p.field === 'daxiang') target = { get: () => h.daxiang, set: (v) => (h.daxiang = v) }
  else throw new Error(`patch: bad field ${p.field}`)
  const cur = target.get()
  if (cur === p.to) continue
  if (cur !== p.from) throw new Error(`patch ${p.hexagram} ${p.field}${p.line || ''}: expected "${p.from}", found "${cur}"`)
  target.set(p.to)
  applied.push(`${p.hexagram} ${p.field}${p.line || ''}`)
}

// 爻题必须与卦画一致：阳爻称九，阴爻称六
for (const h of out) {
  const bits = HEXAGRAMS.find((x) => x.num === h.num).lines
  h.lines.forEach((l, i) => {
    const want = lineName(i + 1, bits[i] === 1)
    if (l.label !== want) throw new Error(`${h.name} line ${i + 1}: label ${l.label}, expected ${want}`)
  })
  if (h.extra && !['乾', '坤'].includes(h.name)) throw new Error(`${h.name}: unexpected ${h.extra.label}`)
}

writeFileSync(new URL('src/data/zhouyi.json', root), JSON.stringify(out, null, 1) + '\n')
console.log(`wrote ${out.length} hexagrams; patches applied: ${applied.length}`)
applied.forEach((a) => console.log('  ', a))
