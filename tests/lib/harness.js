/*
 * 测试框架：零依赖的极简 runner。
 * 用法：const t = require("./lib/harness"); t.section("x"); t.check("y", cond);
 */

let failures = 0;
let checks = 0;
const failedNames = [];

function section(name) {
  console.log(`\n== ${name} ==`);
}

function check(name, cond, detail) {
  checks++;
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    failedNames.push(name);
    console.log(`  FAIL  ${name}${detail ? "  -> " + detail : ""}`);
  }
}

function info(msg) {
  console.log(`  ·     ${msg}`);
}

function warn(msg) {
  console.log(`  WARN  ${msg}`);
}

function getFailures() {
  return failures;
}

function summary() {
  console.log("");
  if (failures === 0) {
    console.log(`✅ 全部通过（${checks} 项断言）`);
  } else {
    console.log(`❌ ${failures}/${checks} 项失败：`);
    for (const n of failedNames) console.log(`   - ${n}`);
  }
  return failures;
}

module.exports = { section, check, info, warn, summary, getFailures };
