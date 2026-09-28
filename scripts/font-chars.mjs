// 收集两套字体各自要用到的字，写到 fonts-src/brush-chars.txt 和 fonts-src/serif-chars.txt。
// 书法字体（马善政）：卦名、八卦、物体名与量词、数字、仪式里的大字；正文字体（霞鹜文楷）：典籍原文、白话、界面文字。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { HEXAGRAMS, TRIGRAMS } from '../src/core/hexagrams.js'
import { BRANCHES } from '../src/core/meihua.js'

const root = new URL('..', import.meta.url).pathname
const CJK = /[　-〿㐀-䶿一-鿿＀-￯—…·“”‘’]/gu
const chars = (s) => new Set(String(s).match(CJK) || [])
const union = (...sets) => new Set(sets.flatMap((s) => [...s]))

function walk(dir, exts, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

const labelsSrc = readFileSync(join(root, 'src/core/labels.js'), 'utf8')
const brush = union(
  chars(HEXAGRAMS.map((h) => h.name + h.fullName).join('')),
  chars(Object.values(TRIGRAMS).map((t) => t.name + t.image).join('')),
  chars(labelsSrc),
  chars(BRANCHES.join('') + '时'),
  chars('零一二三四五六七八九十百千'),
  chars('万物起卦之就这些此刻'),
)

const sources = [
  ...walk(join(root, 'src'), ['.js', '.css', '.json']),
  join(root, 'index.html'),
  ...(existsSync(join(root, 'data/plain')) ? walk(join(root, 'data/plain'), ['.json']) : []),
]
// 彖传、小象暂不显示，不进字库
const zhouyi = JSON.parse(readFileSync(join(root, 'src/data/zhouyi.json'), 'utf8'))
const shown = zhouyi.map((h) => [h.name, h.fullName, h.judgment, ...h.lines.map((l) => l.label + l.text), h.extra ? h.extra.label + h.extra.text : '', h.daxiang].join('')).join('')
let serif = chars(shown)
for (const f of sources) {
  if (f.endsWith('zhouyi.json')) continue
  serif = union(serif, chars(readFileSync(f, 'utf8')))
}
serif = union(serif, brush, chars('，。：；、？！“”‘’（）《》〈〉·—…「」『』'))

writeFileSync(join(root, 'fonts-src/brush-chars.txt'), [...brush].sort().join(''))
writeFileSync(join(root, 'fonts-src/serif-chars.txt'), [...serif].sort().join(''))
console.log(`brush: ${brush.size} chars, serif: ${serif.size} chars`)
