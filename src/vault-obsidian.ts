import type { VaultLike } from "./types.ts";

/**
 * Obsidian 真实 vault 适配：把 app.vault / metadataCache 包装成 Router 需要的 VaultLike。
 * 只读：所有操作都是读，绝不写回。
 */
export function createObsidianVault(app: {
  vault: {
    configDir: string;
    getAbstractFileByPath(path: string): { name?: string; path: string; extension?: string } | null;
    cachedRead(file: unknown): Promise<string>;
    adapter: {
      readBinary(normalizedPath: string): Promise<ArrayBuffer>;
      stat(normalizedPath: string): Promise<{ size: number } | null>;
    };
  };
  metadataCache: {
    getFirstLinkpathDest(linktext: string, sourcePath: string): { path: string } | null;
  };
}): VaultLike {
  const vault = app.vault;
  const mdCache = app.metadataCache;

  return {
    async listFolder(path: string): Promise<string[] | null> {
      const abs = vault.getAbstractFileByPath(path);
      if (!abs) return null;
      // TFolder 有 children；这里需要真实类型判断
      const children = (abs as unknown as { children?: { path: string }[] }).children;
      if (!children) return null;
      return children.map((c) => c.path);
    },

    async meta(path: string): Promise<{ type: "file" | "folder"; ext: string } | null> {
      const abs = vault.getAbstractFileByPath(path);
      if (!abs) return null;
      const children = (abs as unknown as { children?: unknown[] }).children;
      if (Array.isArray(children)) return { type: "folder", ext: "" };
      const ext = (abs.extension || "").toLowerCase();
      return { type: "file", ext };
    },

    async readText(path: string): Promise<string | null> {
      const abs = vault.getAbstractFileByPath(path);
      if (!abs) return null;
      try {
        return await vault.cachedRead(abs);
      } catch {
        return null;
      }
    },

    async readBinary(path: string): Promise<Uint8Array | null> {
      try {
        const buf = await vault.adapter.readBinary(path);
        return new Uint8Array(buf);
      } catch {
        return null;
      }
    },

    async resolveLink(linktext: string, sourcePath: string): Promise<string | null> {
      try {
        const dest = mdCache.getFirstLinkpathDest(linktext, sourcePath);
        if (!dest) return null;
        return dest.path;
      } catch {
        return null;
      }
    },

    async statSize(path: string): Promise<number | null> {
      try {
        const s = await vault.adapter.stat(path);
        return s?.size ?? null;
      } catch {
        return null;
      }
    },

    async configDir(): Promise<string> {
      // Vault#configDir：用户可自定义配置目录位置，禁止硬编码 ".obsidian"
      return vault.configDir || ".obsidian";
    },
  };
}
