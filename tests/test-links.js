/*
 * 第 4 层（在线）校验：链接可用性 + 内容一致性
 *
 * 只在 --online 时运行。
 *
 * 校验：
 *   - 每个分发件的 gh-proxy / raw 地址都能取到
 *   - 返回的不是 HTML 页面（防 blob 地址那类错误）
 *   - 返回内容与本地文件 SHA256 一致（防 dist/ 未提交 / 拉到的不是同一版本）
 *   - 响应时间在阈值内
 *
 * 实现说明：用纯 node:https，不调用 curl。
 * 因为拿子进程输出走管道在受限沙箱下会 EPERM；
 * 同时这样也能用 lookup 强制指定 IP，绕过 raw.githubusercontent.com 的 DNS 污染。
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const t = require("./lib/harness");

const { ROOT, files } = (() => {
  const manifest = require("../src/manifest");
  return { ROOT: manifest.ROOT, files: manifest.FILES };
})();
const { distUrl } = require("../src/manifest");

const TIMEOUT_MS = 15000;
const SLOW_MS = 6000;

/** 已知可用的 GitHub IP，用于绕过 DNS 污染 */
const FALLBACK_IPS = {
  "raw.githubusercontent.com": ["185.199.108.133", "185.199.109.133", "185.199.110.133", "185.199.111.133"],
  "gh-proxy.com": [],
  "ghfast.top": [],
};

function cacheableLookup(hostname) {
  const ips = FALLBACK_IPS[hostname];
  return ips && ips.length ? () => ips : undefined;
}

/** GET 一次，返回 { status, body, ms, error } */
function fetchText(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    const u = new URL(url);
    const lookup = cacheableLookup(u.hostname);

    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: { "User-Agent": "QX-AdBlock-CI/1.0", Accept: "*/*" },
        timeout: TIMEOUT_MS,
        ...(lookup ? { lookup } : {}),
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            ms: Date.now() - started,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "", ms: Date.now() - started, error: "timeout" });
    });
    req.on("error", (e) => {
      resolve({ status: 0, body: "", ms: Date.now() - started, error: e.message });
    });
    req.end();
  });
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/** 需要校验的目标：dist/ 下所有文件 + 根目录兼容别名 + 所有脚本 */
function targets() {
  const list = [];
  const add = (rel) => {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) list.push({ rel, local: fs.readFileSync(abs, "utf8") });
  };

  const distDir = path.join(ROOT, "dist");
  for (const f of fs.readdirSync(distDir)) {
    if (f.startsWith(".")) continue;
    add(`dist/${f}`);
  }
  for (const alias of Object.keys(files.legacy)) add(alias);

  const scriptsDir = path.join(ROOT, "apps-scripts");
  for (const f of fs.readdirSync(scriptsDir)) {
    if (f.endsWith(".js") && !f.endsWith(".fixtures.js")) add(`apps-scripts/${f}`);
  }

  return list;
}

async function main() {
  const list = targets();
  t.info(`待校验 ${list.length} 个文件（每种前缀各一次）`);
  t.info("");

  const modes = [
    { name: "gh-proxy", buildUrl: (rel) => distUrl(rel, "gh-proxy") },
    { name: "raw", buildUrl: (rel) => distUrl(rel, "raw") },
  ];

  for (const mode of modes) {
    t.section(`在线校验（前缀：${mode.name}）`);

    let hardFail = 0;
    for (const item of list) {
      const url = mode.buildUrl(item.rel);
      const res = await fetchText(url);

      if (res.status !== 200) {
        t.check(`${item.rel} 可取到`, false, `status=${res.status} ${res.error || ""} (${res.ms}ms)`);
        hardFail++;
        continue;
      }
      if (/<!DOCTYPE|<html/i.test(res.body)) {
        t.check(`${item.rel} 不是 HTML`, false, "返回了网页内容，地址前缀可能有误");
        continue;
      }
      const same = sha256(res.body.replace(/\r\n/g, "\n")) === sha256(item.local.replace(/\r\n/g, "\n"));
      t.check(`${item.rel} 内容与本地一致`, same, "线上与本地 dist/ 不一致（可能未提交构建产物）");

      if (res.ms > SLOW_MS) t.warn(`${item.rel} 响应较慢 ${res.ms}ms`);
    }

    // 该前缀整体可用性结论
    t.check(`前缀 ${mode.name} 整体可用（无取不到的文件）`, hardFail === 0, `${hardFail} 个失败`);
  }

  // 负向校验：blob 网页地址必须返回 HTML（证明我们要求用 raw 是必要的）
  t.section("负向校验：blob 网页地址确实会返回 HTML");
  {
    const blobUrl = `https://github.com/Cchenggg/QX/blob/main/dist/${files.allSnippet}`;
    const res = await fetchText(blobUrl);
    if (res.status === 200) {
      t.check("blob 地址返回 HTML（符合预期，不可用于引用）", /<!DOCTYPE|<html/i.test(res.body), "blob 竟然没返回 HTML，需重新评估文档说明");
    } else {
      t.warn(`blob 校验跳过（status=${res.status} ${res.error || ""}），不影响主流程`);
    }
  }
}

module.exports = main().then(() => ({
  file: "test-links.js",
  failures: t.getFailures(),
}));
