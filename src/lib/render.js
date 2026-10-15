/*
 * 渲染器：把 apps/*.js 渲染成 QX 可用的分发件文本。
 *
 * 三条不可协商的规则都在这里强制：
 *   1. 重写正则末尾强制追加 [\/?] 边界（防前缀误伤）
 *   2. 片段文件绝不输出 [section] 标题（防 Invalid Line [rewrite_local]）
 *   3. 域名集中渲染，App 定义里不出现手写域名行（防拼写错误）
 */

const { FILES } = require("../manifest");

/** 正则转义：QX 规则里的 / . ? + 等需转义 */
function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
}

/**
 * 编译一条重写规则的正则。
 * host + path → ^https?:\/\/<host><path>[\/?]
 * 末尾边界强制附加，App 定义里不允许写正则。
 */
function compileRewriteRegex(host, apiPath) {
  // 以 $ 结尾表示纯 host 匹配，不加路径
  const body = apiPath === "$" ? "" : esc(apiPath);
  return `^https?:\\/\\/${esc(host)}${body}[/?]`;
}

/**
 * 编译 URL 前缀规则的正则。
 *
 * 用于「同一域名下只有部分路径是广告」的场景 —— 例如百度网盘的 CDN
 * proxy 域名同时承载开屏素材(/e/)与 App 渲染引擎(/b/render_resourcd.zip)，
 * 整域拦截会误伤核心功能，必须按路径精确切分。
 *
 * 占位符（先分段转义再拼接，避免 esc() 把占位符本身转义掉）：
 *   {OPT_SUB} 可选子域名        → (?:[^/]*\.)?
 *   {ANY}     单层任意段        → [^/]*
 *   {ANYDIR}  多层任意目录段    → (?:[^/]*\/)*
 *   {HOST}    任意主机名        → [^/]+
 *
 * ⚠️ 不要在模式里直接写正则语法（括号、? 、* 等）—— 会被 esc() 转义成字面量。
 *    需要什么结构就用对应占位符。
 */
const PLACEHOLDER = /(\{OPT_SUB\}|\{ANYDIR\}|\{ANY\}|\{HOST\})/;

function compilePrefixRegex(hostPattern, urlPattern, stopAfter) {
  const expand = (s) =>
    s
      .split(PLACEHOLDER)
      .map((part) => {
        if (part === "{OPT_SUB}") return "(?:[^/]*\\.)?";
        if (part === "{ANYDIR}") return "(?:[^/]*\\/)*";
        if (part === "{ANY}") return "[^/]*";
        if (part === "{HOST}") return "[^/]+";
        return esc(part);
      })
      .join("");

  let re = "^https?:\\/\\/";
  re += expand(hostPattern);
  // 主机名后允许可选端口（素材 CDN 形如 xxx.antpcdn.com:19001）
  if (!/\$$/.test(urlPattern) && urlPattern !== "") re += "(?::\\d+)?";
  re += expand(urlPattern);
  // 默认允许后面还有内容（只锚定开头，做成前缀匹配）；
  // stopAfter:true 时才要求 URL 在此结束，用于精确到某个端点的场景。
  if (stopAfter) re += "(?:\\?|$)";
  return re;
}

/** 展开某个 App 的重写规则 → 文本行数组 */
function rewriteLines(app, distUrl) {
  const out = [];
  for (const r of app.rewrites || []) {
    // ── 模式 1：host × path（常规接口改写）──
    if (r.path != null) {
      for (const host of app.hosts || []) {
        const regex = compileRewriteRegex(host, r.path);
        out.push({ line: actionLine(regex, r, distUrl), note: r.note, path: r.path, host });
      }
      continue;
    }
    // ── 模式 2：urlPrefix（精确到路径的拦截，用于同域混用场景）──
    if (r.urlPrefix != null) {
      const regex = compilePrefixRegex(r.urlPrefix, r.urlPattern || "", r.stopAfter);
      out.push({ line: actionLine(regex, r, distUrl), note: r.note, urlPattern: r.urlPattern });
      continue;
    }
    throw new Error(`rewrites 项必须含 path 或 urlPrefix：${JSON.stringify(r)}`);
  }
  return out;
}

/** 把正则 + 动作拼成一行 QX 规则 */
function actionLine(regex, r, distUrl) {
  if (r.action && r.action.startsWith("script-")) {
    // 远程片段里的脚本路径必须是绝对 URL，相对路径 QX 解析不到
    return `${regex} url ${r.action} ${distUrl(`apps-scripts/${r.script}`)}`;
  }
  if (r.action === "reject") return `${regex} url reject`;
  return `${regex} url ${r.action}${r.target ? " " + r.target : ""}`;
}

/** 展开某个 App 的域名拦截 → 文本行数组（保留分组注释） */
function filterGroups(app) {
  return (app.filterGroups || []).map((g) => ({
    note: g.note,
    lines: g.hosts.map((h) => `host, ${h}, reject`),
  }));
}

