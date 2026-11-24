import type { HttpResponse } from "./types.ts";
import { randomBytes } from "crypto";

/** 生成随机令牌（256-bit hex） */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // 兜底：Node 环境
  return randomBytes(32).toString("hex");
}

/** 常量时间的令牌比较：杜绝时序侧信道；长度不同直接返回 false 不等 */
export function tokenMatches(expected: string, actual: string): boolean {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}

/** 拒绝空段、`.`、`..`、反斜杠、空字节 */
export function isSafePathSegment(seg: string): boolean {
  return seg !== "" && seg !== "." && seg !== ".." && !seg.includes("\\") && !seg.includes("\0");
}

/**
 * 将请求中的路径段规范化成 vault 相对路径。
 * 输入已是 decodeURIComponent 后的原始路径（router 层解码）。
 * 返回 null 表示非法（含穿越、绝对路径、隐藏目录等）。
 */
export function normalizeVaultPath(rawPath: string, hidden: string[] = [".obsidian", ".trash"]): string | null {
  const segments = rawPath.split("/");
  if (segments.length === 0) return null;
  const out: string[] = [];
  for (const seg of segments) {
    if (!isSafePathSegment(seg)) return null;
    out.push(seg);
  }
  const normalized = out.join("/");
  // 禁止任何可见于根级隐藏目录的路径
  if (hidden.includes(out[0] ?? "")) return null;
  return normalized;
}

/**
 * 判断 path 是否属于某个分享项：path 本身是分享项，或其前缀是分享项（文件夹分享了整个子树）。
 * shares 重名时（同一路径既有 file 又有 folder，实际不会发生）以 folder 优先。
 */
export function isPathShared(path: string, shares: { path: string; type: "file" | "folder" }[]): boolean {
  for (const s of shares) {
    if (s.type === "file") {
      if (path === s.path) return true;
      continue;
    }
    // folder：path 是文件夹本身，或以其为前缀（子树内）
    if (path === s.path || path.startsWith(s.path + "/")) return true;
  }
  return false;
}

/** 从查询中对路径参数做安全规范，非法返回 null */
export function safeQueryPath(raw: string | null): string | null {
  if (raw === null) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return normalizeVaultPath(decoded.replace(/^\/+/, ""));
}

/** 统一错误响应 */
export function err(status: number, message: string): HttpResponse {
  return {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: message,
  };
}
