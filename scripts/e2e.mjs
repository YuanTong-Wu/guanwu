// 端到端检查：用本机 Chrome（无头）+ 假摄像头（一段视频文件）走一遍完整流程，
// 截下首页、取景、仪式结束、卦辞页，并报告页面错误。
// 用法：先 npm run dev，再 node scripts/e2e.mjs [假摄像头.y4m] [输出目录]
// 假摄像头可以用 ffmpeg 从任意照片生成：
//   ffmpeg -loop 1 -i photo.jpg -t 25 -r 15 -vf scale=640:-2 -pix_fmt yuv420p .fake/cam.y4m
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL = process.env.URL || 'http://localhost:5178/'
const fake = resolve(process.argv[2] || '.fake/cups.y4m')
const out = resolve(process.argv[3] || '.snaps/e2e')
mkdirSync(out, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${fake}`,
    '--autoplay-policy=no-user-gesture-required',
    '--use-angle=metal',
  ],
})
const errors = []
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/XNNPACK|TensorFlow Lite/.test(m.text()) && errors.push(`console: ${m.text()}`))
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`))
  page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url()}`))
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 1200))
  await page.screenshot({ path: `${out}/1-home.png` })

  await page.click('#start')
  await page.waitForSelector('#scan.active', { timeout: 30000 })
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: `${out}/2-scan.png` })
  const count = await page.$eval('#scan-count', (e) => e.textContent)

  await page.waitForSelector('#ended.active', { timeout: 60000 })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: `${out}/3-ended.png` })
  const saveVisible = await page.$eval('#save-video', (e) => !e.hidden)

  await page.click('#show-reading')
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: `${out}/4-reading.png` })
  const title = await page.$eval('#reading-title', (e) => e.textContent)
  await page.evaluate(() => document.querySelector('.panel-inner').scrollTo(0, 99999))
  await new Promise((r) => setTimeout(r, 300))
  await page.screenshot({ path: `${out}/5-reading-end.png` })

  // 第二条路：首页"以照片起卦"，选一张横拍的照片
  let photoTitle = null
  const photoFile = resolve(process.env.PHOTO || '.test-assets/tassen.jpg')
  const page2 = await browser.newPage()
  await page2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  page2.on('pageerror', (e) => errors.push(`photo pageerror: ${e.message}`))
  await page2.goto(URL, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 800))
  const [chooser] = await Promise.all([page2.waitForFileChooser({ timeout: 10000 }), page2.click('#home-photo')])
  await chooser.accept([photoFile])
  await page2.waitForSelector('#ended.active', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1500))
  await page2.screenshot({ path: `${out}/6-photo-ended.png` })
  await page2.click('#show-reading')
  await new Promise((r) => setTimeout(r, 500))
  photoTitle = await page2.$eval('#reading-title', (e) => e.textContent)
  const photoSubject = await page2.$eval('.reading .full-name', (e) => e.textContent)

  console.log(JSON.stringify({ count, title, saveVisible, photoTitle, photoSubject, errors }, null, 1))
} finally {
  await browser.close()
}
if (errors.length) process.exitCode = 1