function comment(text) {
  return String(text)
    .split("\n")
    .map((l) => `; ${l}`.trimEnd())
    .join("\n");
}

/**
 * 生成 .snippet（给 QX 引用用）
 *
 * ⚠️ 绝不输出 [section] 标题。QX 的引用只接受纯规则列表 +
 *    可选的 hostname 行（依据官方 sample-import-rewrite.snippet）。
 */
function renderSnippet({ title, usage, apps, hostname = [], kind = "rewrite", distUrl }) {
  const L = [];

  L.push("; " + "=".repeat(67));
  L.push(`; ${title}`);
  L.push(";");
  L.push(`; 【用法】QX → 设置 → ${usage.where} → 引用 → 添加，填：`);
  L.push(`;   ${usage.url}`);
  L.push(";");
  L.push("; 【注意】本文件是纯规则列表，不含 [section] 标题。");
  L.push("; 不要引用 .conf 配置文件，否则 QX 会报 Invalid Line [rewrite_local]。");
  L.push("; 不要用 github.com/.../blob/... 网页地址（那是给人看的 HTML 页面），");
  L.push("; 否则 QX 会报 Invalid Line（读到网页首行的 DOCTYPE）。必须用 raw 地址。");
  L.push(";");
  L.push(`; ${FILES.generatedBy}`);
  L.push(`; 来源：${apps.map((a) => `apps/${a.id}.js`).join(", ")}`);
  L.push("; " + "=".repeat(67));
  L.push("");

  if (kind === "rewrite" && hostname.length) {
    L.push("; ── MITM 主机名（随引用自动生效，无需手动加到 设置→MitM）──");
    L.push(`hostname = ${hostname.join(", ")}`);
    L.push("");
  }

  for (const app of apps) {
    L.push(`; ── ${app.name}去广告${kind === "filter" ? "：广告联盟域名拦截" : ""} ──`);
    L.push("");
    if (kind === "filter") {
      for (const g of filterGroups(app)) {
        L.push(comment(g.note).replace(/^; /, "; "));
        for (const line of g.lines) L.push(line);
        L.push("");
      }
      if (app.filterExempt && app.filterExempt.length) {
        L.push("; 明确放行（不拦截）：");
        L.push(`; ${app.filterExempt.join(" / ")}`);
        if (app.filterExemptNote) L.push(`; 原因：${app.filterExemptNote}`);
        L.push("");
      }
    } else {
      for (const item of rewriteLines(app, distUrl)) {
        if (item.note) L.push(`; ${item.note}`);
        L.push(item.line);
      }
      L.push("");
    }
  }

  return L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/**
 * 生成 .conf（给人手动复制粘贴用）
 *
 * 这个文件**故意**含 [section] 标题 —— 它是手动导入用的，
 * 不可用于 QX 引用。tests/test-snippet-format.js 会断言这一点。
 */
function renderConf({ apps, distUrl }) {
  const L = [];
  const hostnames = [];
  for (const app of apps) for (const h of app.hosts || []) if (!hostnames.includes(h)) hostnames.push(h);

  L.push("# " + "=".repeat(67));
  L.push("# 多 App 去广告 — Quantumult X 完整配置（手动复制粘贴用）");
  L.push("#");
  L.push("# ⚠️ 本文件含 [section] 标题，**不能**用于 QX「引用」，会报 Invalid Line [rewrite_local]。");
  L.push("#    要引用请用 AdBlock-All.snippet + AdBlock-Filter.snippet。");
  L.push("#");
  L.push(`# ${FILES.generatedBy}`);
  L.push("# " + "=".repeat(67));
  L.push("");
  L.push("# -------------------------------------------------------------------");
  L.push("# [rewrite_local] 改写接口响应");
  L.push("# -------------------------------------------------------------------");
  L.push("[rewrite_local]");
  L.push("");
  for (const app of apps) {
    L.push(`# ── ${app.name}去广告 ──`);
    for (const item of rewriteLines(app, distUrl)) {
      if (item.note) L.push(`# ${item.note}`);
      L.push(item.line);
    }
    L.push("");
  }
  L.push("");
  L.push("# -------------------------------------------------------------------");
  L.push("# [filter_local] 域名拦截（DNS 层 reject，不需要 MITM）");
  L.push("# -------------------------------------------------------------------");
  L.push("[filter_local]");
  L.push("");
  for (const app of apps) {
    for (const g of filterGroups(app)) {
      L.push(`# ${g.note}`);
      for (const line of g.lines) L.push(line);
      L.push("");
    }
  }
  L.push("");
  L.push("# -------------------------------------------------------------------");
  L.push("# [mitm] 需要解密的主机名（追加到已有 hostname，不要覆盖）");
  L.push("# -------------------------------------------------------------------");
  L.push("[mitm]");
  L.push("");
  L.push(`hostname = ${hostnames.join(", ")}`);
  L.push("");
  return L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

module.exports = { renderSnippet, renderConf, compileRewriteRegex, rewriteLines, filterGroups, esc };
