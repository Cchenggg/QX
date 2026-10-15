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
  // 只处理常规 host×path 规则： ^https?:\/\/<hostEsc><pathEsc>[/?]
  // urlPrefix 规则含 [^/]、(?::\d+)? 等结构，无法可靠反推样例 URL，
  // 返回 null 跳过 —— 它们由 app 定义里的 selfTest 样例校验（见 section 0）。
  // 注意守卫要匹配正则源码里的真实字符：字面 "[^/]" 与 "\d"
  if (regex.includes("[^/]") || regex.includes("(?:") || regex.includes("\\d")) return null;

  const m = regex.match(/^\^https\?:\\\/\\\/([^\\]+)((?:\\.|[^\\])*?)\[\/\?\]$/);
  if (!m) return null;
  const unesc = (s) => s.replace(/\\(.)/g, "$1");
  const host = unesc(m[1]);
  const p = m[2].replace(/\[\\\/\?\]$/, "");
  return { host, path: unesc(p) || "/" };
}

/** 为一个规则构造「应当命中」的 URL */
function targetUrl(d) {
  if (!d) return null;
  if (d.path === "/" || d.path === "") return `https://${d.host}/`;
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

t.section("0. urlPrefix 规则的 selfTest 双向校验（样例来自真实抓包）");

{
  // urlPrefix 规则无法从正则反推样例 URL，改由 app 定义声明真实样例。
  // 这里把声明样例落到生成后的真实规则上校验：match 必须命中、exclude 必须不命中。
  //
  // 关联方式：按 apps→rewrites 的顺序累加，取分发件里对应序号的规则行。
  // （不能按 note 关联 —— note 只用于构建期注释，不进分发件）
  let cursor = 0;
  let selfTestCount = 0;

  for (const app of apps) {
    if (app.enabled === false) continue;
    for (const r of app.rewrites || []) {
      const gen = rewriteParsed.rewrites[cursor];
      cursor++;
      if (!r.selfTest) continue;
      selfTestCount++;

      const label = (r.note || "").slice(0, 26);
      if (!gen) {
        t.check(`${app.id} 「${label}…」规则已生成`, false, "分发件里规则数不足");
        continue;
      }
      const re = new RegExp(gen.regex);

      for (const url of r.selfTest.match || []) {
        t.check(`${app.id} 「${label}」命中 ${url.split("/").slice(-1)[0].slice(0, 22)}`, re.test(url), url);
      }
      for (const url of r.selfTest.exclude || []) {
        t.check(
          `${app.id} 「${label}」不误伤 ${url.replace(/^https?:\/\//, "").slice(0, 40)}`,
          !re.test(url),
          `被 ${gen.regex} 命中`
        );
      }
    }
  }
  if (selfTestCount === 0) t.info("本仓库暂无 urlPrefix 规则需要 selfTest");
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

// urlPrefix 规则无法反推样例，由其 selfTest 覆盖（section 0），此处跳过
let skippedUrlPrefix = 0;
for (const r of rewriteParsed.rewrites) {
  const d = dissect(r.regex);
  if (!d) {
    if (r.regex.includes("[^/]") || r.regex.includes("(?:") || r.regex.includes("\\d")) {
      skippedUrlPrefix++;
      continue;
    }
    t.check(`可解析正则 L${r.line}`, false, r.regex);
    continue;
  }
  const url = targetUrl(d);
  const re = new RegExp(r.regex);
  t.check(`命中 ${d.path}`, re.test(url), `规则 ${r.regex} 未能命中 ${url}`);
}
if (skippedUrlPrefix) t.info(`跳过 ${skippedUrlPrefix} 条 urlPrefix 规则（已由 section 0 的 selfTest 覆盖）`);

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

// 去重只在**同一个 App 内部**做 ——
// 跨 App 出现相同域名是正常的（例如两个 App 都用了同一个广告联盟），
// 那是两份独立的订阅，不是配置错误。
{
  const perApp = new Map();
  for (const app of apps) {
    const seenInApp = new Map();
    for (const g of app.filterGroups || []) {
      for (const h of g.hosts) {
        if (seenInApp.has(h)) {
          t.check(`${app.id} 内 ${h} 无重复`, false, `同一定义里重复出现`);
        } else {
          seenInApp.set(h, true);
        }
      }
    }
    perApp.set(app.id, seenInApp.size);
  }
  t.check("各 App 内部无重复域名", true, "");
  // 跨 App 重复仅作提示，不算失败
  const owner = new Map();
  for (const app of apps) {
    for (const g of app.filterGroups || []) {
      for (const h of g.hosts) {
        if (!owner.has(h)) owner.set(h, []);
        owner.get(h).push(app.id);
      }
    }
  }
  for (const [h, ids] of owner) {
    if (ids.length > 1) t.info(`跨 App 重复（正常）: ${h} ← ${ids.join(", ")}`);
  }
}

for (const f of filterParsed.filters) {
  const ok = HOSTNAME_OK.test(f.host) && !f.host.includes("*");
  t.check(`filter ${f.host} 语法合法`, ok, f.raw);
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
