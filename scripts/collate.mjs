// 校勘：把 src/data/zhouyi.json 的卦辞、爻辞（含用九、用六）与维基文库《周易》六十四卦页逐段对照，
// 打印每一段不同之处，并按性质分级：
//   punct   只差标点
//   script  我们的文本里残留繁体字（按下面的字表转成简体后相同）
//   variant 只差已知异体/通假写法（无/無、于/於、凶/兇、群/羣、已/巳 等）
//   wording 真正的字句差异，需要逐条定夺（定夺记在 data/collation.json）
// 维基文库原文缓存在 data/sources/wikisource-cache.json，重跑不再联网。
//
// 用法：node scripts/collate.mjs            读缓存，缺页才联网
//       node scripts/collate.mjs --refresh  重新抓取全部 64 页
//       node scripts/collate.mjs --json     输出机器可读的逐段结果
//       node scripts/collate.mjs --check    有未定夺的字句差异时以退出码 1 结束
//
// 繁简转换只用下面这张显式小字表（只收这 64 页经文实际用到的字），不做通用转换：
// 咸不变鹹，斗不变鬥，干不变幹，乾（卦名、噬乾胏）不变干。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const CACHE = new URL('data/sources/wikisource-cache.json', root)
const DECISIONS = new URL('data/collation.json', root)
const API = 'https://zh.wikisource.org/w/api.php'
const UA = 'wanwu-qigua-collate/0.1 (open-source; contact via repo)'
const BATCH = 40

const args = new Set(process.argv.slice(2))
const REFRESH = args.has('--refresh')
const JSON_OUT = args.has('--json')
const CHECK = args.has('--check')
const log = JSON_OUT ? (...a) => console.error(...a) : (...a) => console.log(...a)

// 本书卦名（简体）→ 维基文库页名 "周易/<繁体卦名>"
const WS_TITLE = {
  乾: '乾', 坤: '坤', 屯: '屯', 蒙: '蒙', 需: '需', 讼: '訟', 师: '師', 比: '比',
  小畜: '小畜', 履: '履', 泰: '泰', 否: '否', 同人: '同人', 大有: '大有', 谦: '謙', 豫: '豫',
  随: '隨', 蛊: '蠱', 临: '臨', 观: '觀', 噬嗑: '噬嗑', 贲: '賁', 剥: '剝', 复: '復',
  无妄: '无妄', 大畜: '大畜', 颐: '頤', 大过: '大過', 坎: '坎', 离: '離', 咸: '咸', 恒: '恒',
  遁: '遯', 大壮: '大壯', 晋: '晉', 明夷: '明夷', 家人: '家人', 睽: '睽', 蹇: '蹇', 解: '解',
  损: '損', 益: '益', 夬: '夬', 姤: '姤', 萃: '萃', 升: '升', 困: '困', 井: '井',
  革: '革', 鼎: '鼎', 震: '震', 艮: '艮', 渐: '漸', 归妹: '歸妹', 丰: '豐', 旅: '旅',
  巽: '巽', 兑: '兌', 涣: '渙', 节: '節', 中孚: '中孚', 小过: '小過', 既济: '既濟', 未济: '未濟',
}

