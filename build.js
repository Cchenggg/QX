#!/usr/bin/env node
/*
 * 构建：apps/*.js → dist/*  +  根目录兼容别名
 *
 *   node build.js            生成文件
 *   node build.js --check    只校验（不写盘），dist/ 与 apps/ 不一致则非零退出
 *
 * 设计原则：
 *   - 确定性：不写入时间戳等易变内容，同一输入必得同一输出
 *   - 单向：只从 apps/ 流向 dist/，绝不反向
 *   - 可校验：--check 保证 CI 能发现「改了 apps/ 却没重新构建」
 */

const fs = require("fs");
const path = require("path");

const { ROOT, FILES, loadApps, distUrl } = require("./src/manifest");
const { renderSnippet, renderConf } = require("./src/lib/render");

const CHECK_ONLY = process.argv.includes("--check");

/** 收集需要 MITM 的域名（去重、保持顺序） */
function mitmHosts(apps) {
  const out = [];
  for (const app of apps) {
    for (const h of app.hosts || []) if (!out.includes(h)) out.push(h);
  }
  return out;
}

/** 用当前 prefix 策略构建出「路径 → 内容」映射 */
function build(mode) {
  const all = loadApps();
  const enabled = all.filter((a) => a.enabled !== false);
  const url = (p) => distUrl(p, mode);

  const files = {};

  // ① 聚合重写片段（自带 hostname → MITM 随引用生效）
  files[`dist/${FILES.allSnippet}`] = renderSnippet({
    title: `多 App 去广告 — 重写聚合片段（${enabled.length} 个 App）`,
    usage: {
      where: "重写",
      url: url(`dist/${FILES.allSnippet}`),
    },
    apps: enabled,
    hostname: mitmHosts(enabled),
    kind: "rewrite",
    distUrl: url,
  });

  // ② 聚合过滤器片段
  files[`dist/${FILES.allFilterSnippet}`] = renderSnippet({
    title: `多 App 去广告 — 过滤器聚合片段（${enabled.length} 个 App）`,
    usage: {
      where: "过滤器",
      url: url(`dist/${FILES.allFilterSnippet}`),
    },
    apps: enabled,
    kind: "filter",
    distUrl: url,
  });

  // ③ 手动导入用完整配置
  files[`dist/${FILES.allConf}`] = renderConf({ apps: enabled, distUrl: url });

  // ④ 单 App 片段（子集订阅 + 排查用；不受 enabled 影响）
  for (const app of all) {
    files[`dist/${FILES.appSnippet(app.id)}`] = renderSnippet({
      title: `${app.displayName} 去广告 — 重写片段`,
      usage: { where: "重写", url: url(`dist/${FILES.appSnippet(app.id)}`) },
      apps: [app],
      hostname: app.hosts || [],
      kind: "rewrite",
      distUrl: url,
    });
    files[`dist/${FILES.appFilterSnippet(app.id)}`] = renderSnippet({
      title: `${app.displayName} 去广告 — 过滤器片段`,
      usage: { where: "过滤器", url: url(`dist/${FILES.appFilterSnippet(app.id)}`) },
      apps: [app],
      kind: "filter",
      distUrl: url,
    });
    files[`dist/${FILES.appConf(app.id)}`] = renderConf({ apps: [app], distUrl: url });
  }

  // ⑤ 根目录兼容别名：老用户已配置的引用地址不变，内容升级为聚合版
  for (const [alias, target] of Object.entries(FILES.legacy)) {
    files[alias] = files[`dist/${target}`];
  }

  // ⑥ 文档表格：从 manifest 生成，避免文档与 apps/ 漂移
  //    （曾经把 31 条 filter 规则写成 27 条，就是手写文档导致的）
  files["SCRIPTS.md"] = renderScriptsDoc({ apps: all, distUrl: url });

  return { files, apps: all, enabled };
}

