import type { VaultLike } from "../src/types.ts";

/** 内存文件树：供测试用的 VaultLike mock */
export class MockVault implements VaultLike {
  files = new Map<string, string | Uint8Array>();

  put(path: string, content: string | Uint8Array): void {
    this.files.set(path, content);
  }

  private isFolder(path: string): boolean {
    for (const p of this.files.keys()) {
      if (p.startsWith(path + "/")) return true;
    }
    return false;
  }

  async listFolder(path: string): Promise<string[] | null> {
    if (!this.isFolder(path) && path !== "") return null;
    const children = new Set<string>();
    for (const p of this.files.keys()) {
      if (!p.startsWith(path ? path + "/" : "")) continue;
      const rest = path ? p.slice(path.length + 1) : p;
      if (!rest) continue;
      children.add(rest.split("/")[0]);
    }
    return [...children].map((c) => (path ? path + "/" : "") + c);
  }

  async meta(path: string): Promise<{ type: "file" | "folder"; ext: string } | null> {
    if (this.files.has(path)) {
      const dot = path.lastIndexOf(".");
      return { type: "file", ext: dot >= 0 ? path.slice(dot + 1) : "" };
    }
    if (this.isFolder(path)) return { type: "folder", ext: "" };
    return null;
  }

  async readText(path: string): Promise<string | null> {
    const v = this.files.get(path);
    return typeof v === "string" ? v : null;
  }

  async readBinary(path: string): Promise<Uint8Array | null> {
    const v = this.files.get(path);
    if (v instanceof Uint8Array) return v;
    if (typeof v === "string") return new TextEncoder().encode(v);
    return null;
  }

  /** 简化版 Obsidian 语义：按文件名/带扩展名/base 名匹配库内唯一文件 */
  async resolveLink(linktext: string, _source: string): Promise<string | null> {
    const t = linktext.trim();
    if (this.files.has(t)) return t;
    // 无扩展名 → 尝试 .md
    if (this.files.has(t + ".md")) return t + ".md";
    // 按 basename 匹配
    for (const p of this.files.keys()) {
      const base = p.split("/").pop() || "";
      if (base === t || base === t + ".md") return p;
    }
    return null;
  }

  async statSize(path: string): Promise<number | null> {
    const v = this.files.get(path);
    if (v === undefined) return null;
    return v instanceof Uint8Array ? v.byteLength : v.length;
  }

  async configDir(): Promise<string> {
    return ".obsidian";
  }
}
