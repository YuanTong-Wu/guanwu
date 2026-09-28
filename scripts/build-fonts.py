"""把两套 OFL 字体裁成只含用到的字的 woff2，并改名（避开保留字体名）。

用法：
  node scripts/font-chars.mjs          # 先收集用字
  python3 scripts/build-fonts.py       # 需要 fonttools 和 brotli：pip install "fonttools[woff]"

源字体放在 fonts-src/（不进仓库），缺了会自动下载：
  马善政 Ma Shan Zheng（OFL-1.1）  https://github.com/googlefonts/mashanzheng
  霞鹜文楷 GB LXGW WenKai GB v1.522（OFL-1.1） https://github.com/lxgw/LxgwWenkaiGB
"""
import os
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fonts-src")
OUT = os.path.join(ROOT, "public", "fonts")

FONTS = [
    {
        "file": "MaShanZheng-Regular.ttf",
        "url": "https://raw.githubusercontent.com/googlefonts/mashanzheng/master/fonts/ttf/MaShanZheng-Regular.ttf",
        "chars": "brush-chars.txt",
        "family": "WQ Brush",
        "out": "brush.woff2",
    },
    {
        "file": "LXGWWenKaiGB-Regular.ttf",
        "url": "https://github.com/lxgw/LxgwWenkaiGB/releases/download/v1.522/LXGWWenKaiGB-Regular.ttf",
        "chars": "serif-chars.txt",
        "family": "WQ Serif",
        "out": "serif.woff2",
    },
]


def ensure(font):
    path = os.path.join(SRC, font["file"])
    if not os.path.exists(path):
        os.makedirs(SRC, exist_ok=True)
        print("downloading", font["url"])
        urllib.request.urlretrieve(font["url"], path)
    return path


def rename(tt, family):
    ps = family.replace(" ", "")
    for rec in tt["name"].names:
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID in (4,):
            rec.string = f"{family} Regular"
        elif rec.nameID in (3,):
            rec.string = f"{ps}-Regular-subset"
        elif rec.nameID in (6,):
            rec.string = f"{ps}-Regular"


def build(font):
    path = ensure(font)
    text = open(os.path.join(SRC, font["chars"]), encoding="utf-8").read()
    cmap = TTFont(path).getBestCmap()
    missing = [c for c in text if ord(c) not in cmap and not c.isspace()]
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.hinting = False
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    tt = TTFont(path)
    sub = subset.Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(tt)
    rename(tt, font["family"])
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, font["out"])
    tt.flavor = "woff2"
    tt.save(out)
    size = os.path.getsize(out)
    print(f"{font['out']}: {len(text)} chars -> {size / 1024:.0f} KB; missing glyphs: {''.join(missing) or 'none'}")
    return missing


if __name__ == "__main__":
    missing = {f["out"]: build(f) for f in FONTS}
    # 正文字体必须覆盖所有字；书法字体缺的字由正文字体兜底
    if missing["serif.woff2"]:
        sys.exit("serif font is missing glyphs: " + "".join(missing["serif.woff2"]))
