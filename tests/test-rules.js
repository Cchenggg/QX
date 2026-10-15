/*
 * 第 2 层校验：规则正确性
 *
 * 校验对象是**生成后的真实文本**（dist/ 的聚合片段），不是内存对象 ——
 * 这样连渲染阶段的 bug 一起抓。
 *
 * 覆盖：
 *   - 正则可编译
 *   - 双向匹配：自己的目标 URL 必须命中；同前缀干扰 URL 必须不命中
 *   - 规则互相遮蔽：不能有规则 A 的正则命中规则 B 的目标 URL
 *   - 域名语法、去重、hosts/filters 冲突
 */

const fs = require("fs");
const path = require("path");
const t = require("./lib/harness");

const { ROOT, FILES, loadApps } = require("../src/manifest");
const { parseSnippet, scriptNameOf } = require("../src/lib/parse");

const apps = loadApps();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const rewriteParsed = parseSnippet(read(`dist/${FILES.allSnippet}`));
const filterParsed = parseSnippet(read(`dist/${FILES.allFilterSnippet}`));

/** 从重写正则里抽出 host 与路径（供构造目标 URL 用） */
function dissect(regex) {
  // ^https?:\/\/<hostEsc><pathEsc>[/?]
  const m = regex.match(/^\^https\?:\\\/\\\/([^\\]+)((?:\\.|[^\\])*?)\[\/\?\]$/);
  if (!m) return null;
  const unesc = (s) => s.replace(/\\(.)/g, "$1");
  const host = unesc(m[1]);
  let p = m[2];
  // 结尾可能带 [\/?]，先去掉
  p = p.replace(/\[\\\/\?\]$/, "");
  const pathPart = unesc(p);
  return { host, path: pathPart || "/" };
}

/** 为一个规则构造「应当命中」的 URL */
function targetUrl(d) {
  if (!d) return null;
  if (d.path === "/") return `https://${d.host}/`;
  return `https://${d.host}${d.path}?ver=1&nonce=AB12`;
}

/**
 * 构造「同前缀干扰 URL」——必须不命中。
 * 这是抓出 /getSplash 误命中 /getSplashFrequencyStatistics 那类问题的地方。
 *
 * 注意：[/?] 边界中的 `/` 会让 /getSplash/nested 这类**子路径仍然命中**，
 * 这是有意设计（接口带子路径也要改写）。子路径的允许由下面的
 * positiveSubpathUrls() 显式断言，避免后人误把 / 从边界里删掉。
 */
function negativeUrls(d) {
  if (!d || d.path === "/") return [];
  const { host, path: p } = d;
  return [
    `https://${host}${p}Extra?a=1`, // 尾部直接跟字符 —— 核心反例
    `https://${host}${p}Frequency`, // 真实踩过的坑：/getSplash → /getSplashFrequencyStatistics
    `https://${host}${p}2?x=1`,
    `https://${host}${p}.json`,
    `https://sub.${host}${p}?x=1`, // 子域不应被父域规则吃掉
    `https://${host}x${p}?x=1`,
    `https://${host}/prefix${p}?x=1`,
  ];
}

/** 应当命中的 URL（含子路径 —— 记录 [/] 边界的预期行为） */
function positiveSubpathUrls(d) {
  if (!d || d.path === "/") return [];
  const { host, path: p } = d;
  return [`https://${host}${p}/nested?x=1`, `https://${host}${p}/`];
}

t.section("1. 全部正则必须可编译");

let compileFails = 0;
for (const r of rewriteParsed.rewrites) {
  try {
    new RegExp(r.regex);
  } catch (e) {
    compileFails++;
    t.check(`正则可编译 L${r.line}`, false, `${r.regex} → ${e.message}`);
  }
}
t.check("重写正则可编译", compileFails === 0, `${compileFails} 条失败`);

t.section("2. 双向匹配：目标 URL 必须命中");

for (const r of rewriteParsed.rewrites) {
  const d = dissect(r.regex);
  if (!d) {
    t.check(`可解析正则 L${r.line}`, false, r.regex);
    continue;
  }
  const url = targetUrl(d);
  const re = new RegExp(r.regex);
  t.check(`命中 ${d.path}`, re.test(url), `规则 ${r.regex} 未能命中 ${url}`);
}

t.section("3. 双向匹配：同前缀干扰 URL 必须不命中");

for (const r of rewriteParsed.rewrites) {
  const d = dissect(r.regex);
  if (!d) continue;
  const re = new RegExp(r.regex);
  const bad = negativeUrls(d).filter((u) => re.test(u));
  t.check(`${d.path} 不误伤同前缀`, bad.length === 0, `误命中: ${bad.join(", ")}`);
}

t.section("3b. 显式记录：子路径应当命中（[/] 边界的设计意图）");

for (const r of rewriteParsed.rewrites) {
  const d = dissect(r.regex);
  if (!d) continue;
  const re = new RegExp(r.regex);
  const miss = positiveSubpathUrls(d).filter((u) => !re.test(u));
  t.check(`${d.path} 子路径仍命中`, miss.length === 0, `未命中: ${miss.join(", ")}`);
}