/** 生成 SCRIPTS.md（整篇由构建产出，不要手改） */
function renderScriptsDoc({ apps, distUrl }) {
  const L = [];
  const allSnippet = distUrl(`dist/${FILES.allSnippet}`);
  const allFilter = distUrl(`dist/${FILES.allFilterSnippet}`);

  L.push("# 规则与脚本明细");
  L.push("");
  L.push(`> ${FILES.generatedBy}（内容来自 apps/*.js，改完 apps/ 跑 \`node build.js\` 会重新生成本页）`);
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 引用地址");
  L.push("");
  L.push("| 用途 | 地址 |");
  L.push("|---|---|");
  L.push(`| 重写（全部 App） | \`${allSnippet}\` |`);
  L.push(`| 过滤器（全部 App） | \`${allFilter}\` |`);
  L.push("");
  L.push("只需这两个。单 App 地址见下方各 App 小节。");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 支持清单");
  L.push("");
  L.push("| App | 平台 | 适配版本 | 重写规则 | 拦截域名 | MITM 域名 |");
  L.push("|---|---|---|---|---|---|");
  for (const a of apps) {
    const rw = (a.rewrites || []).length * (a.hosts || []).length;
    const fl = (a.filterGroups || []).reduce((n, g) => n + g.hosts.length, 0);
    L.push(
      `| ${a.displayName} | ${a.app.platform} | ${a.app.version} | ${rw} | ${fl} | ${(a.hosts || []).length} |`
    );
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("## 各 App 明细");
  L.push("");

  for (const a of apps) {
    L.push(`### ${a.displayName}${a.enabled === false ? "（已停用）" : ""}`);
    L.push("");
    L.push(`- **id**：\`${a.id}\`　**包名**：\`${a.app.bundle}\``);
    L.push(`- **适配版本**：${a.app.platform} ${a.app.version}　**抓包日期**：${a.app.capturedAt}`);
    L.push(`- **定义文件**：[apps/${a.id}.js](apps/${a.id}.js)`);
    if (a.evidence) L.push(`- **抓包证据**：[docs/${a.evidence}](docs/${a.evidence})`);
    L.push("");
    L.push(`**单 App 引用**（可选，替代聚合引用）：`);
    L.push("");
    L.push("```");
    L.push(`重写：  ${distUrl(`dist/${FILES.appSnippet(a.id)}`)}`);
    L.push(`过滤器：${distUrl(`dist/${FILES.appFilterSnippet(a.id)}`)}`);
    L.push("```");
    L.push("");
    L.push("**处理的接口**：");
    L.push("");
    L.push("| 接口路径 | 动作 | 说明 |");
    L.push("|---|---|---|");
    for (const r of a.rewrites || []) {
      L.push(`| \`${r.path}\` | ${r.action} | ${r.note || ""} |`);
    }
    L.push("");
    L.push("**拦截的广告域名**：");
    L.push("");
    for (const g of a.filterGroups || []) {
      L.push(`- ${g.note}`);
      L.push(`  - ${g.hosts.map((h) => `\`${h}\``).join("、")}`);
    }
    L.push("");
    if (a.filterExempt && a.filterExempt.length) {
      L.push(`**明确放行**（不拦截）：${a.filterExempt.map((h) => `\`${h}\``).join("、")}`);
      if (a.filterExemptNote) L.push(`> 原因：${a.filterExemptNote}`);
      L.push("");
    }
    L.push("**MITM 主机名**：" + (a.hosts || []).map((h) => `\`${h}\``).join("、"));
    L.push("");
    L.push(`**脚本**：${(a.scripts || []).map((s) => `\`apps-scripts/${s}\``).join("、")}　日志标签 \`${a.logTag}\``);
    L.push("");
    L.push("---");
    L.push("");
  }

  L.push("## 修改规则");
  L.push("");
  L.push("**不要直接改 `dist/` 或本页** —— 它们都是构建产物。改 `apps/<id>.js` 后执行：");
  L.push("");
  L.push("```bash");
  L.push("node build.js        # 重新生成 dist/ 与本页");
  L.push("npm run verify       # 构建一致性 + 四层校验");
  L.push("```");
  L.push("");
  L.push("新增 App 见 [CONTRIBUTING.md](CONTRIBUTING.md)。");
  L.push("");

  return L.join("\n") + "\n";
}

function main() {
  const mode = process.argv.find((a) => a.startsWith("--prefix="))?.split("=")[1] || undefined;
  const { files, apps, enabled } = build(mode);

  const problems = [];
  const summary = [];

  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(ROOT, rel);
    const normalized = content.replace(/\r\n/g, "\n");
    const exists = fs.existsSync(abs);
    const current = exists ? fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n") : null;

    if (current === normalized) {
      summary.push(`  不变  ${rel}`);
      continue;
    }

    if (CHECK_ONLY) {
      problems.push(rel);
      summary.push(`  过期  ${rel}`);
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, normalized, "utf8");
      summary.push(`  ${exists ? "更新" : "新建"}  ${rel}`);
    }
  }

  // 检查是否有孤儿分发件（dist/ 里有但构建不再产出的）
  const distDir = path.join(ROOT, "dist");
  if (fs.existsSync(distDir)) {
    for (const f of fs.readdirSync(distDir)) {
      if (f.startsWith(".")) continue;
      if (!files[`dist/${f}`]) problems.push(`dist/${f}（孤儿文件，构建不再产出）`);
    }
  }

  console.log(`App: ${apps.length} 个（启用 ${enabled.length} 个）`);
  console.log(summary.join("\n"));

  if (problems.length) {
    console.error(
      `\n❌ ${CHECK_ONLY ? "构建校验失败" : "存在问题"}：\n` +
        problems.map((p) => `   - ${p}`).join("\n") +
        (CHECK_ONLY ? "\n\n请运行 `node build.js` 重新生成后提交。" : "")
    );
    process.exit(1);
  }

  console.log(`\n${CHECK_ONLY ? "✅ 构建校验通过，dist/ 与 apps/ 一致" : "✅ 构建完成"}`);
}

main();
