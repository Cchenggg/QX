// 用 Node 模拟 Quantumult X 运行时，验证 tbulu-ads.js 的改写结果
// 用法：node test.js  （必须与本脚本同目录）
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'tbulu-ads.js'), 'utf8');

function run(url, body) {
  let captured = null;
  const $done = (o) => { captured = o === undefined ? {} : o; };
  const $request = { url };
  // body 为 undefined 时模拟无 $response 的场景
  const $response = body === undefined ? undefined : { body };
  const fn = new Function('$request', '$response', '$done', 'console', script);
  fn($request, $response, $done, console);
  return captured;
}

const adConfigReal = JSON.stringify({
  errCode: "0",
  data: {
    platform: null, freeAdEnabled: true,
    newUserFreeAdDuration: 86400000, returningUserFreeAdDuration: 86400000,
    returningUserThreshold: 90,
    splashAd: { on: true, dailyMaxDisplayCount: 10, randomDisplay: false,
      adList: [{ adType: "taku", num: 3, index: 0 }, { adType: "2bulu", num: 1, index: 1 }],
      hotStart: { on: true, displayInterval: 120000 } },
    interstitialAd: { on: true, dailyMaxDisplayCount: 3, hotStart: null }
  }
});

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log("  PASS  " + name); }
  else { failures++; console.log("  FAIL  " + name + (detail ? "  -> " + detail : "")); }
}

console.log("== 1. /adConfig/get（广告总开关）==");
{
  const r = run("https://helper.2bulu.com/adConfig/get?deviceName=iPhone", adConfigReal);
  const o = JSON.parse(r.body);
  check("返回 body", typeof r.body === "string");
  check("splashAd.on === false", o.data.splashAd.on === false, JSON.stringify(o.data.splashAd));
  check("interstitialAd.on === false", o.data.interstitialAd.on === false, JSON.stringify(o.data.interstitialAd));
  check("adList 已清空", Array.isArray(o.data.splashAd.adList) && o.data.splashAd.adList.length === 0);
  check("hotStart 已关闭", o.data.splashAd.hotStart.on === false);
  check("errCode 保留 0", o.errCode === "0");
}

console.log("== 2. /getSplash ==");
{
  const r = run("https://helper.2bulu.com/getSplash?cityId=16664", JSON.stringify({ errCode: "0", data: [{ id: 1 }] }));
  const o = JSON.parse(r.body);
  check("data 为空数组（无广告可播）", Array.isArray(o.data) && o.data.length === 0, r.body);
  check("errCode 0", o.errCode === "0");
}

console.log("== 3. /v9/advert/getUniversalAd（真实抓包数据）==");
{
  const real = JSON.stringify({ errCode: "0", data: [
    { id: 144, adTitle: "行走中国", linkType: 1, linkContent: "https://www.2bulu.com/x" },
    { id: 151, adTitle: "喜马拉雅神农架", linkType: 1, linkContent: "https://pro.m.jd.com/mall/active/xxx" }
  ]});
  const r = run("https://helper.2bulu.com/v9/advert/getUniversalAd?a=1", real);
  const o = JSON.parse(r.body);
  check("广告列表已清空", Array.isArray(o.data) && o.data.length === 0, r.body);
}

console.log("== 4. /v9/home/feed 推广位过滤（真实抓包结构）==");
{
  const real = JSON.stringify({ errCode: "0", data: [
    { id: "A157", type: 1, bizId: "157", cover: { fileId: 1694397103, width: 519, height: 696 },
      link: { url: "https://shop45920354.m.youzan.com/v2/feature/4I3ljDng1x", type: 1 } },
    { id: "D13494407", type: 2, bizId: "13494407", title: "生活就像摄影" },
    { id: "D13494408", type: 2, bizId: "13494408", title: "正常动态2" }
  ]});
  const r = run("https://helper.2bulu.com/v9/home/feed?page=1", real);
  const o = JSON.parse(r.body);
  check("推广位 A157 被移除", o.data.length === 2, "剩余 " + o.data.length);
  check("正常动态保留", o.data[0].id === "D13494407" && o.data[1].id === "D13494408");
}