// 繁体→简体，逐字列出（每对"繁简"两字）。只收经文用到的字；乾、撝、繻、纆、藉、豶、餗等
// 本书保留原字形的字不收。
const T2S = new Map(
  `並并 亂乱 來来 係系 傾倾 僕仆 儀仪 億亿 兌兑 內内 則则 剝剥 動动 勝胜 勞劳 厲厉
   叢丛 問问 啞哑 喪丧 國国 園园 執执 堅坚 壯壮 婦妇 宮宫 實实 寧宁 寵宠 屨屦 帥帅
   師师 帶带 幹干 幾几 廟庙 廬庐 張张 彙汇 後后 從从 復复 恆恒 惡恶 惻恻 慍愠 慶庆
   憂忧 懷怀 戔戋 戰战 戶户 揚扬 損损 擊击 據据 攣挛 敗败 敵敌 時时 晉晋 晝昼 東东
   棄弃 棟栋 楊杨 橈桡 歲岁 歸归 殺杀 決决 淵渊 渙涣 滅灭 漣涟 漸渐 潛潜 濟济 瀆渎
   災灾 為为 爾尔 牽牵 獄狱 獨独 獲获 瑣琐 疇畴 發发 盤盘 眾众 碩硕 禦御 穫获 窺窥
   節节 約约 納纳 紛纷 紱绂 終终 經经 維维 繫系 罷罢 習习 聞闻 膚肤 臘腊 臨临 與与
   興兴 舊旧 艱艰 茲兹 莧苋 華华 薦荐 藥药 蘇苏 處处 虛虚 號号 虧亏 蠱蛊 衛卫 見见
   視视 覿觌 觀观 觸触 訟讼 詳详 誡诫 說说 謂谓 謙谦 譽誉 變变 豐丰 貝贝 貞贞 負负
   貫贯 貳贰 賁贲 資资 賓宾 賞赏 躋跻 躍跃 車车 載载 輔辅 輪轮 輻辐 輿舆 連连 進进
   過过 違违 遠远 遲迟 遷迁 遺遗 鄰邻 醜丑 鉉铉 錫锡 錯错 長长 門门 開开 閑闲 閽阍
   闃阒 陰阴 陸陆 階阶 隕陨 隨随 險险 雖虽 離离 雲云 靈灵 鞏巩 頂顶 須须 頤颐 頰颊
   頻频 顒颙 顛颠 顯显 飛飞 飲饮 饋馈 馬马 馮冯 驅驱 驚惊 魚鱼 鮒鲋 鳥鸟 鳴鸣 鴻鸿
   鶴鹤 黃黄 齎赍 龍龙 龜龟`
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => [...p]),
)

// 已知异体/通假写法：只用于比较，不改任何一方的文本。本书统一用右边的字。
// 巳/已：刻本"巳"多用作"已"（损初九、革卦辞与六二，本书已按王弼本作"已"）；
// 祇/祗：形近互讹（复初九"无祗悔"、坎九五"祗既平"，本书作"祗"）；闚/窥：异体。
const VARIANT = new Map(
  `無无 於于 兇凶 羣群 巳已 遯遁 牀床 轝舆 咷啕 寘置 敺驱 蔾藜 甕瓮 祇祗 闚窥`
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => [...p]),
)

const t2s = (s) => [...s].map((c) => T2S.get(c) ?? c).join('')
const vnorm = (c) => VARIANT.get(c) ?? c
const hanOnly = (s) => [...s].filter((c) => /\p{Script=Han}/u.test(c)).join('')
const LABEL_RE = /^(初[九六]|[九六][二三四五]|上[九六]|用[九六])[：:，,](.*)$/

// ---------- 抓取与缓存 ----------

function loadCache() {
  if (!existsSync(CACHE)) return { pages: {} }
  return JSON.parse(readFileSync(CACHE, 'utf8'))
}

