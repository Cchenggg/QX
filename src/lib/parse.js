/*
 * 反向解析器：把分发件文本解析成结构，供 tests/ 校验。
 *
 * 校验必须基于「生成后的真实文本」，而不是内存里的对象 ——
 * 只有这样才能抓到渲染阶段的 bug（漏写、拼接错误、多余空行等）。
 */

const REWRITE_RE = /^(\S+)\s+url\s+(\S+)(?:\s+(.+))?$/;
const FILTER_RE = /^host\s*,\s*([^,]+?)\s*,\s*(\S+)\s*$/;
const HOSTNAME_RE = /^hostname\s*=\s*(.+)$/;
const SECTION_RE = /^\s*\[[\w_]+\]\s*$/;

function isComment(line) {
  const t = line.trim();
  return t === "" || t.startsWith(";") || t.startsWith("#") || t.startsWith("//");
}

/**
 * 检测「非注释行里」是否出现 HTML —— 这才是 QX 真正会报错的情况。
 *
 * 不能对整篇文本做 /<html|<!DOCTYPE/ 判断：片段头部本来就有一句警告
 * 「不要用 blob 地址，会报 Invalid Line<!DOCTYPE html>」，
 * 整篇匹配会把我们自己写的警告误判成 HTML 内容。
 */
function hasHtmlOutsideComments(text) {
  return text
    .split(/\r?\n/)
    .filter((l) => !isComment(l))
    .some((l) => /<html|<!DOCTYPE/i.test(l));
}

/**
 * 解析分发件文本。
 * @returns {{sections:string[], hostnames:string[], rewrites:object[], filters:object[], unknown:string[], hasHtml:boolean}}
 */
function parseSnippet(text) {
  const out = {
    sections: [],
    hostnames: [],
    rewrites: [],
    filters: [],
    unknown: [],
    hasHtml: hasHtmlOutsideComments(text),
    lineCount: 0,
  };

  const lines = text.split(/\r?\n/);
  out.lineCount = lines.length;

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (line === "") return;

    if (SECTION_RE.test(line)) {
      out.sections.push({ line: lineNo, value: line });
      return;
    }
    if (isComment(line)) return;

    const hm = line.match(HOSTNAME_RE);
    if (hm) {
      out.hostnames.push(
        ...hm[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
      return;
    }

    const fm = line.match(FILTER_RE);
    if (fm) {
      out.filters.push({ line: lineNo, host: fm[1].trim(), action: fm[2], raw: line });
      return;
    }

    const rm = line.match(REWRITE_RE);
    if (rm && rm[1].startsWith("^")) {
      out.rewrites.push({
        line: lineNo,
        regex: rm[1],
        action: rm[2],
        target: (rm[3] || "").trim(),
        raw: line,
      });
      return;
    }

    out.unknown.push({ line: lineNo, value: line });
  });

  return out;
}

/** 取重写规则对应的脚本文件名（从绝对 URL 里抽 basename） */
function scriptNameOf(rule) {
  if (!rule.action.startsWith("script-")) return null;
  if (!rule.target) return null;
  try {
    const p = rule.target.split("?")[0].split("#")[0];
    return p.substring(p.lastIndexOf("/") + 1);
  } catch (e) {
    return null;
  }
}

/** 列出所有出现的域名（含 filters 与 hostname） */
function allHosts(parsed) {
  return {
    filtered: parsed.filters.map((f) => f.host),
    mitm: parsed.hostnames.slice(),
  };
}

module.exports = { parseSnippet, scriptNameOf, allHosts, isComment, hasHtmlOutsideComments, REWRITE_RE, FILTER_RE };
