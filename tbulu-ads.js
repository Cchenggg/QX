/*
 * 两步路 (lolaage.2bulu.zhushou) 去广告脚本 — Quantumult X
 * 适用版本：iOS 9.2.7 / build 9.2.7.2
 *
 * 依据 2026-10-15 抓包 (quantumult-x-2026-10-12-100253.har) 编写。
 *
 * 职责范围：只改写两步路自家接口的响应体（明文 JSON，无响应体签名）。
 *   1. /adConfig/get                 广告总开关 (splashAd / interstitialAd)
 *   2. /getSplash                    开屏广告（含"热启动"二次开屏）
 *   3. /v9/advert/getUniversalAd     通用广告位
 *   4. /advert/getAllAdInfo          广告位汇总
 *   5. /getPopInfo                   弹窗商品位
 *   6. /v9/home/feed                 首页信息流中的 "A<数字>" 推广位
 *
 * 第三方广告联盟域名请在 [filter_local] 用 host reject 拦截
 * （DNS 层，不需要 MITM），见 2bulu-rewrite.conf。
 */

const TAG = "[2bulu-ads]";

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

function jsonDone(obj) {
  $done({ body: JSON.stringify(obj) });
}

function asJson(resp) {
  try {
    return JSON.parse(resp.body || "");
  } catch (e) {
    console.log(TAG + " JSON 解析失败，放弃改写: " + e);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 1. 广告总开关：把开屏 / 插屏广告全部关闭
 * ------------------------------------------------------------------ */

function handleAdConfig(resp) {
  let obj = asJson(resp);
  if (!obj) return $done({});

  // 保留原有结构，避免客户端因字段缺失走异常分支
  if (!obj.data || typeof obj.data !== "object") obj.data = {};

  // 开屏广告（冷启动 + 热启动二次开屏）
  obj.data.splashAd = {
    on: false,
    dailyMaxDisplayCount: 0,
    randomDisplay: false,
    adList: [],
    hotStart: { on: false, displayInterval: 0 }
  };

  // 插屏广告（"我的"页弹窗、页面切换弹窗）
  obj.data.interstitialAd = {
    on: false,
    dailyMaxDisplayCount: 0,
    hotStart: { on: false, displayInterval: 0 }
  };

  // 保留成功语义，避免客户端走错误分支
  obj.errCode = "0";

  console.log(TAG + " 已关闭 splashAd / interstitialAd");
  return jsonDone(obj);
}

/* ------------------------------------------------------------------ *
 * 2 & 3 & 4 & 5. 各类广告位列表：清空为空集合
 * ------------------------------------------------------------------ */

function handleAdList(resp, shape) {
  let obj = asJson(resp);
  if (!obj) return $done({});

  obj.errCode = "0";
  obj.data = shape === "array" ? [] : {};
  obj.goods = null; // getPopInfo 用的是 goods 字段

  return jsonDone(obj);
}

/* ------------------------------------------------------------------ *
 * 6. 首页信息流：剔除 "A<数字>" 形式的推广条目
 * ------------------------------------------------------------------ */

function handleFeed(resp) {
  let obj = asJson(resp);
  if (!obj) return $done({});

  const list = obj.data;
  if (!Array.isArray(list)) return $done({});

  const before = list.length;
  obj.data = list.filter(function (item) {
    if (!item) return false;
    const id = String(item.id == null ? "" : item.id);
    // 抓包中推广位形如 {"id":"A157","bizId":"157","cover":{...}}，
    // 正常动态形如 {"id":"D13494407",...}
    if (/^A\d+$/.test(id)) return false;
    if (item.isAd === true || item.ad === true) return false;
    return true;
  });

  const removed = before - obj.data.length;
  if (removed > 0) console.log(TAG + " 信息流移除推广位 " + removed + " 条");
  return jsonDone(obj);
}

/* ------------------------------------------------------------------ *
 * 入口（由 url script-response-body 触发）
 * ------------------------------------------------------------------ */

(function main() {
  const resp = $response;
  if (!resp || typeof resp.body !== "string") {
    // 没有响应体就没法改写，原样放行
    console.log(TAG + " 无响应体，跳过");
    return $done({});
  }

  const url = ($request && $request.url) || "";

  // 只取 pathname 做精确匹配，避免 /getSplash 误命中 /getSplashFrequencyStatistics
  // 精确等值比较而非前缀匹配，所以路径拼错或接口改名都会安全落到 default 分支
  let path = "";
  try {
    const afterScheme = url.split("://")[1] || "";
    const slash = afterScheme.indexOf("/");
    path = slash >= 0 ? afterScheme.slice(slash) : "";
    path = path.split("?")[0].split("#")[0];
  } catch (e) {
    path = "";
  }

  switch (path) {
    case "/adConfig/get":
      return handleAdConfig(resp);
    case "/getSplash":
      return handleAdList(resp, "array");
    case "/v9/advert/getUniversalAd":
      return handleAdList(resp, "array");
    case "/advert/getAllAdInfo":
      return handleAdList(resp, "object");
    case "/getPopInfo":
      return handleAdList(resp, "object");
    case "/v9/home/feed":
      return handleFeed(resp);
    default:
      console.log(TAG + " 未匹配的路径，跳过: " + path);
      return $done({});
  }
})();
