# Three.js 材质与场景

三维用于确实需要体积、视角、遮挡、空间操作或光照变化的内容。普通表单与装饰性圆角不需要 Three.js。布局、标签、控件和可访问性留在 DOM，三维只承担对象呈现与必要的直接操作。

## 启动与依赖

先读取项目 package.json 和锁文件，复用当前 Three.js 或 React Three Fiber；不要为了一个样片给已有 React 项目另起第二套应用。纯 HTML 可以用 ESM，正式项目用现有构建工具。通过依赖声明和锁文件提供可复现安装，安装后从本地加载，避免隐式 CDN 请求。

本技能的 [实验室](../assets/web-lab/index.html) 通过 [package.json](../assets/web-lab/package.json) 与锁文件声明 Three.js 依赖。先在 `assets/web-lab` 运行 `npm ci --ignore-scripts`，再运行 `npm run dev`，访问本机服务的 `/web-lab/`。安装后的依赖和 MIT LICENSE 留在 node_modules，不提交依赖副本。ESM 不保证双击 file: URL 可用。

默认服务绑定 `127.0.0.1:8766`；端口占用时，在技能根目录使用 `python3 -m http.server <空闲端口> --bind 127.0.0.1 --directory assets`。已有项目使用其开发服务器。

核心可复用实现为 [material-scene.mjs](../assets/web-lab/material-scene.mjs)，由调用方传入 canvas、容器、状态回调与本地纹理 URL。它负责大小、材质、指针操作、按需渲染和清理；[lab.mjs](../assets/web-lab/lab.mjs) 仅连接样本控件。

## 从轮廓到材质

先用简单几何体和漫反射灰材质确定轮廓、相机与接触面。对象能被理解后再加微纹理、高光、反射或薄膜；不要用高强度 bloom 掩盖轮廓问题。

| 目标材质 | 可调方向 | 视觉检查 |
| --- | --- | --- |
| 毛毡／织物 | 高 roughness、非金属、微弱 bump；需要时少量 sheen | 阴影柔和，纤维细于物体轮廓，没有塑料亮斑 |
| 纸／陶瓷 | 非金属；纸粗糙、陶瓷粗糙度中等；弱微表面变化 | 棱边与接触阴影可见，白色不被曝光压平 |
| 金属 | metalness 接近 1、适度 roughness、可读的环境反射 | 没有环境时不会只得到一块黑物体 |
| 玻璃 | thickness/IOR/transmission 与环境和背景共同设计 | 有可辨轮廓、真实前后关系；性能和可读性值得成本 |

这些是方向而非一套可套所有模型的参数。实验室采用单个原创柔边样片、高 roughness 与细 bump 展现暖纸／毛毡近似，不宣称模拟真实纤维毛发。

### 照明与颜色

柔和主光建立形体，较弱补光保留暗部；对象靠接触阴影与背景分离。金属／玻璃需要环境内容，使用可授权的环境图或程序生成环境；静态生成结果缓存，组件卸载后按所有权释放。不要给每个点光源都开启阴影。

颜色纹理通常标注 `SRGBColorSpace`，normal/roughness/bump 等数据纹理保持无颜色变换。渲染在工作颜色空间完成，输出映射到显示颜色空间。不要把 CSS 的 HEX 经过手工 gamma 后再交给 Three.Color。使用后处理时检查最终 OutputPass，避免重复 tone mapping 或漏掉颜色空间转换。

PBR 场景按实际曝光选 tone mapping；简单对齐 UI 色卡的非物理图形可能需要不同选择。tone mapping 会改变最终色卡外观，不能用原始 HEX 宣称物体每个像素等于 DOM 配色。

## 相机、几何与控制

产品样片可用正交相机保持尺度；有明确透视关系的空间用 PerspectiveCamera。裁剪面贴合场景范围。容器变化后更新 aspect 或正交边界，再更新投影矩阵；按对象包围盒或既定安全边界保持完整构图。

几何分段由轮廓误差决定，不默认高模。重复对象优先共享 geometry/material，数量很大再考虑 InstancedMesh。透明度、阴影、物理玻璃、后处理是独立成本，按实际需要逐项开启。

指针命中用 canvas 的实际 CSS 矩形映射到 NDC：`x=(clientX-left)/width*2-1`，`y=1-(clientY-top)/height*2`。复杂模型使用 Raycaster 命中指定可选对象；简单单物体查看器可将局部拖动直接映射到受约束旋转。保持抓取连续、移动端纵向滚动可用，并提供“左转／右转／复位”等 DOM 替代。

物体自动旋转只是可选演示模式，不是默认活动背景。相机交互避免快速大范围转动和无边界滚动劫持。减少动效时关闭自动旋转与惯性，保留按键或指针直接控制。

## 按需渲染与清理

设置 `renderer.setSize(width,height,false)`，CSS 决定布局。buffer 尺寸与 DPR 分开控制，DPR 上限例如 1.5–2 是初始预算，依据目标设备测量调整。ResizeObserver 处理容器变化；零尺寸容器暂不渲染。

一次状态变化只请求一个 rAF。只有拖动、自动播放或未收敛动画继续排下一帧；静止后停止。IntersectionObserver 与 visibilitychange 让离屏／后台暂停；重新进入时按需补一帧。使用 R3F 时可选 `frameloop="demand"` 与 invalidate，注意 controls 阻尼仍需安排后续帧。

卸载时依次取消帧和事件、断开 observer、停止 controls、dispose 本组件拥有的 geometry/material/texture/renderTarget，最后 dispose renderer。共享资源由共享拥有者管理；遍历场景不代表可以无条件销毁其他组件的资源。React Strict Mode 下重复挂载应能正常工作。

用 try/catch 处理渲染器初始化失败；纹理失败仍有基础材质。WebGL context lost 时显示 CSS/SVG 静态替代，并停止循环；恢复后重建或提供重试。加载失败时仍保留名称、说明和操作，不能留下空白画布。

## 完成证据

至少查看实际渲染的桌面／窄屏轮廓，操作粗糙度或材质并看变化，验证复位、减少动效、静态替代。检查控制台、静止帧停止与卸载行为；性能数字需要实测，不从 draw call 数或“GPU 加速”措辞推断。

当前技术依据见 [来源记录](sources.md#绘制与交互)。若目标项目的 API 与示例不同，以项目版本和官方文档为准。
