/*
 * 第 4 层校验：抓包证据交叉校验
 *
 * 目的：把「域名拼写错误」这类**静默失效**变成构建期失败。
 *
 * 背景：曾经把 adsmartget.guangtuikeji.com 打成 adsmartget.guangtuakeji.com，
 * 结果这条规则永远匹配不到请求 —— 不报错、不崩溃，就是没用。
 * 只有拿真实抓包做交叉校验才能发现。
 *
 * 每个被拦域名都必须能在 docs/<app>/har-index.tsv 里找到。
 * 确实需要拦截但抓包中没有的域名，要在 apps/<id>.js 里显式写
 * evidenceExempt: ["域名"] 并说明原因，不能悄悄放过。
 */

const fs = require("fs");
const path = require("path");
const t = require("./lib/harness");

const { ROOT, loadApps } = require("../src/manifest");

const apps = loadApps();

t.section("1. 每个声明了拦截域名的 App 都必须提供抓包证据文件");

for (const app of apps) {
  const groups = app.filterGroups || [];
  if (groups.length === 0) continue;

  if (!app.evidence) {
    t.check(`${app.id} 声明了 evidence`, false, "有 filterGroups 但没有 evidence 字段");
    continue;
  }
  const p = path.join(ROOT, "docs", app.evidence);
  t.check(`${app.id} 证据文件存在 (docs/${app.evidence})`, fs.existsSync(p));
}

t.section("2. 每个被拦域名都必须有抓包证据");

for (const app of apps) {
  if (!app.evidence) continue;
  const p = path.join(ROOT, "docs", app.evidence);
  if (!fs.existsSync(p)) continue;

  const evidence = fs.readFileSync(p, "utf8").toLowerCase();
  const exempt = new Set((app.evidenceExempt || []).map((s) => s.toLowerCase()));
  const allHosts = (app.filterGroups || []).flatMap((g) => g.hosts);

  const missing = allHosts.filter((h) => !evidence.includes(h.toLowerCase()) && !exempt.has(h.toLowerCase()));

  t.check(
    `${app.id}: ${allHosts.length} 个拦截域名全部有抓包证据`,
    missing.length === 0,
    `无证据: ${missing.join(", ")}\n         → 若确认要拦，请在 apps/${app.id}.js 加 evidenceExempt 并说明原因；否则很可能是拼写错误`
  );

  // 逐域名一条断言，失败时能直接看出是哪一个
  for (const h of allHosts) {
    if (exempt.has(h.toLowerCase())) {
      t.check(`${app.id}: ${h}（已声明豁免）`, true);
      continue;
    }
    t.check(`${app.id}: ${h} 有证据`, evidence.includes(h.toLowerCase()));
  }
}

t.section("3. MITM 主机名也应有抓包证据（防止 hostname 写错）");

for (const app of apps) {
  if (!app.evidence) continue;
  const p = path.join(ROOT, "docs", app.evidence);
  if (!fs.existsSync(p)) continue;
  const evidence = fs.readFileSync(p, "utf8").toLowerCase();

  for (const h of app.hosts || []) {
    t.check(`${app.id}: MITM ${h} 有证据`, evidence.includes(h.toLowerCase()));
  }
}

t.section("4. 抓包证据文件不得为空或明显损坏");

for (const app of apps) {
  if (!app.evidence) continue;
  const p = path.join(ROOT, "docs", app.evidence);
  if (!fs.existsSync(p)) continue;

  const text = fs.readFileSync(p, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  t.check(`${app.id} 证据文件非空`, lines.length > 10, `仅 ${lines.length} 行`);
  t.check(`${app.id} 证据文件含 URL`, /https?:\/\//.test(text), "看起来不是抓包索引格式");
}

module.exports = { file: "test-evidence.js", failures: t.getFailures() };
