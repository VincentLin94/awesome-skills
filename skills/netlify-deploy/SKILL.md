---
name: netlify-deploy
description: 把静态 HTML 页面 / 单页应用 / 前端产物部署到 Netlify 线上,返回国内可直连、可公开分发的 URL(形如 https://<name>.netlify.app)。当用户要求"部署到线上 / 上线 / 发布 / 给我一个可分享的公网链接 / deploy 到 Netlify / 把这个 HTML 放到网上 / 国内能打开的链接 / Vercel 国内打不开换一个"时使用。凭证由运行环境的 NETLIFY_AUTH_TOKEN 提供。适用于纯静态项目(HTML/CSS/JS、单文件页面、海报页、全景导览、报告页等);需要 build 的项目先本地构建再部署产物目录。相比 Vercel,Netlify 的 *.netlify.app 域名在国内网络下通常可直接访问,是国内可达性更好的免费静态托管首选。
---

# netlify-deploy

把静态 HTML / 单页应用部署到 Netlify,产出**国内可直连**的公网 URL。**先在运行环境配置 `NETLIFY_AUTH_TOKEN`；脚本不内置凭证，缺少时明确退出。**

## 为什么用 Netlify

Vercel 的 `*.vercel.app` 在国内网络常被阻断;Netlify 的 `*.netlify.app` 走的边缘节点在国内通常可直接访问,且免费额度大方(单站点无严格体积限制,远宽于 surge),是"国内可访问 + 免费 + 体验对标 Vercel"的务实首选。

## 何时使用

用户表达以下任一意图即触发:
- "部署到线上 / 上线 / 发布 / publish / deploy"
- "给我一个可分享的公网链接 / 分发这个页面"
- "把这个 HTML / 页面 / 应用放到网上"
- "国内能打开的链接 / 换个国内能访问的 / Vercel 国内打不开"
- "部署到 Netlify"

## 快速开始

部署一个目录(推荐:目录内含 `index.html`):

```bash
bash "{skill_path}/scripts/deploy.sh" <目标目录> [站点名]
```

部署单个 HTML 文件(脚本会自动放进临时目录并命名为 index.html):

```bash
bash "{skill_path}/scripts/deploy.sh" <某文件.html> [站点名]
```

脚本执行完会打印 `DEPLOY_OK https://<name>.netlify.app`。把该 URL 返回给用户即可分发。

## 工作流

1. **确认产物**:定位要部署的静态目录或 HTML 文件。若是零散 HTML,先归拢到一个目录,确保入口文件名为 `index.html`。
2. **执行部署**:调用 `scripts/deploy.sh`。它读取 `NETLIFY_AUTH_TOKEN` 自动完成:装 CLI(如缺)→ 校验 Token → 复用或创建同名站点 → `netlify deploy --prod` → 部署后健康校验。
3. **交付**:把最终 `https://xxx.netlify.app` URL 返回给用户,说明国内可直接访问、可分享。
4. **可选复验国内可达性**:见 `references/verify-china-access.md`(用国内 DNS/多节点探测确认)。

## 高可用设计(脚本已内置)

- **幂等复用**:同名站点已存在则复用其 `site_id` 覆盖发布,不会重复建站;名称被占用时自动回退随机名创建。
- **自愈重试**:CLI 安装失败重试;`netlify deploy` 首次未确认成功时自动重试一次。
- **Token 自检**:部署前查询 Netlify user API 校验 Token，失效会明确报错提示更新运行环境配置。
- **健康校验**:部署后 `curl` 首页,确认返回 200/304 才标记成功;非 200 会附带提示(可能 CDN 传播中)。

## 重要约束

- **纯静态优先**:HTML/CSS/JS、单页应用、海报页、全景导览、报告页等无需服务端的项目直接部署。
- **需要 build 的项目**:先本地完成构建(如 `npm run build`),再把产物目录(`dist`/`build`/`out`)作为部署目标。
- **站点名规则**:Netlify 子域仅允许小写字母/数字/连字符;脚本会自动把目录名清洗成合法 slug。
- **Token 配置**:由运行环境提供 `NETLIFY_AUTH_TOKEN`，不写入脚本、部署产物或仓库；校验失败时更新环境变量，避免在日志和回复中回显。

## 参考

- `scripts/deploy.sh` — 部署主脚本(环境变量凭证 + 自动装 CLI + 幂等建站 + 重试 + 健康校验)
- `references/verify-china-access.md` — 如何验证站点在国内网络可访问