async function fetchBatch(titles) {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content|ids|timestamp',
    rvslots: 'main',
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    titles: titles.join('|'),
  })
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } })
  if (!res.ok) throw new Error(`wikisource API: HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`wikisource API: ${data.error.code} ${data.error.info}`)
  return data.query.pages
}

async function ensurePages(names) {
  const cache = loadCache()
  const want = REFRESH ? names : names.filter((n) => !cache.pages?.[n])
  if (want.length) {
    log(`fetching ${want.length} page(s) from zh.wikisource …`)
    const pages = { ...(cache.pages || {}) }
    for (let i = 0; i < want.length; i += BATCH) {
      if (i) await new Promise((r) => setTimeout(r, 1000))
      const chunk = want.slice(i, i + BATCH)
      const got = await fetchBatch(chunk.map((n) => `周易/${WS_TITLE[n]}`))
      for (const p of got) {
        const name = chunk.find((n) => `周易/${WS_TITLE[n]}` === p.title)
        if (!name) throw new Error(`unexpected page ${p.title}`)
        if (p.missing || !p.revisions) throw new Error(`missing page ${p.title}`)
        const r = p.revisions[0]
        pages[name] = { title: p.title, revid: r.revid, timestamp: r.timestamp, wikitext: r.slots.main.content }
      }
    }
    const out = {
      source: 'https://zh.wikisource.org/wiki/周易',
      api: API,
      license: 'Wikitext from zh.wikisource.org (CC BY-SA 4.0); the classical text itself is in the public domain.',
      fetched: new Date().toISOString(),
      pages: Object.fromEntries(names.filter((n) => pages[n]).map((n) => [n, pages[n]])),
    }
    writeFileSync(CACHE, JSON.stringify(out, null, 1) + '\n')
    return out
  }
  return cache
}

// ---------- 解析维基文本 ----------

// 把一行维基文本拆成片段：普通字串，或 {a, b}（{{另|a|b}}：正文 a，一作 b）
function parseInline(s, notes) {
  s = s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/-\{T\|[^}]*\}-/g, '')
    .replace(/-\{([^{}]*)\}-/g, (_, x) => x.replace(/^[^|]*\|/, ''))
    .replace(/'{2,}/g, '')
  const parts = []
  let rest = s
  const re = /\{\{([^{}]*)\}\}/
  let m
  while ((m = rest.match(re))) {
    if (m.index) parts.push(rest.slice(0, m.index))
    const [name, ...params] = m[1].split('|')
    if (name.trim() === '另' && params.length >= 2) parts.push({ a: params[0], b: params.slice(1).join('|') })
    else notes.push(`template dropped: {{${m[1]}}}`)
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) parts.push(rest)
  return parts.map((p) => (typeof p === 'string' ? p.replace(/\s+/g, '') : { a: p.a.replace(/\s+/g, ''), b: p.b.replace(/\s+/g, '') }))
}

const render = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.a)).join('')
const variantsOf = (parts) => parts.filter((p) => typeof p !== 'string')

// 取"易經"一节：** 卦辞，*** 卦辞续行，*# 爻辞
function parseJing(name, wikitext) {
  const notes = []
  const lines = wikitext.split('\n')
  // 标题行形如 *<span …>'''易經：'''</span>，偶有 <span 标签跨行
  const start = lines.findIndex((l) => l.includes("'''易經"))
  if (start < 0) throw new Error(`${name}: no 易經 section`)
  let judgment = null
  const yao = []
  for (const raw of lines.slice(start + 1)) {
    const l = raw.trim()
    if (!l) {
      if (judgment || yao.length) break
      continue
    }
    if (l.startsWith('***')) {
      if (!judgment) throw new Error(`${name}: *** before **`)
      judgment.push(...parseInline(l.slice(3), notes))
    } else if (l.startsWith('**')) {
      if (judgment) throw new Error(`${name}: second ** line`)
      // '''卦名'''：卦辞 ——卦名后有冒号时去掉"卦名："；否则卦名本是卦辞的一部分（履虎尾、否之匪人、同人于野）
      const body = l.slice(2).replace(/<\/?[a-zA-Z][^>]*>/g, '')
      const m = body.match(/^'''(.*?)'''\s*([：:])?(.*)$/)
      if (!m) throw new Error(`${name}: cannot parse 卦辞 line: ${l}`)
      const head = render(parseInline(m[1], notes))
      const tail = parseInline(m[3], notes)
      if (m[2] && hanOnly([...t2s(head)].map(vnorm).join('')) === name) judgment = tail
      else judgment = [head + (m[2] ? '，' : ''), ...tail]
    } else if (l.startsWith('*#')) {
      const parts = parseInline(l.slice(2), notes)
      const first = parts[0]
      const lm = typeof first === 'string' && first.match(LABEL_RE)
      if (!lm) throw new Error(`${name}: cannot parse 爻辞 line: ${l}`)
      parts[0] = lm[2]
      yao.push({ label: t2s(lm[1]), parts })
    } else break
  }
  if (!judgment) throw new Error(`${name}: no 卦辞`)
  return { judgment, yao, notes }
}

// ---------- 比较 ----------

const RANK = { identical: 0, punct: 1, script: 2, variant: 3, wording: 4 }

// ours：我们的文本；ws：维基文库文本（已转简体）
function classify(ours, ws) {
  if (ours === ws) return { level: 'identical' }
  const A = hanOnly(ours)
  const B = hanOnly(ws)
  if (A === B) return { level: 'punct' }
  if (A.length !== B.length) return { level: 'wording' }
  let level = 'punct'
  const script = new Set()
  const pairs = new Set()
  for (let i = 0; i < A.length; i++) {
    const a = A[i]
    const b = B[i]
    if (a === b) continue
    if (t2s(a) === b) {
      script.add(a)
      if (RANK[level] < RANK.script) level = 'script'
    } else if (vnorm(t2s(a)) === vnorm(b)) {
      pairs.add(`${t2s(a)}/${b}`)
      level = 'variant'
    } else return { level: 'wording' }
  }
  return { level, script: [...script], pairs: [...pairs] }
}

// 逐字差异（最长公共子序列），〔-x〕只见于本书，〔+y〕只见于维基文库
function inlineDiff(a, b) {
  const A = [...a]
  const B = [...b]
  const n = A.length
  const m = B.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = vnorm(t2s(A[i])) === vnorm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0
  let j = 0
  let out = ''
  let del = ''
  let ins = ''
  const flush = () => {
    if (del) out += `〔-${del}〕`
    if (ins) out += `〔+${ins}〕`
    del = ins = ''
  }
  while (i < n || j < m) {
    if (i < n && j < m && vnorm(t2s(A[i])) === vnorm(B[j])) {
      flush()
      out += A[i]
      i++
      j++
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) del += A[i++]
    else ins += B[j++]
  }
  flush()
  return out
}

function segmentsOf(h) {
  const segs = [{ segment: '卦辞', text: h.judgment }]
  for (const l of h.lines) segs.push({ segment: l.label, text: l.text })
  if (h.extra) segs.push({ segment: h.extra.label, text: h.extra.text })
  return segs
}

// ---------- 主程序 ----------

const zhouyi = JSON.parse(readFileSync(new URL('src/data/zhouyi.json', root), 'utf8'))
const names = zhouyi.map((h) => h.name)
for (const n of names) if (!WS_TITLE[n]) throw new Error(`no wikisource title for ${n}`)
const cache = await ensurePages(names)
const decisions = existsSync(DECISIONS) ? JSON.parse(readFileSync(DECISIONS, 'utf8')) : []
const decisionFor = (hexagram, segment) => decisions.filter((d) => d.hexagram === hexagram && d.segment === segment)

const results = []
const notes = []
const unknownChars = new Map()
const oursChars = new Set(zhouyi.flatMap((h) => segmentsOf(h).flatMap((s) => [...s.text])))

for (const h of zhouyi) {
  const page = cache.pages[h.name]
  if (!page) throw new Error(`no cached page for ${h.name}`)
  const url = `https://zh.wikisource.org/wiki/${encodeURIComponent(page.title)}?oldid=${page.revid}`
  const jing = parseJing(h.name, page.wikitext)
  notes.push(...jing.notes.map((x) => `${h.name}: ${x}`))
  const wsSegs = [{ segment: '卦辞', parts: jing.judgment }, ...jing.yao.map((y) => ({ segment: y.label, parts: y.parts }))]
  const ours = segmentsOf(h)
  if (wsSegs.length !== ours.length || wsSegs.some((w, i) => w.segment !== ours[i].segment))
    notes.push(`${h.name}: segment labels differ — ours ${ours.map((s) => s.segment).join(' ')}; wikisource ${wsSegs.map((s) => s.segment).join(' ')}`)
  for (const o of ours) {
    const w = wsSegs.find((x) => x.segment === o.segment)
    if (!w) {
      results.push({ hexagram: h.name, segment: o.segment, level: 'wording', ours: o.text, wikisource: null, url, note: 'segment missing on wikisource' })
      continue
    }
    const wsRaw = render(w.parts)
    const wsText = t2s(wsRaw)
    for (const c of hanOnly(wsText)) if (!oursChars.has(c) && !oursChars.has(vnorm(c))) unknownChars.set(c, `${h.name}${o.segment}`)
    const vars = variantsOf(w.parts)
    const c = classify(o.text, wsText)
    const r = { hexagram: h.name, segment: o.segment, level: c.level, ours: o.text, wikisource: wsText, wikisourceRaw: wsRaw, url }
    if (c.script?.length) r.scriptChars = c.script
    if (c.pairs?.length) r.variantPairs = c.pairs
    if (vars.length) {
      r.alternatives = vars.map((v) => `${v.a}，一作${v.b}`)
      if (c.level === 'wording') {
        // 维基文库注明的"一作"读法与本书相同吗？（全换成一作，或只换其中一处；"几、幾"这种一作多选的逐个试）
        const withChoice = (choose) => {
          let idx = -1
          return t2s(w.parts.map((p) => (typeof p === 'string' ? p : choose(++idx, p))).join(''))
        }
        const altTexts = [withChoice((_, p) => p.b.split('、')[0])]
        vars.forEach((v, k) => {
          for (const opt of v.b.split('、')) altTexts.push(withChoice((i, p) => (i === k ? opt : p.a)))
        })
        const hit = altTexts.find((alt) => RANK[classify(o.text, alt).level] < RANK.wording)
        if (hit) r.oursMatchesAlternative = hit
      }
    }
    if (c.level === 'wording') r.diff = inlineDiff(hanOnly(o.text), hanOnly(wsText))
    const d = decisionFor(h.name, o.segment)
    if (d.length) r.decisions = d.map((x) => x.decision)
    results.push(r)
  }
}

