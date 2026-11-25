import { escapeHtml } from "./markdown.ts";
import type { Heading, SidebarNode } from "../types.ts";

/** 单页 CSP：仅允许本站自带脚本；图片允许 self/data: 与常见远程图床（不含 script） */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/* ---------------- 内联 SVG 图标（不依赖外部资源，符合 CSP） ---------------- */
const ICON_FOLDER =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
const ICON_NOTE =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
const ICON_CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const ICON_SIDEBAR =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>';
const ICON_OUTLINE =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>';
const ICON_HOME =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>';

function pageShell(opts: {
  title: string;
  body: string;
  token: string;
  sidebarHtml: string;
  outlineHtml: string;
  /** 是否为首页自身：首页不显示"主页"入口，避免自我链接 */
  isHome?: boolean;
}): string {
  const { title, body, token, sidebarHtml, outlineHtml, isHome } = opts;
  const hasOutline = outlineHtml.length > 0;
  const homeLink = isHome
    ? ""
    : `<a class="home-link" href="/?t=${encodeURIComponent(token)}" title="返回主页" aria-label="返回主页">
        ${ICON_HOME}<span>主页</span>
      </a>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.7; color: #1a1a1a; background: #fff;
}
@media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #1e1e1e; } }
a { color: #2f6feb; text-decoration: none; }
a:hover { text-decoration: underline; }

/* ------------------------------------------------------------ 三栏布局（可折叠） */
.layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
.layout.has-outline { grid-template-columns: 280px minmax(0, 1fr) 240px; }
.sidebar {
  border-right: 1px solid rgba(128,128,128,.25);
  padding: 12px 12px 40px;
  overflow-y: auto; max-height: 100vh; position: sticky; top: 0;
  font-size: 14px; min-width: 0;
}
.content { padding: 16px 28px 96px; min-width: 0; }
.outline {
  border-left: 1px solid rgba(128,128,128,.25);
  padding: 12px 12px 40px;
  overflow-y: auto; max-height: 100vh; position: sticky; top: 0;
  font-size: 13px; min-width: 0;
}
/* 折叠状态：body class 控制列宽 */
body.sidebar-collapsed .layout { grid-template-columns: 0 minmax(0, 1fr); }
body.sidebar-collapsed .layout.has-outline { grid-template-columns: 0 minmax(0, 1fr) 240px; }
body.outline-collapsed .layout.has-outline { grid-template-columns: minmax(0, 1fr) 0; }
body.sidebar-collapsed.outline-collapsed .layout.has-outline { grid-template-columns: 0 minmax(0, 1fr) 0; }
.sidebar, .outline { overflow: hidden; }
@media (max-width: 1000px) { .layout.has-outline { grid-template-columns: 260px minmax(0, 1fr); } .outline { display: none; } }
@media (max-width: 700px) { .layout, .layout.has-outline { grid-template-columns: 1fr; } .sidebar { display: none; } }

/* ------------------------------------------------------------ 顶部工具条（折叠开关） */
.toolbar {
  display: flex; gap: 4px; margin-bottom: 12px;
  border-bottom: 1px solid rgba(128,128,128,.15); padding-bottom: 8px;
}
.toolbar button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 6px;
  background: transparent; color: #888; cursor: pointer;
}
.toolbar button:hover { background: rgba(128,128,128,.12); color: inherit; }
.toolbar .home-link {
  display: inline-flex; align-items: center; gap: 5px;
  height: 30px; padding: 0 10px; border-radius: 6px;
  font-size: 13px; color: #888; text-decoration: none;
}
.toolbar .home-link:hover { background: rgba(128,128,128,.12); color: inherit; text-decoration: none; }
.toolbar .spacer { flex: 1; }
.track { font-size: 12px; color: #999; align-self: center; }

/* ------------------------------------------------------------ 侧栏目录树 */
.pane-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: .05em;
  margin: 4px 0 10px; padding: 0 8px;
}
.tree { list-style: none; margin: 0; padding: 0; }
.tree ul.tree-children { list-style: none; margin: 0; padding-left: 13px; }
.tree li { margin: 1px 0; }
.tree a {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px; border-radius: 5px; color: inherit; min-width: 0;
}
.tree a:hover { background: rgba(128,128,128,.12); text-decoration: none; }
.tree a.active { background: rgba(47,111,235,.15); color: #2f6feb; }
.tree a .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.folder-row { display: flex; align-items: center; min-width: 0; }
.folder-row .fold-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; flex: none; border: none; border-radius: 4px;
  background: transparent; color: #999; cursor: pointer; padding: 0;
}
.folder-row .fold-btn:hover { background: rgba(128,128,128,.15); }
.folder-row .fold-btn svg { transition: transform .15s; }
.folder-row .fold-btn.folded svg { transform: rotate(-90deg); }
.folder-row > a { flex: 1; }
.empty-tip { color: #999; padding: 2px 8px; font-size: 13px; }

/* ------------------------------------------------------------ 内容区 */
.breadcrumb { font-size: 12px; color: #888; margin: 0 0 8px; }
h1 { display: flex; align-items: center; gap: 8px; font-size: 1.55em; margin: .2em 0 .5em; }
h2 { border-bottom: 1px solid rgba(128,128,128,.2); padding-bottom: .25em; scroll-margin-top: 12px; }
h3, h4, h5, h6 { scroll-margin-top: 12px; }
.markdown-body img { max-width: 100%; height: auto; }
pre { overflow-x: auto; background: rgba(128,128,128,.08); padding: 10px 14px; border-radius: 6px; }
code { background: rgba(128,128,128,.12); padding: 2px 5px; border-radius: 4px; font-size: .92em; }
pre code { background: none; padding: 0; }
pre.mermaid { background: transparent; text-align: center; }
blockquote { margin: 12px 0; padding: 2px 14px; border-left: 3px solid #2f6feb; color: #555; background: rgba(47,111,235,.05); }
.markdown-body ul.task-list { list-style: none; padding-left: 1.4em; }
.markdown-body input[type="checkbox"] { pointer-events: none; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; }
th, td { border: 1px solid rgba(128,128,128,.3); padding: 6px 10px; text-align: left; }
.home-item a { display: block; padding: 10px 12px; border: 1px solid rgba(128,128,128,.25); border-radius: 8px; margin-bottom: 8px; }
.home-item .sub { font-size: 12px; color: #999; margin-top: 2px; }
.footer { margin-top: 40px; font-size: 12px; color: #999; text-align: center; }

/* ------------------------------------------------------------ 大纲 */
.outline ul { list-style: none; margin: 0; padding: 0; }
.outline li { margin: 2px 0; }
.outline a { display: block; padding: 2px 8px; border-radius: 4px; color: inherit; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline a:hover { background: rgba(128,128,128,.12); text-decoration: none; }
.outline .d2 { padding-left: 16px; } .outline .d3 { padding-left: 28px; } .outline .d4 { padding-left: 40px; }
</style>
</head>
<body>
<div class="layout${hasOutline ? " has-outline" : ""}">
  <aside class="sidebar">
    <div class="pane-title">${ICON_FOLDER}<span>目录</span></div>
    ${sidebarHtml || '<div class="empty-tip">暂无可浏览内容</div>'}
  </aside>

  <main class="content">
    <div class="toolbar">
      ${homeLink}
      <button type="button" data-toggle="sidebar" title="折叠/展开目录" aria-label="折叠/展开目录">${ICON_SIDEBAR}</button>
      ${hasOutline ? `<button type="button" data-toggle="outline" title="折叠/展开大纲" aria-label="折叠/展开大纲">${ICON_OUTLINE}</button>` : ""}
      <span class="spacer"></span>
      <span class="track">只读预览</span>
    </div>
    ${body}
    <div class="footer">
      <div>由局域网分享插件提供 · 只读预览 · 链接含访问令牌，请勿外传</div>
    </div>
  </main>

  ${hasOutline ? `<aside class="outline"><div class="pane-title">${ICON_OUTLINE}<span>大纲</span></div>${outlineHtml}</aside>` : ""}
</div>
<script src="/vendor/mermaid.min.js?t=${token}"></script>
<script src="/vendor/mermaid-init.js?t=${token}"></script>
<script src="/vendor/site.js?t=${token}"></script>
</body>
</html>`;
}

