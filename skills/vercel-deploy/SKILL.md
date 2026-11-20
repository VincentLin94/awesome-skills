---
name: vercel-deploy
description: 把静态 HTML 页面 / 单页应用 / 前端产物部署到 Vercel 线上,返回可公开分发分享的 URL。当用户要求"部署到线上 / 上线 / 发布 / 给我一个可分享的公网链接 / deploy 到 Vercel / 把这个 HTML 放到网上 / 分发这个页面"时使用。凭证由运行环境的 VERCEL_TOKEN 提供。适用于纯静态项目(HTML/CSS/JS、单文件页面、海报页、全景导览、报告页等);不适用于需要服务端运行时或自定义 build 的复杂应用(那类先构建再部署产物目录)。
---

# vercel-deploy

把静态 HTML / 单页应用部署到 Vercel,产出可分发的公网 URL。**先在运行环境配置 `VERCEL_TOKEN`；脚本不内置凭证，缺少时明确退出。**

## 何时使用

用户表达以下任一意图即触发:
- "部署到线上 / 上线 / 发布 / publish / deploy"
- "给我一个可分享的公网链接 / 分发这个页面"
- "把这个 HTML / 页面 / 应用放到网上"
- "部署到 Vercel"

## 快速开始

部署一个目录(推荐:目录内含 `index.html`):

```bash
bash "{skill_path}/scripts/deploy.sh" <目标目录>
```

部署单个 HTML 文件(脚本会自动放进一个临时目录并命名为 index.html):

```bash
bash "{skill_path}/scripts/deploy.sh" <某文件.html>
```

脚本执行完会打印生产环境 URL(形如 `https://<name>.vercel.app`)。把该 URL 返回给用户即可分发。

## 工作流

1. **确认产物**:定位要部署的静态目录或 HTML 文件。若是零散 HTML,先归拢到一个目录,确保入口文件名为 `index.html`。
2. **执行部署**:调用 `scripts/deploy.sh`,它会读取 `VERCEL_TOKEN` 跑 `vercel deploy --prod --yes`。
3. **验证**:部署后用 `curl -sI <url>` 确认返回 200,并抽查关键静态资源(图片/JS)可访问。
4. **交付**:把最终 `https://xxx.vercel.app` URL 返回给用户,说明可直接分享。

## 重要约束

- **纯静态优先**:HTML/CSS/JS、单页应用、海报页、全景导览、报告页等无需服务端的项目直接部署。
- **需要 build 的项目**:先在本地完成构建(如 `npm run build`),再把产物目录(`dist`/`build`/`out`)作为部署目标传给脚本。
- **首次在新环境**:若 `vercel` 命令不存在,脚本会自动 `npm install -g vercel@latest`(装到 `$HOME/.npm-global`)。
- **Token 配置**:由运行环境提供 `VERCEL_TOKEN`，不写入脚本、部署产物或仓库；避免在日志和回复中回显。
- **别名(可选)**:如需固定域名,可在 deploy 后用 `vercel alias set <deployment-url> <name>.vercel.app --token=...`;脚本默认已用项目名生成稳定别名。

## 参考

- `scripts/deploy.sh` — 部署主脚本(环境变量凭证 + 自动装 CLI + 生产部署)