console.log("== 5. /getPopInfo ==");
{
  const r = run("https://helper.2bulu.com/getPopInfo?ver=1", JSON.stringify({ errCode: "0", goods: { id: 9 } }));
  const o = JSON.parse(r.body);
  check("goods 置空", o.goods === null, r.body);
  check("errCode 0", o.errCode === "0");
}

console.log("== 6. 非目标 URL / 无响应体：必须原样放行 ==");
{
  // 本脚本只负责 script-response-body 改写；
  // 广告域名拦截改由 [filter_local] 的 host reject 负责（DNS 层）。
  const r1 = run("https://helper.2bulu.com/someOtherApi", JSON.stringify({ errCode: "0", data: [1, 2, 3] }));
  check("未匹配 URL 原样放行", JSON.stringify(r1) === "{}", JSON.stringify(r1));
  const r2 = run("https://helper.2bulu.com/getSplash", undefined);
  check("无 $response 时安全放行（不误吞请求）", JSON.stringify(r2) === "{}", JSON.stringify(r2));
  const r3 = run("https://helper.2bulu.com/adConfig/get", null);
  check("body 为 null 时不崩溃", r3 && typeof r3 === "object", JSON.stringify(r3));
}

console.log("== 6b. 路径边界：同前缀接口绝不能被误改写 ==");
{
  // /getSplash 是 /getSplashFrequencyStatistics 的前缀，必须区分开
  const u1 = "https://helper.2bulu.com/getSplashFrequencyStatistics?advertisingSource=2";
  const r1 = run(u1, JSON.stringify({ errCode: "0", data: [1] }));
  check("getSplashFrequencyStatistics 不被误改写", JSON.stringify(r1) === "{}", JSON.stringify(r1));

  const r2 = run("https://helper.2bulu.com/advert/getAllAdInfoExtra", JSON.stringify({ errCode: "0", data: [1] }));
  check("getAllAdInfoExtra 不被误改写", JSON.stringify(r2) === "{}", JSON.stringify(r2));

  const r3 = run("https://helper.2bulu.com/v9/home/feedback", JSON.stringify({ errCode: "0", data: [1] }));
  check("v9/home/feedback 不被误改写", JSON.stringify(r3) === "{}", JSON.stringify(r3));

  // 带 query / hash / 端口的目标接口仍要正常命中
  const r4 = run("https://helper.2bulu.com/getSplash?cityId=16664&version=3", JSON.stringify({ errCode: "0", data: [1] }));
  check("getSplash 带 query 正常命中", JSON.parse(r4.body).data.length === 0);
  const r5 = run("https://helper.2bulu.com/getSplash#frag", JSON.stringify({ errCode: "0", data: [1] }));
  check("getSplash 带 hash 正常命中", JSON.parse(r5.body).data.length === 0);
  const r6 = run("https://helper.2bulu.com:443/adConfig/get?x=1", adConfigReal);
  check("带端口 + query 正常命中", JSON.parse(r6.body).data.splashAd.on === false);
  const r7 = run("https://helper.2bulu.com/v9/home/feed?page=1&size=20", JSON.stringify({ errCode: "0", data: [{ id: "A1" }, { id: "D2" }] }));
  check("feed 带多参数正常命中", JSON.parse(r7.body).data.length === 1);
}

console.log("== 7. 异常容错 ==");
{
  const r = run("https://helper.2bulu.com/adConfig/get", "not-json{{{");
  check("非 JSON 响应不崩溃", r && typeof r === "object");
  const r2 = run("https://helper.2bulu.com/v9/home/feed", JSON.stringify({ errCode: "0", data: null }));
  check("data 非数组时不崩溃", r2 && typeof r2 === "object");
}

console.log("");
console.log(failures === 0 ? "全部通过 ✅" : (failures + " 项失败 ❌"));
process.exit(failures === 0 ? 0 : 1);
