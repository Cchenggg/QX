/*
 * 仓库元信息 + App 汇总
 *
 * 这里只放「全局」内容：仓库地址、前缀策略、分发文件名。
 * 单个 App 的一切都在 apps/<id>.js 里，不要在别处重复定义。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const repo = {
  owner: "Cchenggg",
  name: "QX",
  branch: "main",
  tagline: "多 App 去广告规则集合（Quantumult X）",
};

/*
 * 前缀策略（实测结论见 SCRIPTS.md）：
 *   raw.githubusercontent.com 直连 5/6 成功，失败时卡 15s；
 *   gh-proxy.com / ghfast.top 直连 6/6，0.7~1.4s。
 * 所以默认走 gh-proxy，保证「QX 不走代理」也能拉到。
 */
const prefix = {
  mode: "gh-proxy", // "gh-proxy" | "raw"
  proxies: {
    "gh-proxy": "https://gh-proxy.com/",
    "ghfast": "https://ghfast.top/",
  },
  rawHost: "https://raw.githubusercontent.com",
};

/** 仓库内任意路径 → raw 地址 */
function rawUrl(relPath) {
  return `${prefix.rawHost}/${repo.owner}/${repo.name}/${repo.branch}/${relPath.replace(/^\/+/, "")}`;
}

/** 仓库内任意路径 → 分发件里实际写入的地址（带前缀） */
function distUrl(relPath, mode = prefix.mode) {
  const raw = rawUrl(relPath);
  return mode === "raw" ? raw : prefix.proxies[mode] + raw;
}

/** 分发件文件名（唯一处定义，改名只需动这里） */
const FILES = {
  allSnippet: "AdBlock-All.snippet",
  allFilterSnippet: "AdBlock-Filter.snippet",
  allConf: "AdBlock-All.conf",

  // 兼容别名：老用户 QX 里已经引用了这三个地址，保持内容为聚合版
  legacy: {
    "rewrite.snippet": "AdBlock-All.snippet",
    "filter.snippet": "AdBlock-Filter.snippet",
    "rewrite.conf": "AdBlock-All.conf",
  },

  appSnippet: (id) => `${id}.snippet`,
  appFilterSnippet: (id) => `${id}-filter.snippet`,
  appConf: (id) => `${id}.conf`,

  generatedBy: "此文件由 build.js 从 apps/*.js 生成，请勿手动修改。",
};

/** 载入 apps/ 下所有定义，按 id 排序（保证构建确定性） */
function loadApps() {
  const dir = path.join(ROOT, "apps");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => {
      const mod = require(path.join(dir, f));
      const id = path.basename(f, ".js");
      if (mod.id !== id) {
        throw new Error(`apps/${f}: id ("${mod.id}") 必须与文件名 ("${id}") 一致`);
      }
      return mod;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = { ROOT, repo, prefix, rawUrl, distUrl, FILES, loadApps };
