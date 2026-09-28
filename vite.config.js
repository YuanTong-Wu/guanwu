import { defineConfig } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'

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

export default defineConfig({
  base: './',
  server: { host: true },
  plugins: [snapshots()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
})
