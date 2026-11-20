# Blender → glTF → Three.js PBR 管线（living-pilot 实测版）

## 模块组成（assets/pipeline-template/blender/）

| 文件 | 职责 |
|---|---|
| common.py | 材质表 MATS（Blender 和网页共用的唯一事实源）、plan cm → blender m 坐标 P()、房间多边形工具、输出 materials.json |
| geo.py | box / local_box / cylinder / sphere / floor_poly；UV0 用米制投影坐标（网页靠 repeat 缩放贴图），每个网格同时建 UVMap + LM 两层 UV |
| materials.py | Principled 节点材质：贴图 × tint 的 Mix 节点；glass/sheer/emissive/shade 四类特殊材质 |
| architecture.py | 读 home.json 建地面、墙体（按 openings 切段）、门窗框、滑轨门、飘窗、阳台矮墙+玻璃栏板、吊顶、灯带、轨道灯 |
| furniture.py | 21 类参数化家具：沙发（分座垫/靠背/扶手/靠枕）、餐椅、吧台+高脚凳、橱柜（灶台/水槽）、茶几、落地灯、纸灯笼吊灯、纱帘等 |
| assets.py | Poly Haven 植物 glTF 导入：多变体扫描按后缀筛选（如琴叶榕保留 _d）、归一化到目标高度、室外绿化（标记 outdoor 不导出） |
| lights.py | 日（Sky Texture 太阳+天光+补光）/ 夜（6 个轨道射灯 + 7 个灯带点光 + 吊灯/台灯）两套灯（EEVEE 校验用） |
| cameras.py | 相机预设，坐标约定 (x, 高度cm, y_plan) 三元组用 _pc() 转换 |
| build_scene.py | 组装场景 → out/living.blend + materials.json |
| export_glb.py | 删灯/世界，材质替换为白色占位（保留名字），选网格导出 GLB（export_apply=True, export_yup=True） |

## 网页侧（web/）
- pilot-viewer.js：GLTFLoader 读 data URI glb；按材质名从 MATS 重建 Standard/Physical 材质（贴图 data URI、normalMap、roughnessMap、玻璃透射、纱帘半透）；日夜灯组在 lights.js；PMREM RoomEnvironment 给反射；OrbitControls + WASD 漫游 + 多边形碰撞。
- build_web.py：贴图和 glb 全部 base64 进 assets.js（file:// 可用），材质表输出 materials.js，灯位输出 lights.js。

## 扩展

### 加一种家具
1. furniture.py 的 `_BUILDERS` 加函数，用 `_B(parent,name,lx,ly,lz,sx,sy,sz,mat,bevel)` / `_C()` / `_S()` 拼装，局部坐标单位厘米，正面朝 +y。
2. home.json furniture 里加 kind 即可，不需要改网页。

### 加一种材质
common.py MATS 加一行：`"id": dict(tint="#hex", rough=0.6)` 纯色版；
要贴图：放纹理到 assets/textures，写 `tex=<id>, tile=<米/重复>, detail=True, nstr=0.6`，再到 build_web.py 的 NEED 列表加文件名。

### 调日夜氛围
- 网页：web/lights.js（灯位/强度/颜色）和 pilot-viewer.js 的 `buildLights()`。
- Blender 预览：blender/lights.py。

## 何时需要 Blender 重跑
home.json 改了几何/家具/材质 id → build_scene → export_glb → build_web。
只调灯光或网页交互 → 不用开 Blender。

## 何时仍值得上路径追踪
要接触阴影、色彩渗色、真正的全局光照时。实时 PBR 没有间接光反弹（角落偏平），用 three-gpu-pathtracer 在浏览器里出单张氛围图最省事，不要在用户机器上本地烘焙。
