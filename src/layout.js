// 仪式画面的版式：册页、六爻、卦名的位置。纯计算，不碰画布，便于测试
// bottom：画面底部要留给结束按钮和提示的高度（CSS 像素）。卦名的下沿要在它上面，
// 放不下时先压扁册页，再收紧爻间距（矮屏幕，比如带工具栏的手机浏览器）
export function layoutFor(W, H, bottom = 0) {
  const landscape = W > H * 1.1
  if (landscape) {
    const leafH = H * 0.62
    const leafW = Math.min(W * 0.4, leafH * 1.15)
    const leaf = { x: W * 0.07, y: (H - leafH) / 2 - H * 0.02, w: leafW, h: leafH }
    const lineW = Math.min(W * 0.2, 240)
    const gap = Math.min(H * 0.07, 34)
    const hexX = W * 0.68
    const nameH = Math.min(H * 0.07, 48)
    let hexY = H * 0.44
    const over = hexY + gap * 3 + H * 0.11 + nameH * 0.6 - (H - bottom)
    if (over > 0) hexY = Math.max(gap * 2.5 + Math.max(28, H * 0.05) + nameH * 0.5, hexY - over)
    return { landscape, leaf, lineW, gap, hexX, hexY, namesY: hexY + gap * 3 + H * 0.11, nameH, captionY: H - Math.max(36, H * 0.06), dateY: Math.max(28, H * 0.05) }
  }
  const leafW = Math.min(W * 0.8, 440)
  let leafH = Math.min(H * 0.34, leafW * 0.92)
  let gap = Math.min(H * 0.038, 30)
  const nameH = Math.min(W * 0.1, 46)
  const top = H * 0.09
  const after = () => top + leafH + H * 0.075 + gap * 5.5 + Math.min(H * 0.085, 64) + nameH * 0.6 - (H - bottom)
  let over = after()
  if (over > 0) {
    leafH = Math.max(H * 0.22, leafH - over)
    over = after()
    if (over > 0) gap = Math.max(gap * 0.7, gap - over / 5.5)
  }
  const leaf = { x: (W - leafW) / 2, y: top, w: leafW, h: leafH }
  const lineW = Math.min(W * 0.42, 220)
  const hexY = leaf.y + leafH + H * 0.075 + gap * 2.5
  return {
    landscape,
    leaf,
    lineW,
    gap,
    hexX: W / 2,
    hexY,
    namesY: hexY + gap * 3 + Math.min(H * 0.085, 64),
    nameH,
    captionY: H - Math.max(34, H * 0.045),
    dateY: Math.max(26, H * 0.045),
  }
}
