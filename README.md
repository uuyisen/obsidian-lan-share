# LAN Share

**LAN Share** makes your Obsidian notes readable by friends over a local network, with zero installation on their side. Anyone with the link can open a read-only preview in their browser, including wikilinks `[[...]]`, embedded images, and Mermaid diagrams.

---

在局域网内把 Obsidian 笔记分享给朋友：浏览器打开链接即可**只读预览**，支持 Obsidian MD 语法、双链 `[[...]]`、嵌入图片与 mermaid 图表。朋友端零安装，无需任何客户端。

## 特性

- **飞书式分享开关**：笔记右上角按钮一键分享/取消；文件夹右键可分享整个目录（含子文件夹与子文件）
- **只读预览**：服务器仅提供 GET/HEAD 读取，无任何写接口、无下载源文件入口，笔记内容不被修改
- **完整 Obsidian 渲染**：标准 MD、表格、任务列表、双链、图片嵌入、mermaid、callout、高亮标记
- **三栏浏览体验**：左侧目录树（可折叠）、中间笔记正文、右侧大纲（点击快速跳转），移动端自适应
- **局域网直连**：无需公网，数据不出内网；链接携带随机访问令牌，重置令牌即全局失效旧链接
- **实时更新**：直接读取活库，笔记保存后朋友刷新即见最新内容
- **可控启动**：服务默认不随插件加载自动开启，可在设置中显式启动/停止，或开启「随 Obsidian 启动」

## 安装

### 方法一：Obsidian 社区插件（推荐）

在 Obsidian 设置的「第三方插件 → 社区插件」中搜索 **LAN Share** 并安装启用。

### 方法二：手动安装

1. 下载最新版本的 `main.js`、`manifest.json`、`styles.css`（Release 附件）
2. 放入 vault 的 `.obsidian/plugins/lan-share/` 目录
3. 在 Obsidian 设置中启用「LAN Share」

## 使用

1. 打开任意笔记，点击右上角分享按钮（或右键笔记/文件夹 → 分享）
2. 在弹出的提示中复制分享链接（`http://<本机局域网IP>:8765/n/<笔记>/?t=<令牌>`）
3. 把链接发给同一局域网的任何人，浏览器打开即看

### 文件夹分享

右键文件夹 → 「分享此文件夹（含子内容）」，整个目录树（含子文件夹、子文件）对朋友可见。

### 安全

- 每个链接携带**随机访问令牌**，无令牌无法访问；重置令牌可让所有旧链接立即失效
- 只有**明确分享**的笔记/文件夹及其嵌入附件可访问，库内其他内容一律 404（不暴露存在性）
- 仅监听局域网；可改绑定地址为 `127.0.0.1` 仅限本机
- 页面加载严格 CSP，mermaid 以安全模式运行，笔记内嵌 HTML 会被转义

## 设置项

| 设置 | 说明 |
|---|---|
| 服务状态 | 显式启动/停止局域网服务 |
| 端口 | 默认 8765 |
| 绑定地址 | `0.0.0.0`（局域网可见）或 `127.0.0.1`（仅本机） |
| 随 Obsidian 启动 | 开启后打开 Obsidian 自动启动服务 |
| 访问令牌 | 查看/重置；重置后旧链接全部失效 |
| 当前分享 | 已分享笔记/文件夹列表，可随时关闭 |

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 监听模式构建
npm test           # 运行安全冒烟测试（路径穿越/令牌/白名单/405 等）
npm run build      # 生产构建
npm run deploy     # 部署到 vault 的 .obsidian/plugins/lan-share
```

- 源码结构：`src/server.ts`（HTTP 服务器）、`src/render/router.ts`（路由与权限）、`src/render/markdown.ts`（Obsidian 语法渲染）
- 项目使用 [hookkit](https://github.com/hiyisen/hookkit) 提交规范（pre-commit / commit-msg / pre-push）

## 安全边界

本插件在服务端**不做任何对外 URL 请求代理**（远程图片由浏览器直连加载），天然规避 SSRF。所有 HTTP 请求仅 GET/HEAD，路径经白名单规范校验，令牌常量时间比较。

## 发布到 Obsidian 插件中心

1. 把本仓库推到公开 GitHub 仓库（须为 public）
2. 修改 `manifest.json` 提升版本号，`versions.json` 增加对应 `minAppVersion` 映射
3. 打 tag 并推送：`git tag 0.1.0 && git push origin 0.1.0`（tag 必须与 `manifest.json` 的 `version` 完全一致）
4. GitHub Actions 自动构建并把 `main.js / manifest.json / styles.css` 附带为 release 附件
5. 登录 [community.obsidian.md](https://community.obsidian.md)（Obsidian 账号），在设置中 **Connect** GitHub 账号（只读验证仓库所有权）
6. 在 **Plugins → New plugin** 提交仓库 URL，等待官方审核；审核通过后即可在 Obsidian 社区插件市场搜索到「LAN Share」

> 准备已就绪：`.github/workflows/release.yml` 自动发布、`manifest.json`/`versions.json` 已符合官方约束、README/LICENSE 齐全。

## License

MIT
