---
name: home-sweet-home
description: 家装 / 室内空间的 AI-Native 3D 可交互效果图。把户型图尺寸 + 逐间装修方案（保留/改动/新增/待定）变成一个双击即开的网页：默认纯 Three.js 原生直出——零外部软件、零素材库、零本地渲染，Canvas 程序化材质（硅藻泥/木地板/莱姆石/亚麻/藤编），人视角 360° 环视 + 剖切俯瞰 + 黄昏/日间/夜晚氛围 + 逐间方案面板，约 220 draw call、60fps。要照片级质感时可选 Blender 无头建模 + glTF PBR 管线。USE WHEN：用户要做户型 3D、装修效果图、空间可视化、全屋漫游、家装设计 Agent、按装修方案改房间/换材质/调布局、对比方案，或问"用什么 AI/开源工具做室内 3D"。
---

# home-sweet-home

家装 3D 的 AI-Native 工作流：**home.json（户型 + 方案）→ 原生 Three.js 场景 → 浏览器实时渲染**。
不装软件、不跑烘焙、不下素材：所有模型、纹理、植物、天空都由代码生成，用户双击 `index.html` 就能看，手机也能流畅打开。

## 选哪条路线

| | **A. 纯原生版（默认）** | B. Blender PBR 版（可选） |
|---|---|---|
| 依赖 | 仅 three r147 官方 CDN（含 RoundedBox / BufferGeometryUtils，带 SRI） | Blender headless + CC0 纹理约 46MB |
| 资源 | 代码约 155KB，加载约 1.3s | glb + 纹理 data URI 约 28MB |
| 本地负载 | 零（浏览器 GPU） | 建模导出约 15s |
| 质感 | 程序化纹理 + 世界投影 + 微凹凸、灯槽洗墙光、接触阴影、PMREM | 真实照片纹理 PBR |
| 用途 | **首选**：全屋方案预览、逐间对照、分享 | 单间要贴图级真实度时 |

**默认走 A**。只有用户明确要"照片级/真实贴图"时才上 B（`new_home.sh <dir> --blender`，详见 references/blender-pipeline.md）。
用户反对本地高 CPU/内存任务时，**禁止**跑 Cycles 烘焙。

## 路线 A：原生 Three.js（模板 `assets/native-template/`）

1. **建项目**：`scripts/new_home.sh <项目目录>` → 复制 index.html / materials.js / plants.js / scene.js / viewer.js（+ 示例 home-data.js）。
2. **户型数据**：按 [references/home-json-schema.md](references/home-json-schema.md) 写 home.json，再生成 `home-data.js`（`window.HOME = {...}`）。墙用中线 + openings（door/entry/slider/window/bay），房间用 polygon，家具用 (x,y,w,d,h,rot)。
3. **对齐参考图**（有方案网站/效果图时必做）：
   - 全景图（equirect 4096×2048）用 numpy 展开成 4 向透视图，逐间看材质、灯光、家具款式；参考插画同理。
   - 把差距写成清单：墙面色、地板色、灯槽/轨道灯、家具款式（模块沙发、藤编椅、纸灯笼…）、窗外景观。
4. **改代码**（按需，不改架构）：
   - 材质：`materials.js` 的 `T`（纹理调色）和 `M`（材质表）；墙/地/木作用 `tri()` 世界投影，换颜色只改 base RGB。
   - 家具：`scene.js` 的 `FURN.<kind>`，参数化 + 合批；新家具照抄现有函数结构（B 盒 / Cy 圆柱 / Lathe 旋转体 / Tube 弯木），最后 `contact()` 加接触阴影、`collide()` 加碰撞。
   - 机位：`viewer.js` 的 `OVERRIDE`，每间一个人视角机位（站位 p、注视点 l、fov）。
   - 氛围：`viewer.js` 的 `MODES`（dusk/day/night 的太阳方向/颜色、半球光、曝光、各类灯强度、洗墙光透明度）。
5. **验收（必做）**：`node scripts/verify-web.js index.html /tmp/check living:dusk kitchen:dusk master:night plan`
   - 必须 0 页面报错/告警；看 perf（draw call ≤ ~300、fps ≈ 60）。
   - **逐张打开截图**，对照参考图检查：门是否落地有门套、天花是否挡视线、墙是否穿模、家具朝向、灯光是否过曝/偏灰。
   - 关键交互用脚本验证：拖拽环视、滚轮变焦、W 撞墙会停、双击地面走过去、底部房间按钮、俯瞰点房间进入。
6. **交付**：整个目录（6 个文件）+ screenshots/；要公网链接用 netlify-deploy / vercel-deploy。

### 查看器能力（模板已内置）
- **人视角**：原地拖拽环视（像 360° 全景）、滚轮变焦 35–95°、双击地面平滑走过去、WASD/方向键走动；墙/门扇/大件家具碰撞，只拦"越走越近"，贴墙也能转身离开。
- **俯瞰**：剖切娃娃屋，隐藏天花，墙/门窗/灯具用 clippingPlane 切到 1.15m，家具保持完整；房间标签可点击进入。
- **氛围**：黄昏（默认，暖阳 + 灯槽 + 吊灯）、日间、夜晚；手绘程序化天空（远山/城市/林带/星空）。
- **方案面板**：随所在房间自动切换，显示保留/改动/新增/待定；底部房间条一键跳转；出图 PNG。
- **性能**：静态几何按材质合并（约 220 draw call）；室内灯按距离 + 所在房间限额 14 盏、只改强度不增删（避免着色器重编译）；阴影图只在切换时更新。

## 工具选型问答
"AI 做室内 3D 用什么"时读 [references/toolchain-research.md](references/toolchain-research.md)：可交互场景 Three.js 代码直出最直接；离线渲染用 Blender bpy；资产用 CC0 或图生 3D；MCP 只在驱动桌面软件时才需要，网页 3D 不需要。

## 边界（如实告知用户）
- 家具是按方案描述参数化建模的"同款意向"，不是品牌真实模型；要指定型号需要 GLB 资产或图生 3D。
- 尺寸按户型图标注推算，精度约 ±5cm；不出水电点位、立面图、施工图。
- 程序化纹理能还原色调和质感层次，但达不到照片贴图的颗粒真实度；全局光照为近似（半球光 + 灯槽洗墙 + 接触阴影），不是路径追踪。

## 目录
- `assets/native-template/`：**默认模板**（原生 Three.js 6 文件，含云璟江屿 134㎡ 示例数据）。
- `assets/pipeline-template/`：Blender → glTF 管线（路线 B）。
- `references/home-json-schema.md`：户型/方案数据规范。
- `references/pitfalls.md`：踩坑清单（**修 bug 先查这里**）。
- `references/blender-pipeline.md`：路线 B 架构。
- `references/toolchain-research.md`：工具链调研结论。
- `scripts/new_home.sh`（新建项目）、`scripts/verify-web.js`（无头逐间截图 + 性能 + 报错验收）。
