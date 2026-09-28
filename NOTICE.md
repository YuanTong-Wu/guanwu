# 第三方内容与许可

代码以 MIT 发布（见 `LICENSE`）。下面这些随仓库分发的内容各有各的许可，不属于 MIT：

| 内容 | 位置 | 来源 | 许可 |
|---|---|---|---|
| 周易原文（卦辞、爻辞、大象、彖传、小象） | `data/sources/freizl-yijing-2.1.0-64gua.json`，生成 `src/data/zhouyi.json` | [@freizl/yijing](https://github.com/freizl/yijing) 2.1.0，© Haisheng Wu | MIT（`data/sources/freizl-yijing-LICENSE`）；原文本身属公有领域 |
| 周易原文的校勘 | `data/patches.json`、`data/collation.json` | 对照维基文库所录四部丛刊景宋本王弼注、文渊阁四库全书本 | 典籍公有领域；维基文库页面文字依 CC BY-SA 4.0 标注出处 |
| 维基文库原文缓存（仅校勘脚本使用，不进网页） | `data/sources/wikisource-cache.json` | zh.wikisource.org | 典籍公有领域；转录文字 CC BY-SA 4.0 |
| 白话解读 | `src/data/plain.json` | 本项目自撰 | CC BY 4.0 |
| 书法字体子集 `WQ Brush` | `public/fonts/brush.woff2` | 马善政 Ma Shan Zheng，© The Ma Shan Zheng Project Authors | SIL OFL 1.1（`public/fonts/LICENSES/OFL-MaShanZheng.txt`） |
| 正文字体子集 `WQ Serif` | `public/fonts/serif.woff2` | 霞鹜文楷 GB LXGW WenKai GB v1.522，© LXGW | SIL OFL 1.1（`public/fonts/LICENSES/OFL-LXGWWenKaiGB.txt`） |
| 物体识别模型 EfficientDet-Lite0（int8） | `public/models/efficientdet_lite0.tflite` | Google MediaPipe 模型库（源自 google/automl EfficientDet-Lite） | Apache-2.0（文件本身不带许可信息，依 google/automl 与 litert-community/efficientdet 模型卡） |
| MediaPipe Tasks Vision 运行时 0.10.35 | `public/mediapipe/*`，npm `@mediapipe/tasks-vision` | Google | Apache-2.0。固定 0.10.35：1.x 起内置无法关闭的遥测 |
| three.js | npm `three` | three.js authors | MIT |
| lunar-javascript（仅作农历兜底，按需加载） | npm `lunar-javascript` | 6tail | MIT |

字体子集已改名为 `WQ Brush` / `WQ Serif`，只用于网页显示，不作为可安装字体分发。
声音全部由 Web Audio 现场合成，没有音频文件。所有纹理由代码在运行时画出，没有图片文件。
