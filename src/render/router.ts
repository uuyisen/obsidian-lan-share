import { err, isPathShared, safeQueryPath } from "../permissions.ts";
import type { HttpResponse, RouterDeps, ShareItem, SidebarNode } from "../types.ts";
import { renderHome, renderNotePage, renderFolderPage, renderSidebar, renderOutline } from "./page.ts";
import { renderNoteMarkdown, extractHeadings } from "./markdown.ts";

/** router 与 Node http 解耦：入参为已解析的请求 */
export interface RequestLike {
  method: string;
  /** 已 decodeURIComponent 的路径 */
  pathname: string;
  query: URLSearchParams;
}

const ASSET_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

export class Router {
  private deps: RouterDeps;

  constructor(deps: RouterDeps) {
    this.deps = deps;
  }

  async handle(req: RequestLike): Promise<HttpResponse> {
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return err(405, "Method Not Allowed");
    }
    const isHead = method === "HEAD";

    const data = this.deps.getData();
    const token = req.query.get("t") || "";
    if (!token || !constantTimeEq(token, data.token)) {
      return err(403, "无效或缺失的访问令牌");
    }

    try {
      const resp = await this.route(req.pathname, req, token);
      // HEAD：只回状态与头，不携带 body
      if (isHead) {
        resp.body = undefined;
        resp.binary = undefined;
      }
      return resp;
    } catch (e) {
      console.error("[lan-share] route error", e);
      return err(500, "服务器内部错误");
    }
  }

  private async route(path: string, req: RequestLike, token: string): Promise<HttpResponse> {
    // 根级隐藏目录（默认 ".obsidian"、".trash"），取自用户实际配置目录而非硬编码
    const configDir = await this.deps.vault.configDir().catch(() => ".obsidian");
    const hidden = [configDir, ".trash"];

    // 本地静态资源（前端脚本），仅白名单三个文件
    if (
      path === "/vendor/mermaid.min.js" ||
      path === "/vendor/mermaid-init.js" ||
      path === "/vendor/site.js"
    ) {
      const name = path.slice("/vendor/".length);
      const bin = await this.deps.readLocalAsset(name);
      if (!bin) return err(404, "资源不存在");
      return { status: 200, headers: { "Content-Type": "text/javascript; charset=utf-8" }, binary: bin };
    }

    if (path === "/") {
      return this.home(token);
    }

    // /n/<vault 相对路径>：笔记渲染页
    const noteMatch = path.match(/^\/n\/(.+)$/);
    if (noteMatch) {
      const notePath = safeQueryPath(noteMatch[1], hidden);
      if (!notePath) return err(400, "非法路径");
      return this.note(token, notePath);
    }

    // /asset?path=<vault 相对路径>：附件（图片）只读
    if (path === "/asset") {
      const assetPath = safeQueryPath(req.query.get("path"), hidden);
      if (!assetPath) return err(400, "非法路径");
      return this.asset(token, assetPath);
    }

    return err(404, "Not Found");
  }

  /** 分享首页：分组列出单篇分享与文件夹（展开其下笔记） */
  private async home(token: string): Promise<HttpResponse> {
    const data = this.deps.getData();
    const singleItems: HomeEntry[] = [];
    const folderItems: HomeEntry[] = [];

    for (const share of data.shares) {
      if (share.type === "file") {
        singleItems.push({ name: share.name, path: share.path, isFolder: false });
      } else {
        folderItems.push({ name: share.name, path: share.path, isFolder: true });
        await this.collectNotes(share, folderItems);
      }
    }

    const groups: Group[] = [];
    if (singleItems.length) groups.push({ label: "单篇分享（" + singleItems.length + "）", items: singleItems });
    if (folderItems.length) groups.push({ label: "文件夹分享（" + folderItems.length + "）", items: folderItems });

    return {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: renderHome({ token, sidebarHtml: await this.sidebarHtml(""), groups }),
    };
  }

  /** 构建左侧目录树（分享集结构） */
  private async sidebarHtml(activePath: string): Promise<string> {
    const data = this.deps.getData();
    const nodes: SidebarNode[] = [];
    for (const share of data.shares) {
      nodes.push(await this.buildSidebarNode(share, 0));
    }
    return renderSidebar(nodes, data.token, activePath);
  }

  /** 递归构建目录树节点 */
  private async buildSidebarNode(share: ShareItem, depth: number): Promise<SidebarNode> {
    const base: SidebarNode = {
      name: share.name,
      path: share.path,
      kind: share.type === "file" ? "note" : "folder",
    };
    if (share.type === "file" || depth >= 6) return base;
    const children = await this.deps.vault.listFolder(share.path);
    if (!children) return base;
    const items: SidebarNode[] = [];
    for (const child of children) {
      const meta = await this.deps.vault.meta(child);
      if (!meta) continue;
      if (meta.type === "folder") {
        items.push(await this.buildSidebarNode({ path: child, type: "folder", name: basename(child), shareTime: 0 }, depth + 1));
      } else if (meta.type === "file" && meta.ext === "md") {
        items.push({ name: basename(child), path: child, kind: "note" });
      }
    }
    items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "zh-CN") : a.kind === "folder" ? -1 : 1));
    base.children = items;
    return base;
  }

  /** 递归收集文件夹下（含子文件夹）的 md 笔记 */
  private async collectNotes(share: ShareItem, out: HomeEntry[]): Promise<void> {
    const children = await this.deps.vault.listFolder(share.path);
    if (!children) return;
    for (const child of children) {
      const meta = await this.deps.vault.meta(child);
      if (!meta) continue;
      if (meta.type === "folder") {
        out.push({ name: basename(child), path: child, isFolder: true });
        await this.collectNotes(share, out);
      } else if (meta.type === "file" && meta.ext === "md") {
        out.push({ name: basename(child), path: child, isFolder: false });
      }
    }
  }

  /** 渲染单个笔记页；若目标是文件夹则渲染目录视图（可继续下钻） */
  private async note(token: string, notePath: string): Promise<HttpResponse> {
    const data = this.deps.getData();
    const meta = await this.deps.vault.meta(notePath);
    if (!meta) return err(404, "笔记不存在");
    // 未分享 = 不存在（不暴露库结构）
    if (!isPathShared(notePath, data.shares)) {
      return err(404, "该笔记不在分享集中");
    }

    if (meta.type === "folder") {
      return this.folderView(token, notePath);
    }
    if (meta.type !== "file" || meta.ext !== "md") return err(404, "笔记不存在");

    const src = await this.deps.vault.readText(notePath);
    if (src === null) return err(404, "笔记不存在");

    const urlToken = encodeURIComponent(token);
    const contentHtml = await renderNoteMarkdown(src, notePath, {
      resolveLink: (linktext) => this.deps.vault.resolveLink(linktext, notePath),
      assetUrl: (p) => "/asset?path=" + encodeURIComponent(p) + "&t=" + urlToken,
      noteUrl: (p) => "/n/" + encodeURIComponent(p) + "?t=" + urlToken,
      isVisible: (p) => isPathShared(p, data.shares),
    });

    const headings = extractHeadings(contentHtml);
    const html = renderNotePage({
      token,
      path: notePath,
      title: stripExt(basename(notePath)),
      contentHtml,
      sidebarHtml: await this.sidebarHtml(notePath),
      outlineHtml: renderOutline(headings, token),
    });
    return { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
  }

  /** 文件夹目录视图：列出该文件夹下可访问的子文件夹与 md 笔记 */
  private async folderView(token: string, folderPath: string): Promise<HttpResponse> {
    const data = this.deps.getData();
    const children = await this.deps.vault.listFolder(folderPath);
    if (!children) return err(404, "文件夹不存在");

    const subfolders: HomeEntry[] = [];
    const notes: HomeEntry[] = [];
    for (const child of children) {
      const meta = await this.deps.vault.meta(child);
      if (!meta) continue;
      if (meta.type === "folder") {
        subfolders.push({ name: basename(child), path: child, isFolder: true });
      } else if (meta.type === "file" && meta.ext === "md") {
        notes.push({ name: basename(child), path: child, isFolder: false });
      }
    }
    // 仅展示分享集可达的子项（folder 分享子树内全部可达；file 分享到不了这里）
    const visible = (it: HomeEntry) => isPathShared(it.path, data.shares);

    const html = renderFolderPage({
      token,
      path: folderPath,
      sidebarHtml: await this.sidebarHtml(folderPath),
      subfolders: subfolders.filter(visible),
      notes: notes.filter(visible),
    });
    return { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }, body: html };
  }

  /** 附件读取：仅当文件属于分享集可达资产（folder 子树 / 单篇笔记嵌入引用） */
  private async asset(token: string, assetPath: string): Promise<HttpResponse> {
    const data = this.deps.getData();
    const meta = await this.deps.vault.meta(assetPath);
    if (!meta || meta.type !== "file") return err(404, "文件不存在");
    const ext = meta.ext.toLowerCase();
    if (!ASSET_EXTS.has(ext)) return err(404, "非附件资源");

    if (!(await this.assetAllowed(assetPath, data.shares))) {
      return err(404, "该附件不在分享集中");
    }

    const bin = await this.deps.vault.readBinary(assetPath);
    if (!bin) return err(404, "文件不存在");
    return {
      status: 200,
      headers: {
        "Content-Type": mimeFor(ext),
        "Content-Length": String(bin.byteLength),
        "Cache-Control": "no-store",
      },
      binary: bin,
    };
  }

  /**
   * 附件白名单：
   * 1) 位于某个 folder 分享项的子树内，视为该文件夹分享的一部分；
   * 2) 被某个 file 分享项的笔记以 ![[...]] 嵌入引用（解析后路径命中）。
   */
  private async assetAllowed(assetPath: string, shares: ShareItem[]): Promise<boolean> {
    for (const share of shares) {
      if (share.type === "folder") {
        const prefix = share.path + "/";
        if (assetPath === share.path || assetPath.startsWith(prefix)) return true;
      }
    }
    // 单篇分享：检查每篇笔记引用了哪些资产
    const re = /!\[\[([^\]]+)\]\]/g;
    for (const share of shares) {
      if (share.type !== "file") continue;
      const src = await this.deps.vault.readText(share.path);
      if (src === null) continue;
      for (const m of src.matchAll(re)) {
        let linktext = m[1].trim();
        // 去掉别名与锚点：[[img.png|alt]] / [[img.png#^block]]
        const bar = linktext.indexOf("|");
        if (bar !== -1) linktext = linktext.slice(0, bar);
        const hash = linktext.indexOf("#");
        if (hash !== -1) linktext = linktext.slice(0, hash);
        const resolved = await this.deps.vault.resolveLink(linktext.trim(), share.path);
        if (resolved && resolved === assetPath) return true;
      }
    }
    return false;
  }
}

interface HomeEntry {
  name: string;
  path: string;
  isFolder: boolean;
}

interface Group {
  label: string;
  items: HomeEntry[];
}

function basename(p: string): string {
  const last = p.lastIndexOf("/");
  return last >= 0 ? p.slice(last + 1) : p;
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function mimeFor(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

/** 常量时间比较字符串令牌（防时序侧信道） */
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
