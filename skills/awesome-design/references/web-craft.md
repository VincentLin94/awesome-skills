# Web 构图与绘制

把审美判断落到构图、字体、材料与组件细节。此处整合 frontend-design 的主题驱动方法与 apple-design 的可读性、空间连续性；具体参数是本技能的网页建议。

本文件的设计方法由提供的 frontend-design 指引改写并扩展，采用其 Apache-2.0 许可；归因与许可见 [来源记录](sources.md#设计指引与许可)。

## 先定表现点，再定页面

将产品任务翻译成可见主角：材料工具展示可转动的样片，地图产品先展示空间，阅读产品先展示真实排版，工程工具先展示工作对象。首屏完成一个明确动作或给出一个明确判断。

用 4–6 个有角色的核心色、1–2 组正文／展示字体、共同对齐线和一个主要表现点建立方向。语义状态色按任务补充。对照现有内容检查：替换产品名称后，画面是否仍毫无变化？若是，优先调整主视觉、信息结构或交互对象。用户明确偏好的暖纸与宋体保留，不因“常见”而删除。

不同任务可采用不同骨架：

- **产品说明：** 左侧具体价值与动作，右侧真实对象或可操作演示；下一段展示操作结果。移动端让主要动作与对象连续出现。
- **沉浸式查看：** 主对象占据稳定画布，少量就近控制，说明与精确数值在侧栏；不让镜头动画挡住动作。
- **工作台：** 导航、工具栏、行列与详情区各有明确职责；通过密度而非巨型标题提高效率。
- **专题图解：** 标题、关系图和结论形成一条阅读路径；图例与被解释对象相邻。

编号只表达真实顺序；边界只表达真实分组；标签只补充真正缺少的上下文。把个性集中在主角上，其余结构支持扫描与操作。

## HTML 与布局

用语义 DOM 确定阅读和键盘顺序，再用 Grid/Flex 组织视觉。通常不通过 CSS `order` 颠倒主要阅读顺序。导航用链接，操作用按钮，值选择用原生 input/select；可展开内容优先 details，模态任务优先 dialog。

```css
.ad-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(15rem, 20rem);
  gap: clamp(1rem, 3vw, 2rem);
  align-items: start;
}
.ad-workspace > * { min-width: 0; }
.ad-field input { width: 100%; min-width: 0; }
@media (max-width: 48rem) {
  .ad-workspace { grid-template-columns: 1fr; }
}
```

组件嵌入侧栏或卡片时，按容器宽度而非整个窗口决定重排，可使用 `container-type: inline-size` 与容器查询。滚动方向和归属明确，弹层最大高度用动态视口和 `overflow: auto`，考虑 safe-area；不要把 `overflow: hidden` 当成修复页面横向溢出的办法。

用作用域类和低选择器权重管理样式。可建立 tokens → components → utilities 的层次；引入 `@layer` 时先检查现有层顺序，未分层旧样式会优先于分层样式，避免局部引入后全部失效。避免到处用更长的选择器争夺同一属性。

## 排版的微调

字号、字重、行高与字距作为一组观察。大号拉丁标题可稍收字距；中文默认保持自然间距。宋体适合短展示段落，长按钮、表格与动态值保持无衬线。只在需要逐位比较的内容上使用等宽数字或等宽字体。

- 标题自然换行，可用 `text-wrap: balance` 增强；正文保留自然回退。检查中文标点、孤行和长英文标识符。
- 图标与文字按视觉重量对齐，不只检查 bounding box。必要时作 1px 级局部修正，不累积到整套网格。
- 为异步内容预留空间；字体加载使用合适回退与 `font-display`，避免大幅重排。保留浏览器缩放。
- 小文字通过对比度与合理字重提高可读性，不通过降低整体透明度制造“高级灰”。

高密度工具界面的紧凑控件、连续分组与图标角色见 [工作台与细节尺度](workbench.md)。其中保留 VeriFlow 可迁移的细节，统一使用本技能的视觉语言。

## CSS 材料的四层

将 **底色 → 微纹理 → 边缘／阴影 → 内容** 分开。纹理和高光用 `pointer-events: none` 的伪元素；内容始终清晰。图解纸纹可复用 tokens.css，所有数值按实际背景观察。

| 材料 | 主要视觉变量 | 克制处理 |
| --- | --- | --- |
| 暖纸／纤维 | 低对比多尺度颗粒、短纤维、暖白底 | 只在内容画布或样片出现，保持静止 |
| 哑光实体 | 温和明暗变化、接触阴影、细边缘 | 渐变跟随物体光照，避免无语义彩色光斑 |
| 金属 | 有方向的宽高光、环境反射与可辨轮廓 | CSS 适合固定视角插图；可旋转金属改用三维 |
| 玻璃功能层 | 内容透过、清晰边缘、适度模糊、浮起关系 | 只对浮动导航／工具条使用，提供实底回退 |

```css
.ad-glass-tools {
  background: var(--ad-surface); /* 无 blur 的正常状态 */
  border: 1px solid var(--ad-control-border);
  box-shadow: var(--ad-shadow-float);
}
@supports (backdrop-filter: blur(16px)) {
  .ad-glass-tools {
    background: color-mix(in srgb, var(--ad-surface) 90%, transparent);
    backdrop-filter: blur(16px); /* 阴影／底色决定层次，blur 不是全部 */
  }
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .ad-glass-tools { background: var(--ad-surface); backdrop-filter: none; }
}
```

网页的 blur 不等于 Apple 原生玻璃。先固定适度模糊，再动画化 transform/opacity；只有实际测量确认成本可接受时，才考虑动画化 blur/filter。多层大面积 backdrop-filter、阴影或高频噪声会抢占内容和性能预算。

## SVG

SVG 适合少量需要精确形状、可标注或可选择的矢量对象。建立 viewBox 和明确留白；像素级图标统一笔画和端点。需要缩放后保持细线时，可用 `vector-effect: non-scaling-stroke`，但先看移动端线条比例。

标题和复杂文案留在 DOM。独立有意义的 SVG 使用 title/desc 或与外部说明关联；纯装饰设 `aria-hidden`。嵌入重复组件时为 clipPath、mask、gradient 生成实例唯一 ID，防止多个 SVG 相互引用。

描边演示可以设置 `pathLength="1"` 再动画化 dashoffset；语义结果在播放前后都存在，渐变和描线不能代替真实进度。组合变换放到 `<g>`，显式设置 `transform-box` 与原点。不要把 `d` 字符串的任意两条路径直接当成可平滑插值的拓扑。

## Canvas 2D

Canvas 适合大量点、连续笔触、纹理生成和像素处理。先确定是否真的需要重绘整张画布；静态纹理只生成一次，小量可交互形状优先 DOM/SVG。

1. CSS 宽高决定布局，drawing buffer 按像素比设置；采用自适应 DPR 上限，避免在手机上默认渲染 3–4 倍像素。
2. ResizeObserver 后仅在尺寸变化时重设 buffer，再用 `setTransform(dpr,0,0,dpr,0,0)`，避免重复 scale 累乘。
3. 指针坐标由 client 坐标减容器矩形原点，按 CSS 尺寸映射。持续绘制使用 rAF，静态图完成后停止。
4. 大批相似绘制尽可能批处理、缓存 Path2D 或离屏图层；先测量，达到主线程瓶颈时再考虑 OffscreenCanvas/worker。
5. 点击目标、参数和等价信息由 DOM 控件提供，不能只让读屏用户接触一个无说明画布。

## 打磨顺序与性能

先看真实内容的构图，再看字号与对齐，再看材质边缘，最后看反馈和动画中间帧。每次只调整影响结论的少量变量，避免一边改布局一边加特效。

60Hz 每帧约 16.7ms，120Hz 约 8.3ms，浏览器其他工作也要共享这段时间。这是预算概念，不是未测量的性能承诺。对持续交互优先检查长任务、强制同步布局、过大绘制面积和 GPU 像素数；`transform`／`opacity` 也不是任何规模下都免费。

基线完成条件：真实页面的关键操作可用、无布局跳动、窄屏无控件重叠、焦点未被遮住。新增表现点还要回答：它帮助用户看到了什么？去掉它是否损失理解或必要的品牌表达？
