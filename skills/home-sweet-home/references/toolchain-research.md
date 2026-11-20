# 工具链调研结论（2026-10）

## 1. Opus 5.5 案例工具链统计
数据源：`xianyu110/awesome-claude-opus-5.5` 的 cases.json（1,034 条，X 平台 2026-09-20 ~ 09-28，作者本人产出）。按帖子正文关键词计数，**只能反映"提到了"，未提及工具的帖子会漏计**。

| 工具 | 全部 | 3D&WebGPU(139) | Game(168) | 角色 |
|-|-|-|-|-|
| Claude Code | 116 | 13 | 8 | Agent 外壳（跑代码、调工具） |
| Blender | 93 | 43 | 14 | 离线建模 / 绑定 / 渲染 / 动画；通过 MCP、Higgsfield 插件或 bpy 驱动 |
| Three.js | 89 | 40 | 30 | 浏览器实时 3D、可交互场景、网页游戏的主力 |
| 视频生成（Seedance/Veo/Kling…） | 30 | 0 | 1 | 镜头补帧 / 片段 |
| Higgsfield MCP | 26 | 6 | 2 | 资产 + 视频生成 + Blender/AE 桥接 |
| Tripo | 21 | 12 | 4 | 图片 → 3D 资产（角色/道具） |
| GPT Image / Nano Banana | 21 | 1 | 3 | 概念图、贴图、参考图 |
| HyperFrames / Remotion / ffmpeg | 17 / 9 / 7 | 0 | 0 | 代码 → 视频（动效、讲解片） |
| Unity / Unreal / Godot | 9 / 9 / 8 | 2/4/2 | 7/3/5 | 原生游戏 |
| Blender MCP（明确写出） | 6 | 2 | 3 | MCP 驱动 Meshy/Blender/ElevenLabs/Unity 等 |
| Meshy | 4 | 1 | 3 | 文/图 → 3D |
| Gaussian Splat | 3 | 0 | 2 | 实景重建 |

## 2. 家装 / 室内代表案例
- 户型图 → 乐高房屋（读平面成墙/门窗/楼梯，3,149 个现有零件，Scenario MCP 出渲染图）
- 几张照片 → 房间 2D + 3D 实尺模型（搬家前试挂画）
- Zillow 房源照片 → 3D 漫游（已开源）
- 内罗毕国家博物馆 14 个展厅可步行 3D 导览（Three.js，热点 + 小地图 + WASD/触屏）
- Blender Geometry Nodes 程序化建筑移植到 three.js 实时运行
- 手机/眼镜视频 → 室内 3D 重建 Skill（Blender 重建 + 语音标注房间名）

## 3. 本 Skill 的选型（已落地验证）

从案例规律和自用实测得出：**MCP 只在驱动需要 GUI 的软件（Blender/Unity/Premiere）时才出现；做网页 3D，代码直出路径最短**。家装场景采用双版本：

| 需求 | 用什么 | 改方案成本 | 质感 |
|-|-|-|-|
| 定方案、频繁改布局/颜色/家具 | **白模版：home.json → Three.js 实时 PBR**（数据驱动，双击打开） | 改一个字段 + 构建，秒级 | 高级白模，方案表达足够 |
| 给家人/施工方看的沉浸式预览 | **展示版：home.json → Blender 无头建模 → Cycles 烘焙光照 → glb → Three.js** | 改后重新烘焙，数分钟 | 有全局光、软阴影、真实材质，离线渲染级 |
| 照片级单张 / 漫游视频 | 同一份 home.json 写 bpy，Cycles 直接出图/出视频 | 慢，按需 | 最高 |
| 照片实景氛围增强 | 3D 出图 → 图像编辑模型（尺寸/摆位以 3D 为准） | 快 | 照片级氛围 |
| 国标施工图 | 天正 + AutoCAD + 人工审图 | — | 开源/AI 链路达不到盖章深度 |

已淘汰：Sweet Home 3D + MCP（家具少、光照基础、要装 GUI 软件；插件协议、会话头、中文目录名等都是额外维护成本，对"可交互 web 预览 + 高质量"两个核心诉求都不是最优）。本机相关软件、插件、配置、脚本已全部清理。

## 4. 关键事实

- Blender 5.2 LTS 原生支持 Apple Silicon + Metal GPU，`blender -b -P script.py` 无头运行，不需要打开界面。
- glTF 可同时携带两套 UV（UV0 贴图 / UV1 光照图），three.js 直接识别；光照烘焙 + WebGL 是成熟组合，不是试验路线。
- CC0 资产首选 Poly Haven（HDRI / 贴图 / 模型均可商用）；家具成品模型免费库稀缺、款式不可控，程序化建模 + 真实贴图在自用场景更可控，需要品牌真实型号时再考虑 Tripo/Meshy 生成。
