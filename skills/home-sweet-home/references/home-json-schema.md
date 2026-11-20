# home.json 数据模型规范

viewer 只读这一份数据；改方案 = 改 JSON → `python3 build.py` → 刷新页面。

## 目录
1. 坐标与单位
2. walls / openings
3. rooms
4. furniture（kind 清单）
5. materials / palette / lighting
6. 从户型图推坐标的方法
7. build.py 校验项

## 1. 坐标与单位
- 单位 cm；平面 x 向东、y 向南（与户型图"上北下南"同向）；原点 = 外轮廓外包框西北角。
- three.js 内部：X=东，Z=南，Y=上，1 单位 = 1m（viewer 内 `S=0.01`）。
- 旋转 `rot`：顺时针角度，0=家具正面朝南（+y），90=朝西，180=朝北，270=朝东。家具"正面"= 门 / 抽屉 / 坐面朝向。

## 2. walls
```json
{ "id": "ext-n-c", "a": [560,0], "b": [850,0], "t": 20,
  "openings": [ { "type": "window", "at": 145, "w": 180, "h": 150, "sill": 90 } ] }
```
- `a→b` 墙中线；`t` 厚度（外墙 20、内墙 12）；`parapet: 110` 表示阳台矮墙 + 玻璃栏杆（不建满高墙）。
- opening `at` = 洞口中心到 a 点距离；`type`：
  - `window`（sill/h）、`bay` 飘窗（再加 `depth` 外凸深度，自动判断朝外侧）
  - `door` 平开门（`hinge: "a"|"b"` 铰链靠哪端；自动开向非客厅/玄关一侧）
  - `slider` 推拉门（>300cm 自动 4 扇，中间两扇呈打开状态）
  - `entry` 入户门
- 墙两侧材质自动取：沿法线 14cm 处落在哪个 room 就用该 room 的 `wall`；落空 = 外墙；`room.accentWall` 指定该房间的强调墙。

## 3. rooms
```json
{ "id": "living", "no": "II", "name": "客餐厅 · 大横厅", "en": "Living & Dining",
  "area": 35.1, "where": "南向 · 连 16.3㎡ 大阳台",
  "poly": [[190,405], ...],          // 房间内轮廓（顺/逆时针均可）
  "floor": "oak", "wall": "wall_terracotta", "accentWall": "ext-e", "accent": "limestone_blush",
  "floorStatus": "change", "wallStatus": "change",   // keep|change|add|todo → 决策图层着色
  "cam": { "p": [x,z_cm,y], "l": [x,z_cm,y] },       // 房间人视点：p 相机，l 看向点；中间值是高度 cm
  "keep": [], "change": [], "add": [], "todo": [],    // 信息面板四色清单
  "picks": [["品类","型号/规格","价格"]],
  "areaEstimate": true,  // 面积是估算（不参与 polygon 面积校验）
  "outdoor": true }      // 阳台等，不出现在底部房间条
```

## 4. furniture
公共字段：`room` `kind` `name` `x` `y` `w` `d` `h` `rot` `elev` `status`（keep/change/add/todo，决策图层显示垫块）。

| kind | 说明 / 额外字段 |
|-|-|
| sofa armchair bed nightstand | 布艺用亚麻/毛圈法线贴图 |
| dining | 餐桌 + 4 椅（w×d 为桌面） |
| coffeetable beanbag | 圆形，用 `r` |
| tvwall tvstand tv | 电视墙贴面 / 悬浮柜 / 壁挂电视 |
| cabinet wardrobe glasscabinet bigtable | 柜体；`back: "slats"` 背面木格栅（衣柜兼隔断） |
| counter | 橱柜段；`feature: "sink"|"cooktop"` |
| fridge vanity toilet shower | 厨卫 |
| desk | 联桌；`returnLen` 转角长度 |
| bar | 吧台 + 咖啡机 |
| baycushion | 飘窗坐垫；`wall` = 飘窗所在墙 id |
| curtain art mirror rug pendant floorlamp | 软装 / 灯 |
| plant | CC0 盆栽 glTF；`s` 缩放 |
| lounge yogamat dumbbell watersys chair | 其它 |

新家具类型：在 `viewer.js` 的 `builders` 里加一个同名函数（RoundedBoxGeometry 拼装，约 10 行），不需要动其它代码。

## 5. materials / palette / lighting
- `materials.<id> = { color, tex: floor|plaster|limestone|tile|walltile, label }`；`label` 会显示在信息面板"材质标签"里。
- `palette` 是家具用色（walnut / oak_light / linen / brass…），viewer 依赖 `walnut oak_light stone_slab linen brass charcoal` 这几个 key。
- `lighting.coveRooms` 有灯带的房间；`lighting.tracks` 磁吸轨道（a/b 两端点，cm）。

## 6. 从户型图推坐标
1. 读四边尺寸链（mm）→ 累加成网格线：例如北向 1950/1800/1850/2900/1900/3000/1800 → x = 0,195,375,560,850,1040,1340,1520（cm）。
2. 像素比例只用来判断"哪条墙落在哪条网格线上"；**数值以标注为准**。实测本户型南向尺寸链与图面像素偏差达 45cm，图面不按比例画是常态。
3. 房间面积用墙中线多边形算会比标称"套内净面积"大 5–15%（含半墙厚）；build.py 容差 0.85–1.45 倍。
4. 网站/文案里的"约 X㎡"若户型图未单列（如玄关含在客餐厅内），标 `areaEstimate: true`。

## 7. build.py 校验项（失败则退出码 1，不出包）
- 开洞是否超出墙长
- 房间 polygon 面积 vs 标称面积
- 家具中心点是否落在所属房间 polygon 内
- `accentWall` / `baycushion.wall` 引用的墙 id 是否存在
