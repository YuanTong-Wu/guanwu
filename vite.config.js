import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

// 仅开发时用：演示模式 ?snaps=1.2,3.4 会把这些时刻的画面 POST 到 /__snap，存进 .snaps/，方便逐帧检查
function snapshots() {
  return {
    name: 'wq-snapshots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snap', (req, res) => {
        const q = new URL(req.url, 'http://x').searchParams
        const name = q.get('name') || 'frame'
        const ext = q.get('ext') || 'jpg'
        const chunks = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString()
          const b64 = body.replace(/^data:[^;]+;base64,/, '')
          mkdirSync('.snaps', { recursive: true })
          writeFileSync(`.snaps/${name.replace(/[^\w.-]/g, '_')}.${ext.replace(/\W/g, '')}`, Buffer.from(b64, 'base64'))
          res.end('ok')
        })
      })
    },
  }
}

// 仅开发时用：/_test/* 取自 .test-assets/（测试照片，不进仓库、不进构建产物）
function testAssets() {
  return {
    name: 'wq-test-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/_test', (req, res, next) => {
        const file = `.test-assets${decodeURIComponent(new URL(req.url, 'http://x').pathname)}`
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'image/jpeg')
        res.end(readFileSync(file))
      })
    },
  }
}

// 大文件的原始字节数和 SHA-256。服务器发 br/gzip 压缩版时 Content-Length 是压缩后的大小，下载进度要按原始大小算；
// wasm 从国内 npm 镜像下载时，要和自己站点上的这份逐字节核对
const file = (p) => readFileSync(new URL(`./public/${p}`, import.meta.url))
const BIG = ['models/efficientdet_lite0.tflite', 'mediapipe/vision_wasm_internal.wasm', 'mediapipe/vision_wasm_nosimd_internal.wasm']
const RAW_SIZES = Object.fromEntries(BIG.map((p) => [p.split('/').pop(), file(p).length]))
const SHA256 = Object.fromEntries(BIG.filter((p) => p.endsWith('.wasm')).map((p) => [p.split('/').pop(), createHash('sha256').update(file(p)).digest('hex')]))

// 模型再备一份 gzip：有的托管（比如 Vercel）不压缩 .tflite，浏览器自己解压（DecompressionStream）
const MODEL_GZ = gzipSync(file('models/efficientdet_lite0.tflite'), { level: 9 })
RAW_SIZES['efficientdet_lite0.tflite.gz'] = MODEL_GZ.length
function modelGzip() {
  return {
    name: 'wq-model-gzip',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'models/efficientdet_lite0.tflite.gz', source: MODEL_GZ })
    },
  }
}

export default defineConfig({
  base: './',
  define: { __WQ_RAW_SIZES__: JSON.stringify(RAW_SIZES), __WQ_SHA256__: JSON.stringify(SHA256) },
  server: { host: true },
  // 手机上试玩：WQ_HTTPS=1 时用自签名证书开 HTTPS（手机浏览器只在 HTTPS 下给相机）
  plugins: [snapshots(), testAssets(), modelGzip(), ...(process.env.WQ_HTTPS ? [basicSsl()] : [])],
  preview: { host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
})