t.section("4. 规则互相遮蔽检测");

{
  const entries = rewriteParsed.rewrites.map((r) => ({ r, d: dissect(r.regex) }));
  const clashes = [];

  for (const a of entries) {
    if (!a.d) continue;
    for (const b of entries) {
      if (a === b || !b.d) continue;
      const urlB = targetUrl(b.d);
      if (urlB && new RegExp(a.r.regex).test(urlB)) {
        clashes.push(`${a.d.path} 的正则也命中 ${b.d.path} 的目标 URL`);
      }
    }
  }
  t.check("无规则互相遮蔽", clashes.length === 0, clashes.join(" | "));
}

t.section("5. 每条规则必须是 script 或明确动作");

for (const r of rewriteParsed.rewrites) {
  const isScript = r.action.startsWith("script-");
  const takesTarget = isScript || ["302", "307", "reject-img"].includes(r.action);
  if (isScript) {
    t.check(`L${r.line} script 规则有目标`, !!r.target, r.raw);
    t.check(`L${r.line} 脚本是绝对 URL`, /^https?:\/\//.test(r.target || ""), `实际: ${r.target}`);
    t.check(`L${r.line} 脚本后缀 .js`, (scriptNameOf(r) || "").endsWith(".js"), `实际: ${scriptNameOf(r)}`);
  } else if (takesTarget) {
    t.check(`L${r.line} ${r.action} 有目标`, !!r.target);
  } else {
    t.check(`L${r.line} ${r.action} 不应带多余目标`, !r.target, `实际: ${r.target}`);
  }
}

t.section("6. 脚本必须存在于 apps-scripts/（引用不能悬空）");

{
  const declared = new Set(apps.flatMap((a) => a.scripts || []));
  const referenced = new Set(rewriteParsed.rewrites.map((r) => scriptNameOf(r)).filter(Boolean));

  for (const s of referenced) {
    const exists = fs.existsSync(path.join(ROOT, "apps-scripts", s));
    t.check(`apps-scripts/${s} 存在`, exists, "规则引用了不存在的脚本");
    t.check(`${s} 已在某个 apps/*.js 的 scripts[] 声明`, declared.has(s), "未被任何 App 声明");
  }
  for (const s of declared) {
    t.check(`${s} 被至少一条规则引用`, referenced.has(s), "声明了但没规则用它");
  }
}

t.section("7. hostname 语法");

const HOSTNAME_OK = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
for (const h of filterParsed.hostnames.concat(rewriteParsed.hostnames)) {
  t.check(`hostname ${h} 语法合法`, HOSTNAME_OK.test(h), "含非法字符或不是域名");
}

t.section("8. filter 规则语法与去重");

const seen = new Map();
for (const f of filterParsed.filters) {
  const ok = HOSTNAME_OK.test(f.host) && !f.host.includes("*");
  t.check(`filter ${f.host} 语法合法`, ok, f.raw);

  if (seen.has(f.host)) {
    t.check(`filter ${f.host} 无重复`, false, `第 ${seen.get(f.host)} 行已出现`);
  } else {
    seen.set(f.host, f.line);
  }
  t.check(`filter ${f.host} 动作为 reject`, f.action === "reject", `实际 ${f.action}`);
}

t.section("9. hosts(MITM) 与 filters(reject) 不得冲突");

{
  const mitm = new Set(rewriteParsed.hostnames);
  const clash = filterParsed.filters.map((f) => f.host).filter((h) => mitm.has(h));
  t.check("无域名同时需要 MITM 与 reject", clash.length === 0, `冲突: ${clash.join(", ")}`);
}

t.section("10. 聚合件必须覆盖所有 enabled App 的规则");

{
  const enabled = apps.filter((a) => a.enabled !== false);
  const expectRewrites = enabled.reduce((n, a) => n + (a.rewrites || []).length * (a.hosts || []).length, 0);
  const expectFilters = enabled.reduce((n, a) => n + (a.filterGroups || []).reduce((m, g) => m + g.hosts.length, 0), 0);

  t.check(
    `聚合重写规则数 = ${expectRewrites}`,
    rewriteParsed.rewrites.length === expectRewrites,
    `实际 ${rewriteParsed.rewrites.length}`
  );
  t.check(
    `聚合 filter 规则数 = ${expectFilters}`,
    filterParsed.filters.length === expectFilters,
    `实际 ${filterParsed.filters.length}`
  );

  // 逐 App 核对域名不丢
  const aggHosts = new Set(filterParsed.filters.map((f) => f.host));
  for (const a of enabled) {
    for (const g of a.filterGroups || []) {
      for (const h of g.hosts) {
        t.check(`${a.id}: ${h} 已进聚合件`, aggHosts.has(h));
      }
    }
  }
}

module.exports = { file: "test-rules.js", failures: t.getFailures() };
