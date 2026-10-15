/*
 * QX 运行时模拟器：在 Node 里执行 apps-scripts/*.js
 *
 * Quantumult X 的脚本形态是「立即执行函数 + 全局 $request/$response/$done」，
 * 这里注入同名的局部变量来模拟，既能跑真实代码又不需要 QX。
 */

const fs = require("fs");
const path = require("path");

const SCRIPTS_DIR = path.resolve(__dirname, "..", "..", "apps-scripts");

function scriptPath(name) {
  return path.join(SCRIPTS_DIR, name);
}

function readScript(name) {
  const p = scriptPath(name);
  if (!fs.existsSync(p)) throw new Error(`脚本不存在: apps-scripts/${name}`);
  return fs.readFileSync(p, "utf8");
}

/**
 * 执行一次脚本。
 * @param {string} scriptName 脚本文件名
 * @param {string} url        请求 URL
 * @param {string|undefined} body 响应体；undefined 表示无 $response（模拟 request 阶段）
 * @returns {{result: object, logs: string[]}}
 */
function run(scriptName, url, body) {
  const source = readScript(scriptName);
  const logs = [];
  let captured = null;

  const $done = (o) => {
    captured = o === undefined ? {} : o;
  };
  const $request = { url };
  const $response = body === undefined ? undefined : { body };
  const fakeConsole = {
    log: (...a) => logs.push(a.join(" ")),
    error: (...a) => logs.push(a.join(" ")),
    warn: (...a) => logs.push(a.join(" ")),
  };

  const fn = new Function("$request", "$response", "$done", "console", source);
  fn($request, $response, $done, fakeConsole);

  return { result: captured, logs };
}

/** 抽取脚本的 TAG 常量值 */
function readTag(scriptName) {
  const src = readScript(scriptName);
  const m = src.match(/const\s+TAG\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

/** 抽取脚本导出的 MATCH_PATHS 契约数组 */
function readMatchPaths(scriptName) {
  const src = readScript(scriptName);
  const m = src.match(/const\s+MATCH_PATHS\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  const items = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return items;
}

module.exports = { run, readScript, readTag, readMatchPaths, scriptPath, SCRIPTS_DIR };
