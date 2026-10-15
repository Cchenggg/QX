/*
 * 校验文档里出现的所有仓库地址真实可用。
 * 文档精简/重构后最容易出现链接失效，必须实测。
 *
 * 依赖公网，仅在 --online 时真正执行；否则记为通过（不阻塞离线校验）。
 */
const fs = require("fs");
const https = require("https");
const path = require("path");

const t = require("./lib/harness");

const ONLINE = process.argv.includes("--online") || require.main === module;
const ROOT = path.resolve(__dirname, "..");
const DOCS = ["README.md", "CONTRIBUTING.md", "SCRIPTS.md", "apps/_schema.md"];
const PREFIX_OK =
  /^https:\/\/(ghfast\.top\/https:\/\/raw\.githubusercontent\.com|raw\.githubusercontent\.com)\/Cchenggg\/QX\/(main|blob\/main)\//;

function get(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { "User-Agent": "doc-check/1.0" },
        timeout: 15000,
      },
      (res) => {
        let len = 0;
        res.on("data", (c) => (len += c.length));
        res.on("end", () => resolve({ status: res.statusCode, len }));
      }
    );
    req.on("error", (e) => resolve({ status: 0, error: e.code || e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout" });
    });
    req.end();
  });
}

async function main() {
  if (!ONLINE) {
    t.section("文档链接（离线跳过）");
    t.info("需要 --online 才会真正请求，跳过");
    return;
  }

  t.section("文档中本仓库地址的可达性");

  const urls = new Map();
  for (const d of DOCS) {
    const p = path.join(ROOT, d);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, "utf8").matchAll(/https:\/\/[^\s`)\]"'<>]+/g)) {
      const u = m[0].replace(/[.,;]$/, "");
      if (!PREFIX_OK.test(u)) continue;
      if (!urls.has(u)) urls.set(u, []);
      urls.get(u).push(d);
    }
  }

  t.info(`发现 ${urls.size} 个本仓库地址`);

  for (const [u, docs] of urls) {
    const rel = u.replace(/^.*\/QX\/(main|blob\/main)\//, "");
    // blob 地址在文档里是作为反例出现的，200 即符合预期
    const isBlobExample = u.includes("/blob/");
    const r = await get(u);
    t.check(
      `${rel}${isBlobExample ? "（文档反例）" : ""} 可达`,
      r.status === 200,
      `status=${r.status} ${r.error || ""}  引用位置: ${docs.join(", ")}`
    );
  }
}

module.exports = main().then(() => ({ file: "test-doc-links.js", failures: t.getFailures() }));
