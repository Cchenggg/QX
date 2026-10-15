/*
 * 两步路 / 户外助手 — 去广告定义
 *
 * 这是本 App 的**唯一事实来源**。dist/ 下的分发件全部由 build.js 从本文件生成，
 * 不要直接改 dist/（CI 会用 `npm run build:check` 校验）。
 *
 * 新增 App 请复制本文件为 apps/<app-id>.js 后修改，字段说明见 apps/_schema.md。
 */

module.exports = {
  id: "tbulu",
  name: "两步路",
  displayName: "两步路 / 户外助手",
  enabled: true,

  app: {
    bundle: "lolaage.2bulu.zhushou",
    platform: "ios",
    version: "9.2.7",
    capturedAt: "2026-10-15",
  },

  /*
   * 需要的 QX 脚本（文件名相对于 apps-scripts/）。
   * build.js 会把它们拼成绝对 raw URL 写进分发件。
   */
  scripts: ["tbulu-ads.js"],

  /*
   * 需要 MITM 解密的域名。
   * build.js 会把 hosts × rewrites 展开成完整正则，并生成 hostname 行。
   */
  hosts: ["helper.2bulu.com"],

  /*
   * 重写规则。只写接口路径，不要手写正则 ——
   * build.js 会自动拼 `^https?:\/\/<host><path>[\/?]`，
   * 末尾的 [\/?] 边界是强制的（防止 /getSplash 误命中 /getSplashFrequencyStatistics）。
   */
  rewrites: [
    {
      path: "/adConfig/get",
      action: "script-response-body",
      script: "tbulu-ads.js",
      note: "广告总开关：关闭开屏 + 插屏/弹窗广告（最关键的一条）",
    },
    {
      path: "/getSplash",
      action: "script-response-body",
      script: "tbulu-ads.js",
      note: "开屏广告（冷启动 + 热启动二次开屏）",
    },
    {
      path: "/v9/advert/getUniversalAd",
      action: "script-response-body",
      script: "tbulu-ads.js",
      note: "通用广告位",
    },
    {
      path: "/advert/getAllAdInfo",
      action: "script-response-body",
      script: "tbulu-ads.js",
      note: "广告位汇总",
    },
    {
      path: "/getPopInfo",
      action: "script-response-body",
      script: "tbulu-ads.js",
      note: "弹窗商品位",
    },
    {
      path: "/v9/home/feed",
      action: "script-response-body",
      script: "tbulu-ads.js",
      note: "首页信息流中的 A<数字> 推广位",
    },
  ],

  /*
   * 域名拦截（DNS 层 reject，不需要 MITM）。
   *
   * ⚠️ 域名必须从抓包复制，禁止手打。
   *    曾经把 guangtuikeji.com 打成 guangtuakeji.com，
   *    拼错的域名拦不住任何东西且不会报错 —— 由 tests/test-evidence.js 兜底。
   *
   * 也禁止填「为了少拦一点」而放行的 SDK 上报域名（无拦截价值）。
   */
  filterGroups: [
    {
      note: "开屏/插屏广告素材与投放（最关键：快手联盟，抓包里的创意图来源）",
      hosts: ["p66-ad.adkwai.com"],
    },
    {
      note: "穿山甲 / 字节 GroMore",
      hosts: [
        "api-access.pangolin-sdk-toutiao.com",
        "api-access.pangolin-sdk-toutiao1.com",
        "log-api.pangolin-sdk-toutiao.com",
        "gromore.pangolin-sdk-toutiao.com",
        "sf3-fe-tos.pglstatp-toutiao.com",
      ],
    },
    {
      note: "广告聚合 / 竞价平台",
      hosts: [
        "sdk.adx.adwangmai.com",
        "sdk-cfg.adx.adwangmai.com",
        "api-htp.beizi.biz",
        "sdk.beizi.biz",
        "sdkg.fancyapi.com",
        "t2.fancyapi.com",
        "static.fancyapi.com",
        "lftxali.fancyapi.com",
        "mpcfg.fancydsp.com",
        "entry-su1.ubixioe.com",
        "adx-cfg-u1.ubixioe.com",
        "sdk.1rtb.net",
        "s.tuia.cn",
        "sdk-track.66mobi.com",
        "tstatic.66mobi.com",
        "sdk.zhangyuyidong.cn",
        "sdklog.zhangyuyidong.cn",
        "de.ad.gameley.com",
        "jp.ad.gameley.com",
      ],
    },
    {
      note: "其他联盟",
      hosts: [
        "mi.gdt.qq.com",
        "v2mi.gdt.qq.com",
        "adsmartget.guangtuikeji.com",
        "report2.dhsz.cn",
        "im-x.jd.com",
        "api.ocpx.ydmob.com",
      ],
    },
  ],

  /* 日志标签，需与 apps-scripts/<script> 里的 TAG 一致（由 test-script-contract 校验） */
  logTag: "[2bulu-ads]",

  /* 抓包证据文件（相对 docs/）。域名交叉校验会读它 */
  evidence: "tbulu/har-index.tsv",

  /* 明确放行、不拦截的域名，写明原因，避免后人误加 */
  filterExempt: [
    "sdk.e.qq.com",
    "tk.anythinktech.com",
    "ujoy.anythinktech.com",
    "adx-bj.anythinktech.com",
    "da.statisticslinks.com",
  ],
  filterExemptNote: "均为 SDK 上报接口，拦不拦都不影响去广告效果，少拦一点更稳。",
};
