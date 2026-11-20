# 管线踩坑清单（Blender 5.2 + glTF + three r147 + 无头截图）

## Blender 5.2 API
- 无头建模引擎枚举是 `BLENDER_EEVEE`（不是 EEVEE_NEXT）；GPU 是 `compute_device_type='METAL'`，设备 `('Apple M5 Pro (GPU - 20 cores)', 'METAL')`。
- `uv_layers.ensure()` 不存在：用 `me.uv_layers.get("X") or me.uv_layers.new("X")`。
- 局部坐标子物体：`ob.parent = p` 后必须 `ob.matrix_parent_inverse = Matrix.Identity(4)`；用 `parent.matrix_world.inverted()` 会让所有家具按父级旋转被错误抵消，全部塌到原点。
- 函数签名坑：`local_box(name, parent, ...)` 的参数顺序写反会报 `Meshes.new() expected string not Object`——子物体构造器第一个参数是 parent。
- Principled BSDF 的 Mix 节点在 5.2 是 `ShaderNodeMix`，`data_type='RGBA'`，输入是 Factor(0)/A_RGBA(6)/B_RGBA(7)，不是 MixRGB。
- 墙面/地面多边形建好后要 `bmesh.ops.recalc_face_normals`，否则挤出楼板法线反向。
- `export_scene.gltf`：`export_apply=True`（应用旋转/缩放）+ `export_yup=True`（标准 Y-up），UV1/自定义 extras 会保留（probe 验证 TEXCOORD_1 和 extras 都在）。同一个 op 调用里 `export_yup` 不能传两次。

## 贴图
- Poly Haven 拒绝 Python urllib 默认 UA，全部走 `curl -A "home-3d/1.0"`。
- 脏旧肌理贴图（white_rough_plaster、rough_linen 的彩色 Diffuse）直接乘 tint 会让墙变成水泥斑驳、沙发变成蓝色牛仔布：**墙面和布艺在样板间用纯色**（MATS 里不给 tex）；地板/木柜/石材保留纹理。需要织物纹理时用中性灰 detail（从 Diffuse 去色居中到 128 再轻微对比）。
- 贴图实际尺寸（Poly Haven info）：laminate 地板 1.7m/tile、oak_veneer 1.83m、织物约 0.27m。UV0 是米制坐标，repeat = 1/tile。
- 头显里 data URI 纹理：GLTFLoader 自带的贴图走模型，自建材质用 TextureLoader 读 assets.js 里的 data URI，sRGB/Linear 显式指定。

## three.js r147
- **材质数组 + 空 groups = 整网格不渲染**：glTF 导入的 mesh.material 是数组但 geometry.groups 为空，r147 走进数组分支后 for(groups) 一次都不执行，画面只有背景色且无报错。修法：加载后把材质扁平成单个 `o.material = mat`（本管线所有网格确实只有一个材质）。
- 排查渲染空白顺序：①pageerror/console error；②renderer.info.render.calls=0 说明根本没 draw call；③Raycaster 打不中先查材质数组；④frustum intersectsBox=true 但像素全背景色，基本就是上面 groups 问题。
- 坐标：Blender Z-up/Y-up 导出后 three 是 Y-up，plan 坐标 (x 东, y 南, z 高) → three (x/100, z高/100, y南/100)，别加负号；灯光/相机/碰撞区都用同一 pv()。
- 灯光强度按 r147 非物理单位调：轨道 SpotLight 5~6、灯带 PointLight 0.9、吊灯 4~5；Blender 里的 W/m² 数值搬过来会纯白过曝。
- IBL：PMREM RoomEnvironment envMapIntensity 0.3~0.5，太亮会发灰；玻璃/金属给 1.0。
- 玻璃 MeshPhysicalMaterial transmission + depthWrite=false + opacity 0.15；纱帘 transparent opacity 0.4 DoubleSide。

