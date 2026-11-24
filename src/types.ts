/** 共享项：一个文件或一个文件夹（含子级） */
export interface ShareItem {
  /** vault 内相对路径，如 "00_收集箱/xxx.md" 或 "02_目标" */
  path: string;
  type: "file" | "folder";
  name: string;
  /** 分享创建时间戳（ms） */
  shareTime: number;
}

/** 持久化设置（data.json） */
export interface PluginData {
  token: string;
  port: number;
  /** 绑定地址：0.0.0.0 局域网可见 / 127.0.0.1 仅本机 */
  bind: "0.0.0.0" | "127.0.0.1";
  /** 服务是否允许运行（用户在设置里显式开启；插件加载不等于开启） */
  serverEnabled: boolean;
  /** 随 Obsidian 启动自动开启服务（未开启时每次启动保持关闭，需手动启动） */
  autoStart: boolean;
  shares: ShareItem[];
}

export const DEFAULT_DATA: PluginData = {
  token: "", // main.ts 启动时若为空则生成随机令牌
  port: 8765,
  bind: "0.0.0.0",
  serverEnabled: false,
  autoStart: false,
  shares: [],
};

/** vault 抽象：router 只见这个接口，真实实现走 Obsidian，测试用 mock */
export interface VaultLike {
  /** 返回 path 的子项绝对路径数组；不存在返回 null */
  listFolder(path: string): Promise<string[] | null>;
  /** 查询路径元信息；不存在返回 null */
  meta(path: string): Promise<{ type: "file" | "folder"; ext: string } | null>;
  readText(path: string): Promise<string | null>;
  readBinary(path: string): Promise<Uint8Array | null>;
  /** Obsidian 式双链/嵌入解析：将 "[[xxx]]" 的 linktext 解析为 vault 绝对路径；解析不到或不是文件返回 null */
  resolveLink(linktext: string, sourcePath: string): Promise<string | null>;
  /** 返回文件内容大小 */
  statSize(path: string): Promise<number | null>;
  /** Obsidian 配置目录名（如 ".obsidian"），可能被用户自定义；用于隐藏目录访问保护 */
  configDir(): Promise<string>;
}

/** 路由依赖：数据 + vault 抽象 + 页面资源读取（本地 vendored 静态资源） */
export interface RouterDeps {
  getData(): PluginData;
  vault: VaultLike;
  /** 读取本地静态资源（mermaid.min.js 等），按 fileName 返回 */
  readLocalAsset(fileName: string): Promise<Uint8Array | null>;
}

/** 统一响应对象（与 Node http 解耦，便于测试） */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  /** 文本响应 */
  body?: string;
  /** 二进制响应 */
  binary?: Uint8Array;
}

/** 左侧目录树节点 */
export interface SidebarNode {
  name: string;
  path: string;
  kind: "folder" | "note";
  children?: SidebarNode[];
}

/** 笔记标题（大纲项） */
export interface Heading {
  level: number;
  text: string;
  id: string;
}
