/*
 * 第 1 层校验：分发件格式
 *
 * 目标：把已经踩过的两个错误永久固化拦下，让它们不可能再进发布。
 *   Invalid Line<!DOCTYPE html>       ← 引用 blob 网页地址
 *   Invalid Line [rewrite_local]      ← 引用含 section 标题的完整配置
 */

const fs = require("fs");
const path = require("path");
const t = require("./lib/harness");

const { ROOT, FILES, loadApps } = require("../src/manifest");
const { parseSnippet, hasHtmlOutsideComments } = require("../src/lib/parse");

const apps = loadApps();

// 需要校验的片段文件：dist 聚合 + dist 单 App + 根目录兼容别名
const snippetFiles = [
  `dist/${FILES.allSnippet}`,
  `dist/${FILES.allFilterSnippet}`,
  ...apps.map((a) => `dist/${FILES.appSnippet(a.id)}`),
  ...apps.map((a) => `dist/${FILES.appFilterSnippet(a.id)}`),
  ...Object.keys(FILES.legacy).filter((f) => f.endsWith(".snippet")),
];

const confFiles = [`dist/${FILES.allConf}`, ...apps.map((a) => `dist/${FILES.appConf(a.id)}`), "rewrite.conf"];

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

t.section("1. 片段文件（QX 引用用）必须是纯规则");

for (const rel of [...new Set(snippetFiles)]) {
  const text = read(rel);
  if (text === null) {
    t.check(`${rel} 存在`, false, "文件缺失，请先运行 node build.js");
    continue;
  }
  const p = parseSnippet(text);
  const base = path.basename(rel);

  // ★ 核心：不能有 section 标题
  t.check(`${base} 无 [section] 标题`, p.sections.length === 0, p.sections.map((s) => `L${s.line}: ${s.value}`).join(" "));

  // ★ 核心：不能是 HTML
  t.check(`${base} 非注释行不含 HTML`, !hasHtmlOutsideComments(text));

  // 无无法识别的行（QX 会把它当成坏规则）
  t.check(`${base} 无无法识别的行`, p.unknown.length === 0, p.unknown.map((u) => `L${u.line}: ${u.value}`).join(" | "));

  // 换行必须是 LF
  t.check(`${base} 换行为 LF`, !text.includes("\r\n"));

  // 首行必须是注释
  const first = text.split("\n")[0].trim();
  t.check(`${base} 首行是注释`, first.startsWith(";") || first.startsWith("#"), `实际: ${first.slice(0, 40)}`);

  // 必须声明由 build.js 生成
  t.check(`${base} 标注为生成文件`, text.includes("build.js"));

  // 规则非空
  t.check(`${base} 至少含一条规则`, p.rewrites.length + p.filters.length > 0);
}

// 按文件名判断是否为过滤片段。
// 注意用不区分大小写的 filter / -filter，否则根目录兼容别名 filter.snippet
// 会被误判成重写片段（踩过：大写的 "Filter" 匹配不到小写的 filter.snippet）。
function isFilterFile(rel) {
  return /filter/i.test(path.basename(rel));
}

t.section("2. 重写片段必须不能含 filter 规则，反之亦然");

for (const rel of [...new Set(snippetFiles)]) {
  const text = read(rel);
  if (text === null) continue;
  const p = parseSnippet(text);
  const base = path.basename(rel);

  if (isFilterFile(rel)) {
    t.check(`${base} 不含重写规则`, p.rewrites.length === 0, `含 ${p.rewrites.length} 条`);
    t.check(`${base} 不含 hostname 行`, p.hostnames.length === 0);
  } else {
    t.check(`${base} 不含 filter 规则`, p.filters.length === 0, `含 ${p.filters.length} 条`);
  }
}

t.section("3. 重写片段必须带 hostname（MITM 随引用生效）");

// 按文件名判断该片段应覆盖哪些 hostname
function expectedHosts(rel) {
  const base = path.basename(rel);
  const enabled = apps.filter((a) => a.enabled !== false);

  if (base === FILES.allSnippet || base === "rewrite.snippet") {
    // 聚合片段：所有 enabled App 的 hosts 合并去重
    return [...new Set(enabled.flatMap((a) => a.hosts || []))];
  }
  // 单 App 片段：只该覆盖自己的
  const hit = apps.find((a) => base === FILES.appSnippet(a.id));
  if (hit) return hit.hosts || [];
  return [...new Set(apps.flatMap((a) => a.hosts || []))];
}

for (const rel of [...new Set(snippetFiles)]) {
  const text = read(rel);
  if (text === null) continue;
  const base = path.basename(rel);
  if (isFilterFile(rel)) continue;

  const p = parseSnippet(text);
  const expect = [...new Set(expectedHosts(rel))].sort();
  const actual = [...new Set(p.hostnames)].sort();

  t.check(`${base} 有 hostname 行`, p.hostnames.length > 0);
  t.check(
    `${base} hostname 与声明完全一致`,
    JSON.stringify(expect) === JSON.stringify(actual),
    `期望 [${expect.join(", ")}]，实际 [${actual.join(", ")}]`
  );
}

t.section("4. .conf 文件（手动导入用）必须反过来含 section");

for (const rel of [...new Set(confFiles)]) {
  const text = read(rel);
  if (text === null) {
    t.check(`${rel} 存在`, false, "文件缺失");
    continue;
  }
  const p = parseSnippet(text);
  const base = path.basename(rel);

  // .conf 就是给人复制粘贴的，必须有 section 标题
  t.check(`${base} 含 [rewrite_local]`, p.sections.some((s) => s.value === "[rewrite_local]"));
  t.check(`${base} 含 [filter_local]`, p.sections.some((s) => s.value === "[filter_local]"));
  t.check(`${base} 含 [mitm]`, p.sections.some((s) => s.value === "[mitm]"));

  // 并且必须警告不能用于引用
  t.check(`${base} 标注不可用于引用`, text.includes("Invalid Line"), "缺少「不能用于引用」的警告");
  t.check(`${base} 非注释行不含 HTML`, !hasHtmlOutsideComments(text));
  t.check(`${base} 换行为 LF`, !text.includes("\r\n"));
}

t.section("5. 根目录兼容别名内容必须等于聚合版");

for (const [alias, target] of Object.entries(FILES.legacy)) {
  const a = read(alias);
  const b = read(`dist/${target}`);
  if (a === null || b === null) {
    t.check(`${alias} 存在`, false, "缺失");
    continue;
  }
  t.check(`${alias} === dist/${target}`, a === b, "兼容别名已漂移，老用户引用会拿到旧内容");
}

t.section("6. 由构建生成的文档不得被手改");

{
  // SCRIPTS.md 整篇由 build.js 产出。
  // 这里只校验「它确实是构建产物」（逐字节一致性由 node build.js --check 负责）。
  const rel = "SCRIPTS.md";
  const text = read(rel);
  if (text === null) {
    t.check(`${rel} 存在`, false, "缺失，请运行 node build.js");
  } else {
    t.check(`${rel} 标注为生成文件`, text.includes("由 build.js"), "缺少生成标记，可能是手写的旧版本");
    t.check(`${rel} 非注释行不含 HTML`, !hasHtmlOutsideComments(text));
    t.check(`${rel} 换行为 LF`, !text.includes("\r\n"));
  }
}

module.exports = { file: "test-snippet-format.js", failures: t.getFailures() };
