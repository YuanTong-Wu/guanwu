// 解读页：原文在前，白话在后；只讲卦意，不下吉凶断语。
import ZHOUYI from './data/zhouyi.json'
import PLAIN from './data/plain.json'
import { formulaCaptions } from './captions.js'
import { tiYongRelation } from './core/meihua.js'

const byNum = (list) => new Map(list.map((x) => [x.num, x]))
const TEXT = byNum(ZHOUYI)
const PLAIN_BY = byNum(PLAIN)

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

function section(title, classic, plain) {
  const s = el('section')
  s.append(el('h3', null, title))
  if (classic) s.append(el('p', 'classic', classic))
  if (plain) s.append(el('p', 'plain', plain))
  return s
}

export function renderReading(cast, subject, label) {
  const o = TEXT.get(cast.original.num)
  const c = TEXT.get(cast.changed.num)
  const po = PLAIN_BY.get(cast.original.num)
  const pc = PLAIN_BY.get(cast.changed.num)
  const mi = cast.movingLine - 1
  const line = o.lines[mi]

  const root = el('article', 'reading')
  const h = el('h2', null, `${o.name}之${c.name}`)
  h.id = 'reading-title'
  root.append(h)
  root.append(el('p', 'full-name', `${o.fullName} → ${c.fullName}　·　${subject}　·　${cast.hour.label}`))

  root.append(section(`本卦　${o.name}${po ? `　${po.keyword}` : ''}`, `${o.name}：${o.judgment}`, po?.summary))
  if (o.daxiang) root.append(section('象', `象曰：${o.daxiang}`, po?.image))
  root.append(section(`动爻　${line.label}`, `${line.label}：${line.text}`, po?.lines?.[mi]))
  root.append(section(`变卦　${c.name}${pc ? `　${pc.keyword}` : ''}`, `${c.name}：${c.judgment}`, pc?.summary))

  const how = el('div', 'how')
  const caps = formulaCaptions(cast, label)
  const rel = tiYongRelation(cast.ti, cast.yong)
  const ruleNote =
    cast.method === 'count' && cast.rule !== 'count+hour'
      ? '下卦依《梅花易数·物数占》原文"以时数配作下卦"。'
      : cast.method === 'time'
        ? '眼前没数到东西时，改用《梅花易数》年月日时起卦。'
        : ''
  how.append(el('p', null, `起卦之法：${caps.upper}；${caps.lower}；${caps.moving}。`))
  how.append(
    el(
      'p',
      null,
      `互卦${cast.mutual.name}；体卦${cast.ti.name}（${cast.ti.element}），用卦${cast.yong.name}（${cast.yong.element}），${rel.text}。${ruleNote}时辰按手机本地时间。`,
    ),
  )
  root.append(how)
  root.append(
    el(
      'p',
      'note',
      '原文据通行王弼本校订；白话为本项目自撰（CC BY 4.0），只作理解古文之用。起卦是传统文化体验，重在自省，不作任何决定的依据。',
    ),
  )
  return root
}
