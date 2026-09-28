import { toChinese } from './numerals.js'

// COCO 80 类物体：[白话名, 量词, 题款用的简称]。题款写"见杯三"，取古文句式。
const LABELS = {
  person: ['人', '个', '人'],
  bicycle: ['自行车', '辆', '单车'],
  car: ['车', '辆', '车'],
  motorcycle: ['摩托车', '辆', '摩托'],
  airplane: ['飞机', '架', '飞机'],
  bus: ['公交车', '辆', '车'],
  train: ['火车', '列', '车'],
  truck: ['卡车', '辆', '车'],
  boat: ['船', '艘', '舟'],
  'traffic light': ['红绿灯', '盏', '灯'],
  'fire hydrant': ['消防栓', '个', '消防栓'],
  'stop sign': ['路牌', '块', '牌'],
  'parking meter': ['停车咪表', '个', '表'],
  bench: ['长椅', '张', '凳'],
  bird: ['鸟', '只', '鸟'],
  cat: ['猫', '只', '猫'],
  dog: ['狗', '只', '犬'],
  horse: ['马', '匹', '马'],
  sheep: ['羊', '只', '羊'],
  cow: ['牛', '头', '牛'],
  elephant: ['象', '头', '象'],
  bear: ['熊', '头', '熊'],
  zebra: ['斑马', '匹', '斑马'],
  giraffe: ['长颈鹿', '只', '长颈鹿'],
  backpack: ['背包', '个', '囊'],
  umbrella: ['伞', '把', '伞'],
  handbag: ['手袋', '个', '包'],
  tie: ['领带', '条', '领带'],
  suitcase: ['行李箱', '个', '箱'],
  frisbee: ['飞盘', '个', '飞盘'],
  skis: ['滑雪板', '副', '雪板'],
  snowboard: ['雪板', '块', '雪板'],
  'sports ball': ['球', '个', '球'],
  kite: ['风筝', '只', '鸢'],
  'baseball bat': ['球棒', '根', '棒'],
  'baseball glove': ['棒球手套', '只', '手套'],
  skateboard: ['滑板', '块', '滑板'],
  surfboard: ['冲浪板', '块', '冲浪板'],
  'tennis racket': ['球拍', '把', '拍'],
  bottle: ['瓶子', '个', '瓶'],
  'wine glass': ['酒杯', '只', '杯'],
  cup: ['杯子', '个', '杯'],
  fork: ['叉子', '把', '叉'],
  knife: ['刀', '把', '刀'],
  spoon: ['勺子', '把', '匙'],
  bowl: ['碗', '只', '碗'],
  banana: ['香蕉', '根', '蕉'],
  apple: ['苹果', '个', '苹果'],
  sandwich: ['三明治', '个', '三明治'],
  orange: ['橙子', '个', '橘'],
  broccoli: ['西兰花', '颗', '菜'],
  carrot: ['胡萝卜', '根', '萝卜'],
  'hot dog': ['热狗', '个', '热狗'],
  pizza: ['披萨', '块', '饼'],
  donut: ['甜甜圈', '个', '饼'],
  cake: ['蛋糕', '块', '糕'],
  chair: ['椅子', '把', '椅'],
  couch: ['沙发', '张', '榻'],
  'potted plant': ['盆栽', '盆', '盆栽'],
  bed: ['床', '张', '床'],
  'dining table': ['桌子', '张', '案'],
  toilet: ['马桶', '个', '马桶'],
  tv: ['电视', '台', '电视'],
  laptop: ['电脑', '台', '电脑'],
  mouse: ['鼠标', '个', '鼠标'],
  remote: ['遥控器', '个', '遥控'],
  keyboard: ['键盘', '个', '键盘'],
  'cell phone': ['手机', '部', '手机'],
  microwave: ['微波炉', '台', '微波炉'],
  oven: ['烤箱', '台', '烤箱'],
  toaster: ['烤面包机', '台', '烤面包机'],
  sink: ['水槽', '个', '水槽'],
  refrigerator: ['冰箱', '台', '冰箱'],
  book: ['书', '本', '书'],
  clock: ['钟', '座', '钟'],
  vase: ['花瓶', '只', '瓶'],
  scissors: ['剪刀', '把', '剪'],
  'teddy bear': ['玩偶', '只', '玩偶'],
  'hair drier': ['吹风机', '个', '吹风机'],
  toothbrush: ['牙刷', '支', '牙刷'],
}

// 不同模型对同一类的拼写不同
const ALIASES = {
  motorbike: 'motorcycle',
  aeroplane: 'airplane',
  sofa: 'couch',
  tvmonitor: 'tv',
  diningtable: 'dining table',
  pottedplant: 'potted plant',
  'hair dryer': 'hair drier',
  cellphone: 'cell phone',
  'mobile phone': 'cell phone',
}

export function labelOf(category) {
  const key = String(category || '').trim().toLowerCase()
  const hit = LABELS[ALIASES[key] || key]
  return hit ? { name: hit[0], measure: hit[1], short: hit[2] } : { name: '物', measure: '件', short: '物' }
}

// 把检测结果按类别归组，取数量最多的一类来数（同数时取总面积大的一类）。
export function pickCountable(detections) {
  const groups = new Map()
  for (const d of detections) {
    const key = String(d.category).toLowerCase()
    const g = groups.get(key) || { category: key, items: [], area: 0 }
    g.items.push(d)
    g.area += (d.box?.width || 0) * (d.box?.height || 0)
    groups.set(key, g)
  }
  const ranked = [...groups.values()].sort((a, b) => b.items.length - a.items.length || b.area - a.area)
  if (!ranked.length) return null
  const top = ranked[0]
  return { ...top, count: top.items.length, label: labelOf(top.category), others: ranked.slice(1) }
}

// 题款："见杯三"、"见萝卜一"
export function inscription(label, count) {
  return `见${label.short}${toChinese(count)}`
}
