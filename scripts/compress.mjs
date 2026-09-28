// 给 dist/ 里的文本、wasm、模型预先压好 .br 和 .gz，服务器（Caddy 的 precompressed）直接发压缩版。
// 首次打开从约 18 MB 降到约 6 MB。压缩后省不到 5% 的文件（字体、图片）不留压缩版。
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const dist = new URL('../dist', import.meta.url).pathname
const EXT = /\.(html|js|mjs|css|json|svg|wasm|tflite|txt|xml)$/
const files = []
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))))
walk(dist)

let raw = 0
let br = 0
for (const f of files.filter((f) => EXT.test(f))) {
  const buf = readFileSync(f)
  const b = brotliCompressSync(buf, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      [constants.BROTLI_PARAM_MODE]: /\.(wasm|tflite)$/.test(f) ? constants.BROTLI_MODE_GENERIC : constants.BROTLI_MODE_TEXT,
    },
  })
  const g = gzipSync(buf, { level: 9 })
  for (const [ext, out] of [['br', b], ['gz', g]]) {
    const target = `${f}.${ext}`
    if (out.length < buf.length * 0.95) writeFileSync(target, out)
    else {
      try {
        unlinkSync(target)
      } catch {}
    }
  }
  raw += buf.length
  br += Math.min(b.length, buf.length)
}
const mb = (n) => (n / 1048576).toFixed(1)
console.log(`compressed: ${mb(raw)} MB -> ${mb(br)} MB (brotli)`)
