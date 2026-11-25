# 素材入口与来源

内置图是经过裁切或 WebP 压缩的参考资源。来源、裁切方式、尺寸与字节数记录在 `assets/media-catalog.json` 的 `bundled_references`；原件以内容摘要去重，路径保留在 `originals[].locations`。用 `scripts/media.py` 查询局部结果，通常不必把整个索引加载进上下文。

## 选择内置参考

以下路径均相对于 Skill 目录。

| 需要什么 | 参考文件 | 使用边界 |
| --- | --- | --- |
| 快速看整体 IP | `assets/ip-overview.webp` | 立绘、表情与背景拼图 |
| 卡卡正面立绘 | `assets/characters/kaka-standing.webp` | 从动作源图裁取，保留纸底 |
| 皮皮正面立绘 | `assets/characters/pipi-standing.webp` | 从动作源图裁取，保留纸底 |
| 两只的体量与站姿 | `assets/characters/duo-standing.webp` | 同画面正面参考 |
| 两只的局部五官 | `assets/characters/kaka-bust.webp`、`assets/characters/pipi-bust.webp` | 复用已有透明胸像；是胸像裁切，不是透明全身 |
| 表情与部分角度 | `assets/characters/expression-views.webp` | 刷牙、擦嘴、伸懒腰与喷嚏；不是标准三视图 |
| 画风与世界背景 | `assets/style/watercolor-world.webp` | 当前满幅封面五款速览 |
| 历史画法 | `assets/style/historical-styles.webp` | 未命名的早期水豚形象，仅参考画法 |
| 扩展地点 | `assets/style/historical-scenes.webp` | 雨景、面包店、荷塘、海边、列车与森林 |
| 六种社交表情 | `assets/motion/social-expressions.webp` | 按铃、致谢、喝彩、泡汤、比心、拒绝 |
| 九种自然动作 | `assets/motion/natural-actions.webp` | 日常动作与三种热梗步法总览 |
| 更完整的动作过程 | `assets/motion/six-action-keyframes.webp` | 六行对应擦靴、喝茶、吃柚子、闪身步、踢球、哆嗦毛；每行四帧 |
| 实际动画节奏 | `assets/motion/timing-strips.webp` | 九行按动作总览顺序，四列采样时间为0%、25%、50%、75%；需要检查循环时读取原 GIF |
| 具体封面构图 | `assets/scenes/planning.webp`、`launch.webp`、`weekly.webp`、`retrospective.webp`、`notes.webp` | 分别对应规划、启程、周报、复盘与茶歇；压缩宽度1600，高清原件宽度2000 |

## 原始素材的采用顺序

| 原项目目录或文件 | 作用 |
| --- | --- |
| `capybara-emoji/build/capy.js` | 最早明确命名的角色定义与配色；几何画法属于早期矢量版本 |
| `capy-skill-trace/assets/crew/` | 有名字的胸像及页面角色应用；页面功能不自动成为人物职业 |
| `capybara-emoji/水彩自然动作9款/` | 当前动作参考；源视频位于其 `动作源素材/` 子目录 |
| `capybara-emoji/可爱日常-自然动作修订版/` | 刷牙、喷嚏与擦桌的自然动作来源；部分文件与九款目录完全相同，索引已合并 |
| `capybara-emoji/水彩重制版/` | 社交表情的水彩版本；大 GIF 留在原项目 |
| `卡卡皮皮-飞书封面-满幅水彩版/` | 当前背景与封面参考 |
| 其余表情包与封面目录 | 历史版本，需要复刻具体旧稿时读取 |
| `capybara-portraits/`、`capybara-portraits-round2/` | 早期单只水豚与画风探索；已有别名不自动加入双角色正典 |

文件名、旧网页说明与实际像素有差异：早期文件中存在“黏土／复古童话”等不同标签；部分网页头饰说明与图像也不一致。按实际图像识别媒介和道具，以 IP 配置决定角色身份。旧稿中单靴、脱靴或头饰被遮挡只说明该画面的处理，不推导新归属。

## 查询与取用

先 `find` 查到具体文件，再 `resolve` 获得已核对内容摘要的本地链接。原件不存在或被替换时脚本返回明确原因；需要新资源时仍可用内置参考制作。迁移 Skill 时，可继续使用相同相对目录的素材库，或按实际存放位置更新索引。

原图、GIF、MP4 收录在索引中；ZIP、重复分发目录、依赖库与网页字体不属于角色参考包。图像参考按需传给生成工具，工具支持图生图或参考图时优先使用；工具不支持本地图片时，把必要身份、姿势与画风写入请求。
