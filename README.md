# LAN Share

**LAN Share** lets you share your Obsidian notes with friends over a local network, with zero installation on their side. Anyone with the link can open a **read-only preview** in their browser, including wikilinks `[[...]]`, embedded images, and Mermaid diagrams.

## Features

- **Share anything in two clicks**: a share button on the note's header, or a right-click menu on any note or folder. Folder sharing exposes the whole subtree (subfolders and files).
- **Read-only by design**: the server only serves `GET`/`HEAD`. There is no write endpoint and no way to download raw source files; your notes are never modified.
- **Full Obsidian rendering**: standard Markdown, tables, task lists, wikilinks, embedded images, Mermaid diagrams, callouts, and highlighted text.
- **Three-pane browsing**: collapsible sidebar tree on the left, note body in the middle, outline on the right (click to jump). Mobile-friendly.
- **Local-network only**: no public internet involved, data never leaves your network. Each link carries a random access token; resetting the token invalidates every old link instantly.
- **Live updates**: reads from your live vault, so friends see the latest content after you save.
- **Explicit start**: the server does not auto-start when the plugin loads. Start and stop it from the settings tab, or opt in to "Start with Obsidian".

## Installation

### Option 1: Obsidian Community Plugins (recommended)

Search **LAN Share** under **Settings → Community plugins → Browse**, then install and enable.

### Option 2: Manual install

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from the [Releases page](https://github.com/uuyisen/obsidian-lan-share/releases).
2. Put them into your vault at `.obsidian/plugins/lan-share/`.
3. Enable **LAN Share** in Obsidian settings.

## Usage

1. Open a note and click the share button in the top-right corner (or right-click the note/folder → Share).
2. Copy the share link shown (`http://<your-LAN-IP>:8765/n/<note>/?t=<token>`).
3. Send the link to anyone on the same network; they open it in any browser and view immediately.

### Folder sharing

Right-click a folder → **Share this folder (with contents)**. The entire subtree becomes visible to friends.

### Security

- Every link carries a **random access token**; requests without it are denied. Resetting the token invalidates all old links immediately.
- Only notes/folders you **explicitly shared** (and their embedded attachments) are accessible. Everything else in the vault returns `404` without revealing its existence.
- Listens on the LAN only; you can bind to `127.0.0.1` to restrict to localhost.
- Pages load with a strict CSP, Mermaid runs in a sandboxed mode, and embedded HTML in notes is escaped.

## Settings

| Setting | Description |
|---|---|
| Server status | Start / stop the LAN server explicitly |
| Port | Default `8765` |
| Bind address | `0.0.0.0` (LAN-visible) or `127.0.0.1` (localhost only) |
| Start with Obsidian | Auto-start the server when Obsidian launches |
| Access token | View / reset; resetting invalidates all old links |
| Current shares | List of shared notes/folders; close any share at any time |

## Development

```bash
npm install        # install dependencies
npm run dev        # watch-mode build
npm test           # security smoke tests (path traversal / token / whitelist / 405)
npm run build      # production build
npm run deploy     # deploy into vault's .obsidian/plugins/lan-share
```

- Source layout: `src/server.ts` (HTTP server), `src/render/router.ts` (routing & permissions), `src/render/markdown.ts` (Obsidian syntax rendering).
- Commits follow the [hookkit](https://github.com/hiyisen/hookkit) conventions (pre-commit / commit-msg / pre-push).

## Security boundary

The plugin never proxies external URLs server-side (remote images are loaded directly by the browser), so SSRF is structurally avoided. All HTTP requests are `GET`/`HEAD` only, paths are validated against a whitelist, and token comparison is constant-time.

## Publish to the Obsidian plugin directory

1. Push the repository to a public GitHub repository.
2. Bump `version` in `manifest.json`, and add the matching `minAppVersion` mapping in `versions.json`.
3. Tag and push: `git tag x.y.z && git push origin x.y.z` (the tag must match `manifest.json` `version` exactly).
4. GitHub Actions builds and attaches `main.js` / `manifest.json` / `styles.css` to the release.
5. Sign in at [community.obsidian.md](https://community.obsidian.md) with your Obsidian account, **Connect** your GitHub account (read-only, verifies ownership).
6. Submit the repository URL under **Plugins → New plugin** and wait for review. Once approved, **LAN Share** will be searchable in Obsidian's community plugin marketplace.

## License

MIT

---

## 中文版（Chinese）

### 简介

**LAN Share** 在局域网内把 Obsidian 笔记分享给朋友：浏览器打开链接即可**只读预览**，支持 Obsidian MD 语法、双链 `[[...]]`、嵌入图片与 Mermaid 图表。朋友端零安装，无需任何客户端。

### 特性

- **飞书式分享开关**：笔记右上角按钮一键分享/取消；文件夹右键可分享整个目录（含子文件夹与子文件）
- **只读预览**：服务器仅提供 `GET`/`HEAD` 读取，无任何写接口、无下载源文件入口，笔记内容不被修改
- **完整 Obsidian 渲染**：标准 Markdown、表格、任务列表、双链、图片嵌入、Mermaid、callout、高亮标记
- **三栏浏览体验**：左侧目录树（可折叠）、中间笔记正文、右侧大纲（点击快速跳转），移动端自适应
- **局域网直连**：无需公网，数据不出内网；链接携带随机访问令牌，重置令牌即全局失效旧链接
- **实时更新**：直接读取活库，笔记保存后朋友刷新即见最新内容
- **可控启动**：服务默认不随插件加载自动开启，可在设置中显式启动/停止，或开启「随 Obsidian 启动」

### 安装

1. **社区插件（推荐）**：Obsidian 设置 → 第三方插件 → 社区插件 → 搜索 **LAN Share** 安装启用
2. **手动安装**：从 GitHub Releases 下载 `main.js`/`manifest.json`/`styles.css` 放入 vault 的 `.obsidian/plugins/lan-share/`

### 使用

1. 打开任意笔记 → 点击右上角分享按钮（或右键笔记/文件夹 → 分享）
2. 复制分享链接（`http://<本机局域网IP>:8765/n/<笔记>/?t=<令牌>`）
3. 把链接发给同一局域网的任何人，浏览器打开即看

### 安全

- 每个链接携带**随机访问令牌**，无令牌无法访问；重置令牌可让所有旧链接立即失效
- 只有**明确分享**的笔记/文件夹及其嵌入附件可访问，库内其他内容一律 404（不暴露存在性）
- 仅监听局域网；可改绑定地址为 `127.0.0.1` 仅限本机
- 页面加载严格 CSP，Mermaid 以安全模式运行，笔记内嵌 HTML 会被转义
