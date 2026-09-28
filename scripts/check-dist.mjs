// 构建产物自检：不能引用国内不稳定的第三方域名；字体、模型、wasm 都要在产物里。
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist', import.meta.url))
const BLOCKED = /(googleapis\.com|gstatic\.com|jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh)/
const files = []
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))))
walk(dist)
let bad = 0
for (const f of files.filter((f) => /\.(js|html|css)$/.test(f))) {
  const m = readFileSync(f, 'utf8').match(BLOCKED)
  if (m) {
    // MediaPipe 运行时里有写死的默认地址，但我们总是传入本地路径，不会被用到；只报告
    console.log(`note: ${f.replace(dist, 'dist')} mentions ${m[0]}`)
    if (!/vision_bundle/.test(f)) bad++
  }
}
if (existsSync(join(dist, '_test'))) {
  console.log('dist/_test must not ship (test photos)')
  bad++
}
for (const need of ['fonts/brush.woff2', 'fonts/serif.woff2', 'models/efficientdet_lite0.tflite', 'mediapipe/vision_wasm_internal.wasm']) {
  if (!existsSync(join(dist, need))) {
    console.log(`missing: dist/${need}`)
    bad++
  }
}
const total = files.reduce((s, f) => s + statSync(f).size, 0)
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB`)
if (bad) process.exit(1)
