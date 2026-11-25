import { test } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../src/render/router.ts";
import type { RequestLike } from "../src/render/router.ts";
import type { PluginData, RouterDeps } from "../src/types.ts";
import { MockVault } from "./mock-vault.ts";

const TOKEN = "a".repeat(64);
const LOCAL_MD = "00_收集箱/hello.md";
const PRIVATE_MD = "01_沉淀/private.md";
const FOLDER = "02_目标/8D";
const FOLDER_NOTE = "02_目标/8D/meeting.md";
const IMG_A = "99-附件/00_收集箱/hello/IMG-20260101.png";
const IMG_B = "99-附件/01_沉淀/private/IMG-secret.png";

function makeDeps(overrides?: Partial<PluginData>): { router: Router; vault: MockVault; data: PluginData } {
  const vault = new MockVault();
  vault.put(LOCAL_MD, "---\ntags: [测试]\n---\n# 你好\n\n![[IMG-20260101.png]]\n\n```mermaid\ngraph LR\nA-->B\n```\n\n[[私密笔记]]");
  vault.put(PRIVATE_MD, "# 私密");
  vault.put(FOLDER_NOTE, "# 会议记录\n\n![[IMG-secret.png]]");
  vault.put("02_目标/8D/x.png", new Uint8Array([9, 9, 9, 9]));
  vault.put(IMG_A, new Uint8Array([137, 80, 78, 71]));
  vault.put(IMG_B, new Uint8Array([1, 2, 3, 4, 5]));

  const data: PluginData = {
    token: TOKEN,
    port: 8765,
    bind: "0.0.0.0",
    serverEnabled: true,
    autoStart: false,
    shares: [
      { path: LOCAL_MD, type: "file", name: "hello", shareTime: 1 },
      { path: FOLDER, type: "folder", name: "8D", shareTime: 2 },
    ],
    ...overrides,
  };

  const deps: RouterDeps = {
    getData: () => data,
    vault,
    readLocalAsset: async (name) => (name.endsWith(".js") ? new TextEncoder().encode("//asset") : null),
  };
  return { router: new Router(deps), vault, data };
}

function req(method: string, pathname: string, t: string | null = TOKEN, query: Record<string, string> = {}): RequestLike {
  const params = new URLSearchParams(query);
  if (t !== null) params.set("t", t);
  return { method, pathname, query: params };
}

test("错误令牌 -> 403", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/", "b".repeat(64)));
  assert.equal(r.status, 403);
});

test("缺失令牌 -> 403", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/", ""));
  assert.equal(r.status, 403);
});

test("路径穿越被拒 -> 400", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/..%2F..%2Fetc%2Fpasswd"));
  assert.equal(r.status, 400);
});
test("分享集外的笔记 -> 404（不暴露存在性）", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(PRIVATE_MD)));
  assert.equal(r.status, 404);
});

test("未分享的附件 -> 404", async () => {
  const { router } = makeDeps();
  // IMG_B 被私密笔记引用，私密笔记不在分享集 → 附件不可达
  const r = await router.handle(req("GET", "/asset", TOKEN, { path: IMG_B }));
  assert.equal(r.status, 404);
});

test("被分享笔记嵌入的附件 -> 200 且字节一致", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/asset", TOKEN, { path: IMG_A }));
  assert.equal(r.status, 200);
  assert.ok(r.binary !== undefined);
  assert.deepEqual(Array.from(r.binary!), [137, 80, 78, 71]);
});

test("文件夹分享子树内的文件可读、且不受单篇限制", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(FOLDER_NOTE)));
  assert.equal(r.status, 200);
  const a = await router.handle(req("GET", "/asset", TOKEN, { path: "02_目标/8D/x.png" }));
  // 文件夹分享：子树内任意资产可达（模拟已放入该目录的图片）
  assert.equal(a.status, 200);
});

test("mermaid 代码块出现在渲染输出", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(LOCAL_MD)));
  assert.equal(r.status, 200);
  assert.ok(r.body!.includes('class="mermaid"'));
});

test("frontmatter 不渲染进页面", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(LOCAL_MD)));
  assert.ok(!r.body!.includes("tags:"));
});