## 无头浏览器截图（Playwright + 本机 Chromium）
- 豆包内置浏览器 headless 截图不出 WebGL；用 playwright-core + `npx playwright install chromium`（缓存于 ~/Library/Caches/ms-playwright），launch 加 `--use-angle=metal`。
- 页面 28MB data URI 首次加载给 10~12s 等待；无报错但黑屏先等够时间。
- 无头只做截图验证，不跑渲染烘焙，避免占用户 CPU/内存。

## 资源占用原则
- 建模导出是秒级 I/O 操作（实测 13~15s，user CPU 约 2%），随时可跑。
- Cycles 烘焙会吃满 GPU/内存且耗时长，默认管线不包含；需要照片级时优先 three-gpu-pathtracer（看的人自己的显卡）或云端渲染。
- 交付后删除 out/*.blend、预览 PNG、HDRI、已嵌入 assets.js 的纹理目录，保留 glb、web/、blender/ 源码、植物模型。

## 纯原生 Three.js 版（默认模板，均已在 v2 实测）

### 坐标与几何
- 平面 cm（x 东、y 南）→ three 米 (x/100, 高/100, y/100)。地面/天花用 BufferGeometry 直接喂 (x, h, y)，`ShapeUtils.triangulateShape` 出三角后**显式定绕序**：朝上 (a,c,b)、朝下 (a,b,c)。别用 ShapeGeometry + rotateX（会南北颠倒或法线朝下，画面被一整块大面占满）。
- 竖直构件统一用 `F = translate(中点) · rotateY(-ang)`，此时 local +z = 平面左法线 (-sin, cos)；墙两面分别贴左右房间材质，用中点 ±(t/2+6cm) 处 `roomAt()` 判断房间。
- **墙用真实厚度**（12~20cm）+ 两端各延长 t/2 让墙角闭合；洞口两侧墙段 + 窗台墙 + 过梁分别建，窗洞内侧补 1cm 收口面，否则斜看能看进墙体空腔。
- **单位一律 cm 传入、helper 内 /100**。植物生成器例外：按米。cm/m 混用会产生上百米的巨型网格挡住相机——出现时用 `Box3().setFromObject` 扫离群 mesh。
- `BufferGeometryUtils.mergeBufferGeometries` 要求属性一致：合并前统一 toNonIndexed、补 uv、删多余属性；任何除以 `Math.floor(L/120)` 之类的分母要 `Math.max(1, …)`，否则 NaN 顶点会报 `computeBoundingSphere radius is NaN`。

### 门窗（用户最在意"悬空门"）
- 门 = 左右立框 + 顶框（全部从地面起，厚度 = 墙厚 + 3cm）+ 两面门套线 + 门扇。门扇单独 Group，绕铰链轴旋转；**室内门开 90° 贴墙**，半开（45°~60°）会在人视角挡住画面。
- 门扇开向：`swingTo` 指定，否则开向面积小的房间；入户门关闭。打开的门扇作为一段碰撞线段。
- 推拉门 4 扇时中间两扇推向两侧，留出可通行开口；湿区门洞加门槛石。
- 飘窗：窗框外推 depth、台面石材、两侧墙与顶板；坐垫按飘窗参数在 FURN.baycushion 里重算，注意 inSide 决定室内朝向。

### 视角与交互
- **人视角不要用 OrbitControls 绕点旋转**（用户反馈"视角调整不方便"）：改为原地拖拽改 yaw/pitch（像 360° 全景）、滚轮改 fov（35~95°）、双击地面平滑走过去、WASD。OrbitControls 只在俯瞰用。
- 机位：每间一个 OVERRIDE（站位 + 注视点 + fov 76~82）。站位离墙 ≥ 0.4m、避开门扇和吊灯（相机埋进吊灯罩会出现巨大黑球/白圈）。小房间（卫生间、客卧）站在门口内侧斜对角，fov 80+ 才看得全。
- **碰撞只拦"越走越近"**：`d(新位置) < r 且 d(新) < d(旧)` 才阻止；家具 AABB 只拦"从外进入"。否则相机一旦贴墙/出生在碰撞半径内就永远卡死。过梁（z0 > 150cm）不参与碰撞。
- 俯瞰剖切：天花 mesh 单独建、`visible=false`；墙/门窗/灯具/窗帘材质挂 `clippingPlanes=[Plane((0,-1,0), 1.15)]`，家具材质不挂（保持完整）。`scene.background` 在俯瞰切成浅米色、隐藏天空球。房间标签用 DOM + `project()` 定位。

### 材质与纹理
- 纹理全用 Canvas 生成，**用世界坐标投影**（onBeforeCompile 按法线主轴取 xz/zy/xy），避免盒子拉伸纹理；同一份贴图亮度做 dFdx/dFdy 微凹凸（墙 0.012、织物 0.02、木 0.003）。
- `customProgramCacheKey` 固定返回同一 key，所有 tri 材质共享程序；`defines` 不同才会多编译。
- 墙面"硅藻泥"抹刀纹 alpha ≤ 0.03，否则像水渍；天花不加抹刀纹。木纹 contrast 0.45~0.7、竖向 repeat (0.9, 2.2)，否则门板/橱柜像斑马纹。
- 玻璃**不要用 MeshPhysicalMaterial transmission**：会触发额外 transmission pass，全屋几十块玻璃直接掉帧；用 MeshStandard + transparent opacity 0.10~0.16 + 高 envMapIntensity 足够。
- CanvasTexture 默认 flipY：uv.v=1 采样画布顶部。渐变遮罩（洗墙光/AO）要逐个确认方向——洗墙光顶部最亮、地脚 AO 底部最暗；做反了会出现"墙上半截一块白板"。渐变纹理用 16×512 + 抖动 + LinearFilter 不生成 mipmap，避免条带。

### 灯光与氛围（r147 非物理单位）
- 黄昏（对齐插画）：Directional 2.9 (#ffa458，低角度 y=0.28)、Hemi 0.26、Ambient 0.05、exposure 0.9；轨道 Spot 2.4、吊灯 1.4、落地灯 1.3、灯槽补光 0.42；洗墙光 opacity 0.34、高 95cm。
- 日间：Directional 2.5、Hemi 0.4、exposure 0.92，室内灯与洗墙光全关。夜晚：Directional 0.12（月光）、Spot 3.0、吊灯 2.0、洗墙 0.5。
- 洗墙光（AdditiveBlending 平面）高度 > 1.2m 或 opacity > 0.5 会把墙上半截洗成白板；灯罩 halo 透明度 ≤ 0.25。
- 天花加极弱暖色 emissive（黄昏 0.07）模拟灯槽反射，否则天花发灰。
- 室内灯数量直接决定着色器复杂度：所有灯常驻，按"所在房间 + 距离"限额 14 盏，**只改 intensity、不增删、不切 visible**，避免切房间时重编译卡顿。阴影只给太阳，`shadowMap.autoUpdate=false`，切换模式时 `needsUpdate=true`。

### 性能基线（1600×960，M 系 Mac 无头 Chromium）
- 全屋 10 间：约 220 draw call、12 万三角、22 个程序、加载约 1.3s、≈60fps。合批前 600+ draw call。
- 植物叶片是参数化曲面 + 合批，橄榄树 520 片叶仍只占 1~2 个 draw call。

### 无头验收
- 用 `scripts/verify-web.js`：等 `window.NATIVE` 出现 → 逐间 `goRoom(id, true)` 截图 → 输出 perf 和报错。warning 也要清零（NaN 包围球就是从 warning 里查到的）。
- 截图一定要**逐张打开看**并与参考图并排：程序"无报错"不代表画面对（洗墙光方向反、门扇挡视线、书架挡窗都是看图才发现的）。

### 房间改用途（书房→步入式衣帽间套间，实测）
- **改门洞只改 home-data.js 的 walls.openings，不要动房间 polygon**：封门 `openings=[]`；墙多门就放多个 opening（门 t 坐标沿各自墙 a→b 独立计算，别混用 x 坐标）。
- 套间三连门动线：走廊进衣帽间（南墙门）、衣帽间进主卧（同墙另一开门）、衣帽间进卫生间（共用竖墙开门，swingTo 开向衣帽间侧）。开向先在 plan 俯视图确认，人视角机位要同步改 OVERRIDE（房间用途变了旧机位一定不对）。
- 通顶柜别盖在门窗上：先列该墙所有 opening（含飘窗、窗），柜体分段避让；柜门用浅色门板 + 0.4cm 深 plinth_dark 细缝表达分缝，整块深色门板黄昏下像一面黑墙。
- 衣帽间柜体按 frame 局部坐标摆放时，画 world→local 换算表（local x = world.x − 家具中心 x），west/east 墙面朝向 +y/-y 容易写反，写完先 plan 截图核对再看人视角。

### 岛台 / 圆餐桌 / 长台盆（新增 FURN 模式）
- 岛台微蒸烤：黑玻璃面板用 glass_black（opacity 材质）+ steel 框 + 横向把手；咖啡机复用旧 bar 的零件搬到岛台北端，同时删旧家具（dining→dininground、bar 整个移除，pendant 跟随新坐标）。
- 圆餐桌椅 4 把用极坐标摆位，藤编椅朝向单独算（椅子默认朝南，方位角 0/90/180/270）。
- **长台盆的镜子朝向**：vanity 用 `rot=0` 贴南墙时，默认 `Plane()` 贴在 local -y 面会朝墙（镜子背面朝外，画面只剩一圈灯带）。必须显式 `rotateY(PI)` 放到 +d/2 面让镜面朝北；双盆用同一份 basin() 工厂 ±w*0.27 生成，龙头/托盘跟随。
- 小卫生间机位：站房间西北角（门洞内侧）fov 78~80 斜看东南，比站东墙近景更能同时看到台盆、马桶和窗。

### 艺术涂料肌理升级
- plaster() 在原有 fbm 云纹外再加一层中频 fbm ridge（频率 18，幅度 9）+ 统一 24° 方向的短批刮线 200~240 道（alpha ≤0.03），就是"艺术涂料/肌理硅藻泥"手感；bump 从 0.012~0.014 提到 0.022~0.026、repeat 从 1.6 收到 1.25m，侧光能看到颗粒但不正对镜头发花。

### 公网部署（Netlify 实测，必读）
- **three CDN 必须本地化再部署**：jsdelivr（含 fastly 节点）在国内家庭宽带常被 RST（ERR_CONNECTION_RESET），file:// 双击能开≠公网能开，5 个 three 脚本全部加载失败会永远卡在 loading。部署前把 three r147 的 5 个文件（build/three.min.js + OrbitControls/RoomEnvironment/RoundedBoxGeometry/BufferGeometryUtils）下载到项目 `vendor/`，index.html 改引相对路径并去掉 SRI/crossorigin。npmmirror registry 直链可用：`https://registry.npmmirror.com/three/0.147.0/files/<path>`。
- **上线验收必须走真实网络**：用 playwright 打开 https 链接（不是 file://），断言 `window.NATIVE` 出现、requestfailed 为空、逐间 goRoom 截图。
- netlify-deploy 脚本在"指定名被占→随机回退"分支偶发丢 token 报"无法确定或创建站点"：直接用脚本里的 token 调 API `POST/PATCH /sites` 建/改名（先 GET 探 404 判断占用），再 `netlify deploy --prod --dir . --site <id>`。简单短域名（home3d、myhome 之类）基本都被占，一次准备 8~10 个候选。
