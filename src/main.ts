import { Plugin, TFile, TFolder, Notice, Menu, MarkdownView, WorkspaceLeaf, setIcon } from "obsidian";
import { readFile } from "fs/promises";
import { join } from "path";
import type { Server } from "http";
import * as os from "os";
import { DEFAULT_DATA, PluginData, ShareItem, VaultLike } from "./types.ts";
import { createObsidianVault } from "./vault-obsidian.ts";
import { startServer } from "./server.ts";
import type { RouterDeps } from "./types.ts";
import { generateToken } from "./permissions.ts";
import { LanShareSettingTab } from "./settings.ts";
// 内嵌前端静态资源：构建时由 esbuild 以 ?raw 打进 bundle，
// 使社区版安装（仅含 main.js/manifest.json/styles.css）也能自包含渲染 mermaid。
import mermaidMin from "../vendor/mermaid.min.js?raw";
import mermaidInit from "../vendor/mermaid-init.js?raw";
import siteJs from "../vendor/site.js?raw";

/** 内嵌资源表：优先从内存提供，磁盘缺失时也能工作 */
const EMBEDDED_VENDOR: Record<string, string> = {
  "mermaid.min.js": mermaidMin,
  "mermaid-init.js": mermaidInit,
  "site.js": siteJs,
};

export default class LanSharePlugin extends Plugin {
  data: PluginData = structuredClone(DEFAULT_DATA);
  private vaultLike: VaultLike | null = null;
  private server: Server | null = null;
  private statusBarEl: HTMLElement | null = null;
  private actionButtons = new WeakMap<MarkdownView, HTMLElement>();

  async onload(): Promise<void> {
    await this.readPersistedData();
    this.vaultLike = createObsidianVault(this.app as never);

    this.addSettingTab(new LanShareSettingTab(this.app, this));

    this.registerCommands();
    this.registerFileMenu();
    this.registerLeafButton();
    this.setupStatusBar();

    // 服务默认不随插件加载自动开启；仅当用户在设置中开启「随 Obsidian 启动」时才自动拉起
    if (this.data.autoStart) {
      void this.startServer();
    } else {
      this.updateStatusBar();
    }
  }

  onunload(): void {
    this.stopServer();
  }

  async readPersistedData(): Promise<void> {
    const raw = (await super.loadData()) as Partial<PluginData> | undefined;
    this.data = { ...structuredClone(DEFAULT_DATA), ...(raw ?? {}) };
    if (!this.data.token) this.data.token = generateToken();
    await this.persist();
  }

  /** 持久化当前 data（Obsidian saveData 要求显式传参） */
  async persist(): Promise<void> {
    await super.saveData(this.data);
  }

  set serverEnabled(v: boolean) {
    this.data.serverEnabled = v;
    void this.persist();
  }

  // ---------------------------------------------------------------- 服务

  get vault(): VaultLike {
    if (!this.vaultLike) throw new Error("vault 未初始化");
    return this.vaultLike;
  }

  get isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  async startServer(): Promise<void> {
    if (this.isRunning) return;
    const deps: RouterDeps = {
      getData: () => this.data,
      vault: this.vault,
      readLocalAsset: (name) => this.readVendor(name),
    };
    try {
      this.server = await startServer(deps, this.data.port, () => {
        new Notice("局域网分享已开启：端口 " + this.data.port);
      });
      this.data.serverEnabled = true;
      await this.persist();
      this.updateStatusBar();
    } catch (e) {
      console.error("[lan-share] 启动失败", e);
      new Notice("分享服务启动失败：" + (e && typeof (e as Error).message === "string" ? (e as Error).message : "未知错误"));
    }
  }

  stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.data.serverEnabled = false;
    void this.persist();
    this.updateStatusBar();
  }

  /** 提供 vendored 资源：优先内嵌内存（社区版自包含），回退插件目录文件（本地部署） */
  private async readVendor(name: string): Promise<Uint8Array | null> {
    const embedded = EMBEDDED_VENDOR[name];
    if (embedded !== undefined) {
      return new TextEncoder().encode(embedded);
    }
    try {
      const dir = (this.manifest as { dir?: string }).dir;
      if (!dir) return null;
      const buf = await readFile(join(dir, "vendor", name));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- 分享集

  isShared(path: string): boolean {
    return this.data.shares.some((s) => s.path === path);
  }

  addShare(item: Omit<ShareItem, "shareTime">): void {
    const exists = this.data.shares.some(
      (s) => s.path === item.path && s.type === item.type,
    );
    if (!exists) {
      this.data.shares.push({ ...item, shareTime: Date.now() });
    }
    void this.persist();
    this.updateStatusBar();
  }

  removeShare(path: string): void {
    this.data.shares = this.data.shares.filter((s) => s.path !== path);
    void this.persist();
    this.updateStatusBar();
  }

  resetToken(): void {
    this.data.token = generateToken();
    void this.persist();
  }

  /** 本机局域网 IP（第一个非 internal IPv4） */
  getLanIp(): string {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] ?? []) {
        if (iface.family === "IPv4" && !iface.internal) return iface.address;
      }
    }
    return "127.0.0.1";
  }

  buildUrl(path?: string): string {
    const base = "http://" + this.getLanIp() + ":" + this.data.port + "/";
    const token = encodeURIComponent(this.data.token);
    if (!path) return base + "?t=" + token;
    return base + "n/" + encodeURIComponent(path) + "?t=" + token;
  }

  async copyUrl(path?: string): Promise<void> {
    await navigator.clipboard.writeText(this.buildUrl(path));
    new Notice("分享链接已复制到剪贴板");
  }

  // ---------------------------------------------------------------- 交互注册

  private registerCommands(): void {
    this.addCommand({
      id: "share-current-note",
      name: "分享当前笔记",
      checkCallback: (checking) => {
        const file = this.activeMdFile();
        if (!file) return false;
        if (!checking) {
          this.addShare({ path: file.path, type: "file", name: file.basename });
          void this.copyUrl(file.path);
          this.refreshLeafButton();
        }
        return true;
      },
    });
    this.addCommand({
      id: "unshare-current-note",
      name: "取消分享当前笔记",
      checkCallback: (checking) => {
        const file = this.activeMdFile();
        if (!file) return false;
        if (!checking) {
          this.removeShare(file.path);
          new Notice("已取消分享：" + file.basename);
          this.refreshLeafButton();
        }
        return true;
      },
    });
    this.addCommand({
      id: "copy-current-note-link",
      name: "复制当前笔记分享链接",
      checkCallback: (checking) => {
        const file = this.activeMdFile();
        if (!file) return false;
        if (!checking) {
          const share = this.data.shares.find((s) => s.path === file.path);
          if (!share) {
            new Notice("该笔记尚未分享，请先分享");
            return false;
          }
          void this.copyUrl(file.path);
        }
        return true;
      },
    });
    this.addCommand({
      id: "start-lan-server",
      name: "启动局域网分享服务",
      callback: () => void this.startServer(),
    });
    this.addCommand({
      id: "stop-lan-server",
      name: "停止局域网分享服务",
      callback: () => this.stopServer(),
    });
    this.addCommand({
      id: "reset-token",
      name: "重置访问令牌（旧链接全部失效）",
      callback: () => {
        this.resetToken();
        new Notice("令牌已重置，旧链接全部失效");
      },
    });
  }

  private registerFileMenu(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (file instanceof TFolder) {
          const shared = this.data.shares.some((s) => s.path === file.path && s.type === "folder");
          menu.addItem((item) =>
            item
              .setTitle(shared ? "停止分享此文件夹" : "分享此文件夹（含子内容）")
              .setIcon(shared ? "trash" : "folder-input")
              .onClick(() => {
                if (shared) this.removeShare(file.path);
                else this.addShare({ path: file.path, type: "folder", name: file.name });
              }),
          );
          if (!shared) {
            menu.addItem((item) =>
              item
                .setTitle("复制此文件夹分享链接")
                .setIcon("link")
                .onClick(() => void this.copyUrl(file.path)),
            );
          }
        } else if (file instanceof TFile && file.extension === "md") {
          const shared = this.data.shares.some((s) => s.path === file.path && s.type === "file");
          menu.addItem((item) =>
            item
              .setTitle(shared ? "停止分享此笔记" : "分享此笔记")
              .setIcon(shared ? "trash" : "share-2")
              .onClick(() => this.toggleShare(file)),
          );
          menu.addItem((item) =>
            item
              .setTitle("复制分享链接")
              .setIcon("link")
              .onClick(() => void this.copyUrl(file.path)),
          );
        }
      }),
    );
  }

  private toggleShare(file: TFile): void {
    const shared = this.data.shares.some((s) => s.path === file.path && s.type === "file");
    if (shared) {
      this.removeShare(file.path);
      new Notice("已取消分享：" + file.basename);
    } else {
      this.addShare({ path: file.path, type: "file", name: file.basename });
      void this.copyUrl(file.path);
    }
    this.refreshLeafButton();
  }

  private activeMdFile(): TFile | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ?? null;
  }

  // ---------------------------------------------------------------- 右上角按钮

  private registerLeafButton(): void {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
        this.refreshLeafButton(leaf);
      }),
    );
  }

  private refreshLeafButton(leaf?: WorkspaceLeaf | null): void {
    const view = (leaf ?? this.app.workspace.activeLeaf)?.view;
    if (!view || !(view instanceof MarkdownView)) return;
    const old = this.actionButtons.get(view);
    if (old) old.detach();

    const file = view.file;
    const shared = file ? this.isShared(file.path) : false;
    const btn = view.addAction(shared ? "circle-slash" : "share-2", shared ? "取消分享（复制链接前请先取消）" : "分享此笔记到局域网", (ev) => {
      ev.preventDefault();
      if (file) this.toggleShare(file);
    });
    this.actionButtons.set(view, btn);
  }

  // ---------------------------------------------------------------- 状态栏

  private setupStatusBar(): void {
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("lan-share-status");
    this.statusBarEl.addEventListener("click", () => {
      void this.copyUrl();
    });
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl) return;
    this.statusBarEl.empty();
    if (this.isRunning) {
      const n = this.data.shares.length;
      setIcon(this.statusBarEl, "network");
      this.statusBarEl.appendText(" 分享中 " + n + " 项 · 点按复制链接");
      this.statusBarEl.setAttribute("aria-label", this.buildUrl());
    } else {
      setIcon(this.statusBarEl, "wifi-off");
      this.statusBarEl.appendText(" 分享服务未开启");
      this.statusBarEl.setAttribute("aria-label", "在设置中启动");
    }
  }
}