test("非 GET/HEAD 方法 -> 405", async () => {
  const { router } = makeDeps();
  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
    const r = await router.handle(req(m, "/"));
    assert.equal(r.status, 405, m);
  }
});

test("HEAD 允许且无 body", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("HEAD", "/"));
  assert.equal(r.status, 200);
  assert.equal(r.body, undefined);
});

test("分享的文件夹路径直接访问 -> 200 且列出子项", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(FOLDER)));
  assert.equal(r.status, 200);
  assert.ok(r.body!.includes("meeting.md")); // 子笔记
  assert.ok(r.body!.includes("x.png") === false); // 文件夹视图不展示图片
});

test("分享的文件夹内笔记可访问", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(FOLDER_NOTE)));
  assert.equal(r.status, 200);
  assert.ok(r.body!.includes("会议记录"));
});

test("分享集外的文件夹 -> 404", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent("01_沉淀"))); // 未分享的兄弟文件夹
  assert.equal(r.status, 404);
});

test("首页列出分享项与文件夹下笔记", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/"));
  assert.equal(r.status, 200);
  assert.ok(r.body!.includes("hello"));
  assert.ok(r.body!.includes("meeting"));
});

test("vendored 资源可读", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/vendor/mermaid.min.js"));
  assert.equal(r.status, 200);
  assert.equal(new TextDecoder().decode(r.binary), "//asset");
});

test("未知路径 -> 404", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/nope"));
  assert.equal(r.status, 404);
});

test("未分享页面的双链目标不生成链接（不泄漏结构）", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(LOCAL_MD)));
  // [[私密笔记]] 未分享 → 渲染为文本而非 <a>
  assert.ok(!r.body!.includes('href="/n/' + encodeURIComponent(PRIVATE_MD)));
});

test("笔记页含左侧目录树与右侧大纲（三栏布局）", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(LOCAL_MD)));
  assert.equal(r.status, 200);
  // 左侧目录树：包含分享文件夹 8D 与分享笔记
  assert.ok(r.body!.includes('class="tree"'));
  assert.ok(r.body!.includes("meeting.md")); // 树中含文件夹子笔记
  // 右侧大纲区存在，且 h1 "你好" 有可跳转锚点
  assert.ok(r.body!.includes("大纲"));
  assert.match(r.body!, /class="outline"/);
  assert.match(r.body!, /<a href="#你好">你好<\/a>/);
});

test("首页含侧栏目录树", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/"));
  assert.equal(r.status, 200);
  assert.ok(r.body!.includes('class="tree"'));
});

test("页面无 emoji、笔记页左上角有主页入口、含折叠控件与 site.js", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/n/" + encodeURIComponent(LOCAL_MD)));
  assert.equal(r.status, 200);
  // 无 emoji（📄/📁/🏠/📖）与"返回首页"文案（主页入口用 SVG + "主页"）
  for (const emoji of ["📄", "📁", "🏠", "📖", "🔗", "🔕"]) {
    assert.ok(!r.body!.includes(emoji), "不应含 emoji: " + emoji);
  }
  assert.ok(!r.body!.includes("返回首页"));
  // 笔记页应有主页入口（指向分享列表首页）
  assert.ok(r.body!.includes('class="home-link"'), "笔记页应有主页入口");
  assert.ok(r.body!.includes('href="/?t='), "主页入口应带 token 指向首页");
  // 折叠控件
  assert.ok(r.body!.includes('data-toggle="sidebar"'));
  assert.ok(r.body!.includes('data-toggle="outline"'));
  assert.ok(r.body!.includes("data-fold"));
  // 客户端脚本
  assert.ok(r.body!.includes("/vendor/site.js"));
});

test("首页无语义 emoji 且不显示主页入口（避免自链接）", async () => {
  const { router } = makeDeps();
  const r = await router.handle(req("GET", "/"));
  assert.ok(!r.body!.includes("返回首页"));
  assert.ok(!r.body!.includes("📖"));
  // 首页本身就是主页，不应出现指向自身的主页入口
  assert.ok(!r.body!.includes('class="home-link"'));
});