const counts = Object.fromEntries(Object.keys(RANK).map((k) => [k, results.filter((r) => r.level === k).length]))
const undecided = results.filter((r) => r.level === 'wording' && !r.decisions)

if (JSON_OUT) {
  console.log(JSON.stringify({ counts, undecided: undecided.length, notes, unknownChars: Object.fromEntries(unknownChars), results }, null, 1))
} else {
  log(`compared ${results.length} segments (${zhouyi.length} hexagrams) against zh.wikisource 周易`)
  log(`  identical ${counts.identical}, punctuation only ${counts.punct}, traditional chars left in ours ${counts.script}, variant forms ${counts.variant}, wording ${counts.wording}`)
  const show = (lvl, title, fmt) => {
    const rs = results.filter((r) => r.level === lvl)
    if (!rs.length) return
    log(`\n== ${title} (${rs.length})`)
    for (const r of rs) log(fmt(r))
  }
  show('punct', 'punctuation only', (r) => `  ${r.hexagram} ${r.segment}: ${r.ours}  |  ${r.wikisource}`)
  show('script', 'traditional characters left in our text', (r) => `  ${r.hexagram} ${r.segment}: ${r.scriptChars.join('')}  —  ${r.ours}`)
  show('variant', 'variant forms (not a wording difference)', (r) => `  ${r.hexagram} ${r.segment}: ${r.variantPairs.join(' ')}${r.scriptChars ? `; traditional ${r.scriptChars.join('')}` : ''}  —  ${r.ours}`)
  show('wording', 'WORDING differences', (r) =>
    [
      `  ${r.hexagram} ${r.segment}`,
      `     ours:       ${r.ours}`,
      `     wikisource: ${r.wikisource}${r.alternatives ? `   [${r.alternatives.join('；')}]` : ''}`,
      `     diff:       ${r.diff}`,
      r.oursMatchesAlternative ? `     note:       ours matches wikisource's 一作 reading` : null,
      r.decisions ? `     decided:    ${r.decisions.join(' / ')}` : `     decided:    — (not yet in data/collation.json)`,
      `     ${r.url}`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
  if (unknownChars.size)
    log(`\n== characters on wikisource not found in our text (add to the T2S table if traditional): ${[...unknownChars].map(([c, w]) => `${c}(${w})`).join(' ')}`)
  if (notes.length) log(`\n== notes\n${notes.map((n) => `  ${n}`).join('\n')}`)
  log(`\nwording differences without a recorded decision: ${undecided.length}`)
}
if (CHECK && undecided.length) process.exit(1)
