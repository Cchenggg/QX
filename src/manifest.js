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
 * 前缀策略（实测结论见 README「地址选择」）：
 *   raw.githubusercontent.com 直连 5/6，失败时卡 15s；
 *   ghfast.top  直连 6/6，1.1~1.4s，且内容与仓库**即时**同步；
 *   gh-proxy.com 直连 6/6，但带 60s 的 CDN 缓存（age/max-age=60），
 *                刚推送后短时间会拿到旧版本，故不作首选。
 * 默认用 ghfast.top，保证「QX 不走代理」也能拉到，且更新即时。
 */
const prefix = {
  mode: "ghfast", // "ghfast" | "gh-proxy" | "raw"
  proxies: {
    "ghfast": "https://ghfast.top/",
    "gh-proxy": "https://gh-proxy.com/",
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
