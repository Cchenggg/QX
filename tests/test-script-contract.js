/*
 * 第 3 层校验：脚本与规则的契约
 *
 * 这一层防的是最隐蔽的一类故障：**规则改了但脚本没改（或反之）**。
 * 规则把某个接口的响应交给脚本，脚本却因为路径守卫不匹配直接放行 ——
 * 表面上一切正常，广告照旧，日志里也看不出来。
 *
 * 校验内容：
 *   1. apps/*.js 的 rewrites[].path 与脚本导出的 MATCH_PATHS 一一对应
 *   2. logTag 与脚本内 TAG 一致
 *   3. 每个受守卫路径真的被改写了（用 fixtures 的真实形状数据驱动）
 *   4. 非守卫路径（含同前缀干扰）必须原样放行
 *   5. 异常输入不崩溃
 */

const fs = require("fs");
const path = require("path");
const t = require("./lib/harness");

const { ROOT, loadApps } = require("../src/manifest");
const qx = require("./lib/qx-harness");

const apps = loadApps();

/** 收集 manifest 声明的「脚本 → 路径集合」 */
function manifestContract() {
  const map = new Map(); // script -> Set(path)
  for (const app of apps) {
    for (const r of app.rewrites || []) {
      if (!r.action || !r.action.startsWith("script-")) continue;
      if (!map.has(r.script)) map.set(r.script, new Set());
      map.get(r.script).add(r.path);
    }
  }
  return map;
}

const declared = manifestContract();

t.section("1. 每个出场脚本都必须有 fixtures");

for (const script of declared.keys()) {
  const fx = path.join(ROOT, "apps-scripts", script.replace(/\.js$/, ".fixtures.js"));
  t.check(`${script} 有配套 fixtures`, fs.existsSync(fx), "新增脚本时必须同时加 apps-scripts/<name>.fixtures.js");
}

t.section("2. rewrites[].path 与 MATCH_PATHS 必须一一对应");

for (const [script, paths] of declared) {
  const actual = qx.readMatchPaths(script);
  if (actual === null) {
    t.check(`${script} 导出了 MATCH_PATHS`, false, "脚本缺少 MATCH_PATHS 声明，契约测试无法校验");
    continue;
  }

  const expect = [...paths].sort();
  const got = [...new Set(actual)].sort();

  const missing = expect.filter((p) => !got.includes(p));
  const orphan = got.filter((p) => !expect.includes(p));

  t.check(`${script} 规则路径均在 MATCH_PATHS 内`, missing.length === 0, `规则声明但脚本未守卫: ${missing.join(", ")}`);
  t.check(`${script} MATCH_PATHS 无孤儿路径`, orphan.length === 0, `脚本守卫但规则未声明: ${orphan.join(", ")}`);
  t.check(`${script} MATCH_PATHS 无重复`, actual.length === got.length, "存在重复项");
}

t.section("3. logTag 与脚本内 TAG 一致");

for (const app of apps) {
  for (const script of app.scripts || []) {
    const tag = qx.readTag(script);
    t.check(`${script} 能读到 TAG`, tag !== null);
    t.check(`${app.id} logTag 与 ${script} 的 TAG 一致`, tag === app.logTag, `manifest="${app.logTag}" 脚本="${tag}"`);
  }
}

t.section("4. 每个守卫路径必须真的被改写（数据驱动）");

for (const [script, paths] of declared) {
  const fxPath = path.join(ROOT, "apps-scripts", script.replace(/\.js$/, ".fixtures.js"));
  if (!fs.existsSync(fxPath)) continue;
  const fx = require(fxPath);

  // fixtures 覆盖度
  const fxPaths = Object.keys(fx.paths || {});
  const uncovered = [...paths].filter((p) => !fxPaths.includes(p));
  t.check(`${script} fixtures 覆盖全部守卫路径`, uncovered.length === 0, `缺: ${uncovered.join(", ")}`);

  const extra = fxPaths.filter((p) => !paths.has(p));
  t.check(`${script} fixtures 无多余路径`, extra.length === 0, `多余: ${extra.join(", ")}`);

  const host = (apps.find((a) => (a.scripts || []).includes(script)) || {}).hosts?.[0] || "example.com";

  for (const [p, spec] of Object.entries(fx.paths || {})) {
    const url = `https://${host}${p}?ver=1&nonce=AB12CD`;
    const { result } = qx.run(script, url, spec.sample);

    if (!result || typeof result.body !== "string") {
      t.check(`${p} 被脚本改写`, false, "脚本未返回改写后的 body");
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(result.body);
    } catch (e) {
      t.check(`${p} 改写结果是合法 JSON`, false, e.message);
      continue;
    }

    const checks = typeof spec.assert === "function" ? spec.assert(parsed) : [];
    for (const [name, ok, detail] of checks) {
      t.check(`${p} ${name}`, !!ok, detail);
    }
  }
}

t.section("5. 非守卫路径必须原样放行");

for (const [script] of declared) {
  const fxPath = path.join(ROOT, "apps-scripts", script.replace(/\.js$/, ".fixtures.js"));
  if (!fs.existsSync(fxPath)) continue;
  const fx = require(fxPath);
  const host = (apps.find((a) => (a.scripts || []).includes(script)) || {}).hosts?.[0] || "example.com";

  for (const c of fx.passthrough || []) {
    const { result } = qx.run(script, `https://${host}${c.path}?x=1`, c.body);
    t.check(`${c.note} 原样放行`, JSON.stringify(result) === "{}", `实际返回: ${JSON.stringify(result)}`);
  }
}

t.section("6. 异常输入不得崩溃");

for (const [script] of declared) {
  const fxPath = path.join(ROOT, "apps-scripts", script.replace(/\.js$/, ".fixtures.js"));
  if (!fs.existsSync(fxPath)) continue;
  const fx = require(fxPath);
  const host = (apps.find((a) => (a.scripts || []).includes(script)) || {}).hosts?.[0] || "example.com";

  for (const c of fx.robustness || []) {
    let threw = null;
    let result = null;
    try {
      result = qx.run(script, `https://${host}${c.path}?x=1`, c.body).result;
    } catch (e) {
      threw = e;
    }
    t.check(`${c.note}`, threw === null && result && typeof result === "object", threw ? threw.message : JSON.stringify(result));
  }

  // 无 $response（request 阶段）也不能崩
  let threw = null;
  try {
    qx.run(script, `https://${host}/anything`, undefined);
  } catch (e) {
    threw = e;
  }
  t.check(`无 $response 时不崩溃`, threw === null, threw ? threw.message : "");
}

module.exports = { file: "test-script-contract.js", failures: t.getFailures() };
