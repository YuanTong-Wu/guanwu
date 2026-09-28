import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'

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

export default defineConfig({
  base: './',
  server: { host: true },
  // 手机上试玩：WQ_HTTPS=1 时用自签名证书开 HTTPS（手机浏览器只在 HTTPS 下给相机）
  plugins: [snapshots(), testAssets(), ...(process.env.WQ_HTTPS ? [basicSsl()] : [])],
  preview: { host: true },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
})
