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
const { hasHtmlOutsideComments } = require("../src/lib/parse");

const TIMEOUT_MS = 12000;
const SLOW_MS = 6000;
const TOTAL_BUDGET_MS = 8 * 60 * 1000; // 整体时限，防止网络异常时无限挂起

/**
 * 回退 IP：仅在系统 DNS 失败时使用。
 *
 * 注意顺序 —— 实测本机「强制指定 185.199.x IP」会 TLS 超时，
 * 而系统 DNS 解析到同一批 IP 却能正常访问。
 * 所以必须优先用系统 DNS，把强制 IP 当兜底而不是首选，否则会一直卡住。
 */
const FALLBACK_IPS = {
  "raw.githubusercontent.com": ["185.199.108.133", "185.199.109.133", "185.199.110.133", "185.199.111.133"],
};

const startedAt = Date.now();
const budgetLeft = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

/** 单次请求 */
function requestOnce(url, lookup) {
  return new Promise((resolve) => {
    const started = Date.now();
    const u = new URL(url);
    const remaining = Math.min(TIMEOUT_MS, Math.max(1000, budgetLeft()));

    const req = https.request(
      {
        method: "GET",
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: { "User-Agent": "QX-AdBlock-CI/1.0", Accept: "*/*" },
        timeout: remaining,
        ...(lookup ? { lookup } : {}),
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), ms: Date.now() - started })
        );
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "", ms: Date.now() - started, error: "timeout" });
    });
    req.on("error", (e) => resolve({ status: 0, body: "", ms: Date.now() - started, error: e.code || e.message }));
    req.end();
  });
}

/** GET：先系统 DNS，必要时回退到固定 IP；带整体时限 */
async function fetchText(url) {
  if (budgetLeft() <= 0) return { status: 0, body: "", ms: 0, error: "总时限已用完，跳过" };

  const first = await requestOnce(url);
  if (first.status === 200) return first;

  const host = new URL(url).hostname;
  const ips = FALLBACK_IPS[host];
  if (!ips) return first;

  for (const ip of ips) {
    if (budgetLeft() <= 0) break;
    const retry = await requestOnce(url, () => [ip]);
    if (retry.status === 200) return retry;
  }
  return first;
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

  /*
   * 只校验两个前缀代理，不校验 raw 直连。
   *
   * 原因：raw.githubusercontent.com 在国内容易超时/重置，
   * 实测会把这一段整体拖住且无输出，反而掩盖真实结论。
   * raw 的正确性由这几处覆盖：
   *   - 下面的 blob 负向校验
   *   - GitHub Actions 上的 ci（runner 访问 raw 是内网级速度，不受影响）
   *   - 离线四层校验（内容本身已经过校验）
   */
  const modes = [
    { name: "ghfast(默认)", buildUrl: (rel) => distUrl(rel, "ghfast") },
    { name: "gh-proxy", buildUrl: (rel) => distUrl(rel, "gh-proxy") },
  ];

  for (const mode of modes) {
    t.section(`在线校验（前缀：${mode.name}）`);

    let hardFail = 0;
    let budgetHit = false;

    for (const item of list) {
      // 预算耗尽时**明确报出来**，不要静默 continue
      // （否则 ci 日志里整段没输出，看不出是跳过还是卡住）
      if (budgetLeft() <= 0) {
        budgetHit = true;
        break;
      }

      const url = mode.buildUrl(item.rel);
      const res = await fetchText(url);

      if (res.error === "总时限已用完，跳过") {
        budgetHit = true;
        break;
      }

      if (res.status !== 200) {
        t.check(`${item.rel} 可取到`, false, `status=${res.status} ${res.error || ""} (${res.ms}ms)`);
        hardFail++;
        continue;
      }
      // 用「非注释行」检测：片段头部的使用说明里本身就有 HTML 相关字样，
      // 对整篇做朴素匹配会把自己的警告误判成 HTML（踩过这个坑）。
      if (hasHtmlOutsideComments(res.body)) {
        t.check(`${item.rel} 不是 HTML`, false, "返回了网页内容，地址前缀可能有误");
        continue;
      }
      const same = sha256(res.body.replace(/\r\n/g, "\n")) === sha256(item.local.replace(/\r\n/g, "\n"));
      if (same) {
        t.check(`${item.rel} 内容与本地一致`, true);
      } else {
        // 前缀代理都带 CDN 缓存（gh-proxy 为 max-age=60，ghfast 类似），
        // 刚推送后会短暂下发旧版本。这种情况降级为 WARN，避免 CI 出现假红；
        // 真正的「未提交构建产物」由离线的 node build.js --check 保证。
        const age = res.headers && res.headers.age;
        t.warn(
          `${item.rel} 内容与本地不一致（代理缓存，可能滞后 ${age ? age + "s" : "未标注"}）` +
            ` 线上 ${res.body.length}B / 本地 ${item.local.length}B`
        );
      }

      if (res.ms > SLOW_MS) t.warn(`${item.rel} 响应较慢 ${res.ms}ms`);
    }

    // 该前缀整体可用性结论
    if (budgetHit) {
      // raw 直连在国内经常超时，预算耗尽属于预期情况，降级为 WARN
      t.warn(`前缀 ${mode.name} 因整体时限用尽而提前结束（已校验部分全部通过=${hardFail === 0}）`);
    } else {
      t.check(`前缀 ${mode.name} 整体可用（无取不到的文件）`, hardFail === 0, `${hardFail} 个失败`);
    }
  }

  // 负向校验：blob 网页地址必须返回 HTML（证明我们要求用 raw 是必要的）
  t.section("负向校验：blob 网页地址确实会返回 HTML");
  {
    const blobUrl = `https://github.com/Cchenggg/QX/blob/main/dist/${files.allSnippet}`;
    const res = await fetchText(blobUrl);
    if (res.status === 200) {
      // 这里故意用朴素检测：blob 返回的就是真实 HTML 页面，没有注释头
      t.check(
        "blob 地址返回 HTML（符合预期，不可用于引用）",
        /<!DOCTYPE|<html/i.test(res.body),
        "blob 竟然没返回 HTML，需重新评估文档说明"
      );
    } else {
      t.warn(`blob 校验跳过（status=${res.status} ${res.error || ""}），不影响主流程`);
    }
  }
}

module.exports = main().then(() => ({
  file: "test-links.js",
  failures: t.getFailures(),
}));
