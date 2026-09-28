// 开发用：把演示模式记下的声音时刻表（.snaps/<tag>-cues.json）在一个干净页面里离线合成为 WAV。
// 用法：先 npm run dev，再 node scripts/render-audio.mjs [tag]
import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync } from 'node:fs'

const tag = process.argv[2] || 'v'
const URL = process.env.URL || 'http://localhost:5178/'
const { duration, cues } = JSON.parse(readFileSync(`.snaps/${tag}-cues.json`, 'utf8'))
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' })
try {
  const page = await browser.newPage()
  await page.goto(URL)
  const url = await page.evaluate(
    async (cues, seconds) => {
      const { renderCues } = await import('/src/audio.js')
      const { wavDataUrl } = await import('/src/dev/wav.js')
      return wavDataUrl(await renderCues(cues, seconds))
    },
    cues,
    duration + 4,
  )
  writeFileSync(`.snaps/${tag}-audio.wav`, Buffer.from(url.replace(/^data:[^;]+;base64,/, ''), 'base64'))
  console.log(`wrote .snaps/${tag}-audio.wav (${cues.length} sounds, ${duration.toFixed(1)} s)`)
} finally {
  await browser.close()
}
