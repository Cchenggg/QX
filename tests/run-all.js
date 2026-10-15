#!/usr/bin/env node
/*
 * 统一测试入口
 *
 *   node tests/run-all.js              跑离线校验（1-2-3 层 + 证据校验）
 *   node tests/run-all.js --online     额外跑线上链接校验（需要能访问 raw / gh-proxy）
 *   node tests/run-all.js --build      先构建再校验
 *
 * CI 用：npm test
 */

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ONLINE = process.argv.includes("--online");

const suites = [
  "test-snippet-format.js",
  "test-rules.js",
  "test-script-contract.js",
  "test-evidence.js",
];

if (ONLINE) suites.push("test-links.js");

async function main() {
  if (process.argv.includes("--build")) {
    console.log("── 先构建 ──");
    execFileSync(process.execPath, [path.join(ROOT, "build.js")], { stdio: "inherit", cwd: ROOT });
    console.log("");
  }

  const results = [];
  for (const s of suites) {
    const abs = path.join(__dirname, s);

    // 关键：清掉 harness 的模块缓存，让每个套件拿到**独立**的计数器。
    // 否则四个套件共享同一实例，失败数会互相累加，汇总全是错的。
    delete require.cache[require.resolve(path.join(__dirname, "lib", "harness.js"))];

    try {
      // 支持同步与异步（异步测试通过导出 Promise 表示完成）
      const exported = require(abs);
      const mod = exported && typeof exported.then === "function" ? await exported : exported;
      results.push(mod && mod.file ? mod : { file: s, failures: 0 });
    } catch (e) {
      console.error(`\n❌ ${s} 崩溃：\n${e.stack}`);
      results.push({ file: s, failures: 1 });
    }
  }

  console.log("\n" + "═".repeat(52));
  console.log("汇总");
  console.log("═".repeat(52));
  let total = 0;
  for (const r of results) {
    const mark = r.failures === 0 ? "✅" : "❌";
    console.log(`  ${mark}  ${String(r.file).padEnd(28)} ${r.failures === 0 ? "通过" : r.failures + " 项失败"}`);
    total += r.failures;
  }
  console.log("═".repeat(52));
  console.log(total === 0 ? "全部校验通过" : `共 ${total} 项失败`);
  process.exit(total === 0 ? 0 : 1);
}

main();
