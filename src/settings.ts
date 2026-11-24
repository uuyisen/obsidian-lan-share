import { App, PluginSettingTab, Setting, Notice, TFile } from "obsidian";
import type LanSharePlugin from "./main.ts";
import type { ShareItem } from "./types.ts";

export class LanShareSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LanSharePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("局域网分享").setHeading();
    containerEl.createEl("p", {
      text: "把笔记以只读预览方式分享给同一局域网的朋友：浏览器打开链接即看，支持 Obsidian MD、双链、图片与 mermaid。",
    });

    // ------------------------------------------------------------ 服务控制
    new Setting(containerEl).setName("服务控制").setHeading();
    const statusText = this.plugin.isRunning ? "● 运行中" : "○ 已停止（插件加载不会自动开启）";
    new Setting(containerEl)
      .setName("服务状态")
      .setDesc(statusText)
      .addButton((btn) => {
        btn.setButtonText(this.plugin.isRunning ? "停止服务" : "启动服务");
        if (!this.plugin.isRunning) btn.setCta();
        btn.onClick(async () => {
          if (this.plugin.isRunning) this.plugin.stopServer();
          else await this.plugin.startServer();
          this.display();
        });
        return btn;
      });

    new Setting(containerEl)
      .setName("端口")
      .setDesc("局域网服务监听端口；修改后需重启服务生效")
      .addText((text) =>
        text
          .setPlaceholder("8765")
          .setValue(String(this.plugin.data.port))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!Number.isNaN(n) && n > 0 && n < 65536) {
              this.plugin.data.port = n;
              void this.plugin.persist();
            }
          }),
      );

    new Setting(containerEl)
      .setName("绑定地址")
      .setDesc("0.0.0.0 允许局域网内其他设备访问；127.0.0.1 仅本机可访问")
      .addDropdown((dd) =>
        dd
          .addOption("0.0.0.0", "0.0.0.0（局域网可见）")
          .addOption("127.0.0.1", "127.0.0.1（仅本机）")
          .setValue(this.plugin.data.bind)
          .onChange(async (v) => {
            this.plugin.data.bind = v as "0.0.0.0" | "127.0.0.1";
            void this.plugin.persist();
            if (this.plugin.isRunning) {
              this.plugin.stopServer();
              await this.plugin.startServer();
            }
          }),
      );

    new Setting(containerEl)
      .setName("随 Obsidian 启动时自动开启服务")
      .setDesc("开启后，每次打开 Obsidian 会自动启动分享服务，无需手动点「启动服务」")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.data.autoStart)
          .onChange(async (v) => {
            this.plugin.data.autoStart = v;
            void this.plugin.persist();
            if (v) {
              await this.plugin.startServer();
            }
          }),
      );

    if (this.plugin.isRunning) {
      const urlRow = new Setting(containerEl)
        .setName("首页链接")
        .setDesc("浏览器打开即可预览已分享内容（含访问令牌，请勿外传）");
      urlRow.addText((text) => {
        text.setValue(this.plugin.buildUrl());
        text.inputEl.readOnly = true;
        text.inputEl.addClass("lan-share-url");
      });
      urlRow.addButton((b) =>
        b.setButtonText("复制").onClick(() => void this.plugin.copyUrl()),
      );
    }

    // ------------------------------------------------------------ 令牌
    new Setting(containerEl).setName("访问令牌").setHeading();
    new Setting(containerEl)
      .setName("当前令牌")
      .setDesc("链接中携带此令牌校验访问权限；重置后所有旧链接立即失效")
      .addText((text) => {
        text.setPlaceholder("未生成");
        text.setValue(this.plugin.data.token);
        text.inputEl.readOnly = true;
        text.inputEl.addClass("lan-share-token");
      })
      .addButton((b) =>
        b.setButtonText("重置").onClick(() => {
          this.plugin.resetToken();
          new Notice("令牌已重置，旧链接全部失效");
          this.display();
        }),
      );

    // ------------------------------------------------------------ 分享列表
    new Setting(containerEl).setName(`当前分享（${this.plugin.data.shares.length}）`).setHeading();
    const list = containerEl.createDiv({ cls: "lan-share-list" });

    if (this.plugin.data.shares.length === 0) {
      list.createEl("p", { text: "尚未分享任何内容。可在笔记右上角、文件右键菜单或命令面板中分享。" });
    } else {
      for (const share of this.plugin.data.shares) {
        this.renderShareCard(list, share);
      }
    }
  }

  private renderShareCard(container: HTMLElement, share: ShareItem): void {
    const card = container.createDiv({ cls: "lan-share-card" });

    const head = card.createDiv({ cls: "lan-share-card-head" });
    head.createSpan({
      cls: "lan-share-type",
      text: share.type === "folder" ? "(文件夹及子级)" : "(单个笔记)",
    });
    head.createSpan({ cls: "lan-share-name", text: share.name });

    const body = card.createDiv({ cls: "lan-share-card-body" });
    body.createEl("div", {
      text: "路径：" + share.path,
    });
    const scope = share.type === "folder"
      ? "权限：该文件夹及全部子文件夹/子文件可预览（只读）"
      : "权限：仅此笔记可预览，嵌入附件跟随（只读）";
    body.createEl("div", { text: scope });
    body.createEl("div", {
      text: "分享时间：" + new Date(share.shareTime).toLocaleString("zh-CN"),
    });

    const actions = card.createDiv({ cls: "lan-share-card-actions" });
    actions.createEl("button", { text: "复制链接", cls: "mod-cta" }).addEventListener("click", () => {
      void this.plugin.copyUrl(share.path);
    });
    if (share.type === "file") {
      actions.createEl("button", { text: "打开笔记" }).addEventListener("click", () => {
        const abstract = this.app.vault.getAbstractFileByPath(share.path);
        if (abstract && abstract instanceof TFile) {
          void this.app.workspace.getLeaf(true).openFile(abstract as never);
        }
      });
    }
    actions.createEl("button", { text: "关闭分享", cls: "mod-warning" }).addEventListener("click", () => {
      this.plugin.removeShare(share.path);
      this.display();
    });

    // 文件夹分享可预览目录树
    if (share.type === "folder") {
      const tree = card.createDiv({ cls: "lan-share-tree" });
      void this.renderFolderTree(tree, share.path, 0);
    }
  }

  private async renderFolderTree(container: HTMLElement, folderPath: string, depth: number): Promise<void> {
    const children = await this.app.vault.adapter.list(folderPath);
    if (!children) return;
    const files = children.files.filter((f) => f.endsWith(".md"));
    const folders = children.folders;
    for (const f of files) {
      const row = container.createDiv({ cls: "lan-share-tree-row" });
      row.style.paddingLeft = String(depth * 14) + "px";
      row.setText(f.split("/").pop() || f);
    }
    for (const sub of folders.slice(0, 20)) {
      const row = container.createDiv({ cls: "lan-share-tree-row" });
      row.style.paddingLeft = String(depth * 14) + "px";
      row.setText(sub.split("/").pop() || sub);
      const child = container.createDiv();
      await this.renderFolderTree(child, sub, depth + 1);
    }
  }
}