/** 递归渲染左侧目录树（文件夹可折叠） */
export function renderSidebar(nodes: SidebarNode[], token: string, activePath: string): string {
  const url = (p: string) => "/n/" + encodeURIComponent(p) + "?t=" + encodeURIComponent(token);
  const li = (n: SidebarNode): string => {
    if (n.kind === "note") {
      const cls = n.path === activePath ? "active" : "";
      return `<li><a class="${cls}" href="${escapeHtml(url(n.path))}">${ICON_NOTE}<span class="label">${escapeHtml(n.name)}</span></a></li>`;
    }
    const children = (n.children ?? []).map((c) => li(c)).join("");
    const cls = n.path === activePath ? "active" : "";
    return `<li>
      <div class="folder-row">
        <button type="button" class="fold-btn" data-fold title="折叠/展开" aria-label="折叠/展开">${ICON_CHEVRON}</button>
        <a class="${cls}" href="${escapeHtml(url(n.path))}">${ICON_FOLDER}<span class="label">${escapeHtml(n.name)}</span></a>
      </div>
      <ul class="tree-children">${children || '<li class="empty-tip">（空）</li>'}</ul>
    </li>`;
  };
  return `<ul class="tree">${nodes.map((n) => li(n)).join("")}</ul>`;
}

/** 渲染大纲（锚点原生跳转，点击即滚动到对应标题） */
export function renderOutline(headings: Heading[], token: string): string {
  if (headings.length === 0) return "";
  const items = headings
    .map((h) => `<li class="d${Math.min(h.level, 4)}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

/** 分享总览页 */
export function renderHome(opts: {
  token: string;
  sidebarHtml: string;
  groups: { label: string; items: { name: string; path: string; isFolder: boolean }[] }[];
}): string {
  const { token, sidebarHtml, groups } = opts;
  const sections = groups
    .map(
      (g) => `
<h2>${escapeHtml(g.label)}</h2>
${g.items
  .map(
    (it) => `
<div class="home-item">
  <a href="/n/${encodeURIComponent(it.path)}?t=${token}">
    ${it.isFolder ? ICON_FOLDER : ICON_NOTE} ${escapeHtml(it.name)}
    <div class="sub">${escapeHtml(it.path)}</div>
  </a>
</div>`,
  )
  .join("")}`,
    )
    .join("");
  const body = `
<h1>${ICON_NOTE}<span>全部内容</span></h1>
${sections || '<p class="empty-tip">当前没有分享任何内容。</p>'}`;
  return pageShell({ title: "全部内容", token, sidebarHtml, outlineHtml: "", body, isHome: true });
}

/** 笔记渲染页 */
export function renderNotePage(opts: {
  token: string;
  path: string;
  title: string;
  contentHtml: string;
  sidebarHtml: string;
  outlineHtml: string;
}): string {
  const { token, path, title, contentHtml, sidebarHtml, outlineHtml } = opts;
  const body = `
<h1>${ICON_NOTE}<span>${escapeHtml(title)}</span></h1>
<div class="breadcrumb">${escapeHtml(path)}</div>
<div class="markdown-body">
${contentHtml}
</div>`;
  return pageShell({ title, token, sidebarHtml, outlineHtml, body });
}

/** 文件夹目录视图页 */
export function renderFolderPage(opts: {
  token: string;
  path: string;
  sidebarHtml: string;
  subfolders: { name: string; path: string }[];
  notes: { name: string; path: string }[];
}): string {
  const { token, path, sidebarHtml, subfolders, notes } = opts;
  let listHtml = "";
  for (const f of subfolders) {
    listHtml += `
<div class="home-item">
  <a href="/n/${encodeURIComponent(f.path)}?t=${token}">${ICON_FOLDER} ${escapeHtml(f.name)}<div class="sub">${escapeHtml(f.path)}</div></a>
</div>`;
  }
  for (const n of notes) {
    listHtml += `
<div class="home-item">
  <a href="/n/${encodeURIComponent(n.path)}?t=${token}">${ICON_NOTE} ${escapeHtml(n.name)}<div class="sub">${escapeHtml(n.path)}</div></a>
</div>`;
  }
  const body = `
<h1>${ICON_FOLDER}<span>${escapeHtml(basenameOf(path))}</span></h1>
<div class="breadcrumb">${escapeHtml(path)}</div>
<p class="empty-tip">包含 ${subfolders.length} 个子文件夹、${notes.length} 篇笔记</p>
${listHtml || '<p class="empty-tip">此文件夹下暂无可见内容。</p>'}`;
  return pageShell({ title: basenameOf(path), token, sidebarHtml, outlineHtml: "", body });
}

function basenameOf(p: string): string {
  const last = p.lastIndexOf("/");
  return last >= 0 ? p.slice(last + 1) : p;
}
