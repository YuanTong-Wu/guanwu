// COCO 80 类物体的中文名与量词，用来说"数到 2 只鸟"。
const LABELS = {
  person: ['人', '个'],
  bicycle: ['自行车', '辆'],
  car: ['车', '辆'],
  motorcycle: ['摩托车', '辆'],
  airplane: ['飞机', '架'],
  bus: ['公交车', '辆'],
  train: ['火车', '列'],
  truck: ['卡车', '辆'],
  boat: ['船', '艘'],
  'traffic light': ['红绿灯', '盏'],
  'fire hydrant': ['消防栓', '个'],
  'stop sign': ['路牌', '块'],
  'parking meter': ['停车咪表', '个'],
  bench: ['长椅', '张'],
  bird: ['鸟', '只'],
  cat: ['猫', '只'],
  dog: ['狗', '只'],
  horse: ['马', '匹'],
  sheep: ['羊', '只'],
  cow: ['牛', '头'],
  elephant: ['象', '头'],
  bear: ['熊', '头'],
  zebra: ['斑马', '匹'],
  giraffe: ['长颈鹿', '只'],
  backpack: ['背包', '个'],
  umbrella: ['伞', '把'],
  handbag: ['手袋', '个'],
  tie: ['领带', '条'],
  suitcase: ['行李箱', '个'],
  frisbee: ['飞盘', '个'],
  skis: ['滑雪板', '副'],
  snowboard: ['雪板', '块'],
  'sports ball': ['球', '个'],
  kite: ['风筝', '只'],
  'baseball bat': ['球棒', '根'],
  'baseball glove': ['棒球手套', '只'],
  skateboard: ['滑板', '块'],
  surfboard: ['冲浪板', '块'],
  'tennis racket': ['球拍', '把'],
  bottle: ['瓶子', '个'],
  'wine glass': ['酒杯', '只'],
  cup: ['杯子', '个'],
  fork: ['叉子', '把'],
  knife: ['刀', '把'],
  spoon: ['勺子', '把'],
  bowl: ['碗', '只'],
  banana: ['香蕉', '根'],
  apple: ['苹果', '个'],
  sandwich: ['三明治', '个'],
  orange: ['橙子', '个'],
  broccoli: ['西兰花', '颗'],
  carrot: ['胡萝卜', '根'],
  'hot dog': ['热狗', '个'],
  pizza: ['披萨', '块'],
  donut: ['甜甜圈', '个'],
  cake: ['蛋糕', '块'],
  chair: ['椅子', '把'],
  couch: ['沙发', '张'],
  'potted plant': ['盆栽', '盆'],
  bed: ['床', '张'],
  'dining table': ['桌子', '张'],
  toilet: ['马桶', '个'],
  tv: ['电视', '台'],
  laptop: ['电脑', '台'],
  mouse: ['鼠标', '个'],
  remote: ['遥控器', '个'],
  keyboard: ['键盘', '个'],
  'cell phone': ['手机', '部'],
  microwave: ['微波炉', '台'],
  oven: ['烤箱', '台'],
  toaster: ['烤面包机', '台'],
  sink: ['水槽', '个'],
  refrigerator: ['冰箱', '台'],
  book: ['书', '本'],
  clock: ['钟', '座'],
  vase: ['花瓶', '只'],
  scissors: ['剪刀', '把'],
  'teddy bear': ['玩偶', '只'],
  'hair drier': ['吹风机', '个'],
  toothbrush: ['牙刷', '支'],
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
  return hit ? { name: hit[0], measure: hit[1] } : { name: '物', measure: '件' }
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
