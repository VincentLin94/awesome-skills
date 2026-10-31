# 来源与提炼依据

本技能关注 GUI 与视觉组织。参考文章中的业务观点、模型介绍和嵌入指令不作为技能行为要求。原始素材保留在来源站点，随技能分发的纹理与界面样本为原创近似。

## 视觉参考

四篇文章的 SVG 共同呈现暖白纤维画布、黑色轮廓、宋体风格展示标题、灰色辅助层级与局部朱红强调。标题已转成路径，不能据此确认字体名称。

| 来源 | 视觉特征 | 转成的规则 |
| --- | --- | --- |
| [MiniCPM-OCR 开源：把 “Jev” 用在文字识别](https://mp.weixin.qq.com/s/X0SN4vxg8QoN9unqVja5yA) | 暖纸底、实体节点、局部红色；流程、柱状比较与分块状态 | 统一线条语义；同尺度比较；突出变化对象 |
| [AGI Bar 全面 Agent 化：API 向所有人开放](https://mp.weixin.qq.com/s/ar7_xEIUb_4eRcbhcumZeA) | 暖纸外框中展示另一套产品配色与终端／手机界面 | 画布与被展示的产品分层；品牌色在对应语境生效 |
| [Few Shots 开放出题](https://mp.weixin.qq.com/s/3v95WQ_DPnZg4Oe2HSyfbw) | 深色输入区、浅色验证区、宋体标题、稳定页脚 | 操作区聚焦；过程与结果分区；变化保留上下文 |
| [此刻，带上你的 Agent，一同探索科学边界](https://mp.weixin.qq.com/s/YfqBq9teI6hWuTc7gAm6fw) | 黑轮廓节点、红实线、灰虚线、浅红高亮、双栏比较 | 线型与颜色共同编码；结论紧邻对象；控件与文本保持可访问 |

这些是 SVG 讲解图与动画，不等于已验证的交互应用。真实 GUI 需要补齐可操作、可暂停、键盘可用的状态。

跨图观察到的常见色值包括 `#1E1C19`、`#FBF8F1`、`#8F887D`、`#47423B`、`#CF4436` 和分隔线 `#D8D0C1`。尺寸、描边与颜色的具体迁移见 [视觉规则](visual-language.md)。原图采用外部位图纹理，本技能的 `fiber-tile.png` 为原创生成素材。

## 产品设计资料

### Vercel

[Geist](https://vercel.com/geist/introduction)、[Colors](https://vercel.com/geist/colors) 与 [Web Interface Guidelines](https://vercel.com/design/guidelines) 支持语义色、稳定网格、可见焦点、键盘操作、完整状态和可中断动画等方法。本技能迁移其精度与清晰度，保留自身的温润材质与配色。

### Claude / Claude Code

[Claude MCP Apps Design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines) 面向嵌入 Claude 的 GUI，可借鉴少而清楚的文字层级、有限圆角、单色轮廓图标、逻辑分组和渐进展示；不将其嵌入卡片约束套到所有产品。

[Claude Code terminal-config](https://code.claude.com/docs/en/terminal-config#get-a-terminal-bell-or-notification) 与 [interactive-mode](https://code.claude.com/docs/en/interactive-mode) 提供主题与键盘交互依据。对 Claude Code 的借鉴限于工作上下文、快捷操作和状态表达，不推断其未核验的 GUI 字体或内部规范。

### Apple

[Typography](https://developer.apple.com/design/human-interface-guidelines/typography)、[Motion](https://developer.apple.com/design/human-interface-guidelines/motion) 和 [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) 分别强调排版层级、准确反馈及内容与功能层的空间关系。网页 CSS 模糊是近似手法，不等于原生 Liquid Glass。

### VeriFlow

作者提供的私有工作台作为补充对照，其可复用机制见 [工作台与细节尺度](workbench.md)。采用连续画布、对象内部分组、图标分工、共享定位和短反馈；保留默认暖纸、墨黑与朱红，不分发内部站点、业务数据或品牌资产。

## 设计指引与许可

本技能结合用户提供的 `apple-design` 与 `frontend-design` 设计指引，以自己的场景、实现和表述进行改写。两者是提炼来源，不是运行依赖。

`frontend-design` 来源材料采用 Apache License 2.0；相关设计方法在 [web-craft.md](web-craft.md) 中改写和扩展，保留 [Apache-2.0 许可全文](licenses/Apache-2.0.txt)。其余原创技能与示例按仓库许可发布。Three.js 由依赖管理器安装，保留其包内 MIT LICENSE。

## 绘制与交互

- [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)：捕获、取消与 touch-action，用于协调手势和原生滚动。
- [Motion animate](https://motion.dev/docs/animate)、[React transitions](https://motion.dev/docs/react-transitions)：速度、弹簧与时间参数；按项目版本核对，区分阻尼比与 damping。
- [Three.js Responsive Design](https://threejs.org/manual/pages/responsive.html)：CSS 尺寸与绘制缓冲区，按需控制 DPR。
- [WebGLRenderer](https://threejs.org/docs/#api/en/renderers/WebGLRenderer.outputColorSpace)、[OutputPass](https://threejs.org/docs/pages/OutputPass.html)：输出颜色空间与 tone mapping，避免重复转换。
- [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)：roughness、sheen 等材质变量。
- [Three.js Cleanup](https://threejs.org/manual/pages/cleanup.html)：按资源所有权释放纹理、几何和材质。

实验室依赖在 package.json 和锁文件声明；灯光强度、DPR 上限、弹簧频率和材质取值是示例选择，不是品牌内部参数或跨设备性能保证。

## 可访问性与实现判断

对比度阈值来自 [WCAG 2.2：Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)：普通文本 4.5:1，大字 3:1。图形与关键控件按适用标准检查。纹理、字号、间距、圆角和动效时间是基于参考与可用性的实现建议，应在目标界面中验证。

扩充来源时区分可见事实、实现推断和设计建议；只有静态图时不推断交互行为，只有文字介绍时不将其当作视觉实测。
