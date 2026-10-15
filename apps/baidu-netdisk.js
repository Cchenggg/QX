/*
 * 百度网盘 — 去广告定义
 *
 * 抓包依据（两次）：
 *   docs/baidu-netdisk/har-index.tsv
 *   2026-10-15 557MB 抓包（3 次开屏，含开屏素材）
 *   2026-10-15 58MB 抓包（单次启动，响应体完整）
 *
 * ⚠️ 与两步路的关键差异：百度网盘**没有**「关掉开屏广告」的开关。
 *    广告由第三方聚合 SDK 决策（mentamob 聚合 vlion 等联盟竞价）；
 *    所有相关配置响应要么为空、要么无开关、要么不可改。
 *    因此本 App 采用**域名级拦截**切断广告请求链路，而非改写配置。
 *
 * 已确认的广告链路（抓包时间线）：
 *   mentamob 配置 → vlion 竞价 → 素材下载(s0-ant/antpcdn) → 展示
 *   → advlion 回调上报
 * 其中「摇一摇跳转京东」即 mentamob 配置里的
 *   adType:5 / creativeType:"shake,..." / shakeRange:500
 *
 * 已确认无广告开关的接口（查过，不用再试）：
 *   pan.baidu.com/api/getconfig      84 个配置项全是功能开关版本号，零广告字段
 *   pan.baidu.com/api/getsyscfg      425 个节点全是 router_list 搜索热词与运营活动
 *   pan.baidu.com/api/getsyscfg      splash_uid_shield_area.cfg_list 为空数组
 *   afd.baidu.com/afd/entry          百度自有广告库存恒定返回 "empty_ad":1
 *   mentamob/api/v2/config           明文无签名，但只有广告位规则、无开屏开关
 *   mobads.baidu.com/cpro/ui/mads.php  QX 抓不到响应体（24 次调用全 0 字节）
 */

module.exports = {
  id: "baidu-netdisk",
  name: "百度网盘",
  displayName: "百度网盘",
  enabled: true,

  app: {
    bundle: "com.baidu.netdisk",
    platform: "ios",
    version: "13.35.2",
    capturedAt: "2026-10-15",
  },

  scripts: [],

  // 只用于 urlPrefix 规则的作用域；域名级拦截见 filterGroups（不需要 MITM）
  hosts: ["pan.baidu.com"],

  rewrites: [
    // ══════════════════════════════════════════════════════════════
    // 精确路径拦截：同域混用场景，整域拦会误伤核心功能
    //
    // 只保留这两条真正必要的规则 —— 其余广告域名都由下面的
    // filterGroups 做域名级 reject（DNS 层，更快且不需要 MITM）。
    // ══════════════════════════════════════════════════════════════

    {
      urlPrefix: "{OPT_SUB}s0-ant.baidu.com",
      urlPattern: "/febos/{ANYDIR}",
      action: "reject",
      note: "开屏广告素材（严浩翔/贺峻霖 PNG + 素材包 plane_v5.zip）。实测该路径下 32 个 URL 100% 是开屏素材；注意同域的搜索图标也用 /febos/staticsns/amis/ 前缀，无法用路径区分（该图标在 973 条抓包中出现 0 次，代价可接受，见 tests）",
      selfTest: {
        match: [
          "https://s0-ant.baidu.com/febos/staticsns/amis/2026-8/1787311525075/%E4%B8%A5%E6%B5%A9%E7%BF%941.png",
          "https://s0-ant.baidu.com/febos/staticsns/amis/2026-8/1787311332763/%E8%B4%BA%E5%B3%BB%E9%9C%961.png",
          "https://s0-ant.baidu.com/febos/staticsns/amis/2025-3/1743056097877/plane_v5.zip",
        ],
        exclude: [
          "https://staticsns.cdn.bcebos.com/amis/2026-10/1791425671057/query.png",
          "https://pan.baidu.com/api/getconfig",
        ],
      },
    },
    {
      urlPrefix: "{ANY}antpcdn.com",
      urlPattern: "/e/{HOST}/{ANYDIR}",
      action: "reject",
      note: "开屏素材的 CDN 代理路径 /e/（主机带 :19001 端口）。⚠️ 绝不能拦该域名的 /b/ 路径 —— 那是 App 渲染引擎 render_resourcd.zip(242MB)，拦了会破坏预览功能",
      selfTest: {
        match: [
          "https://eb6f0c-2871784977.antpcdn.com:19001/e/s0-ant.baidu.com/staticsns/amis/2026-8/1787311524172/%E4%B8%A5%E6%B5%A9%E7%BF%943.png",
          "https://6e61d6-612614415.antpcdn.com:19001/e/s0-ant.baidu.com/staticsns/amis/2025-3/1743056097877/plane_v5.zip",
        ],
        exclude: [
          "https://9179f3-1793258924.antpcdn.com:19001/b/pkg-ant.baidu.com/issue/netdisk/gray/202511101440/render_resourcd.zip",
          "https://ec1f61-2871785151.antpcdn.com:19001/b/pkg-ant.baidu.com/issue/netdisk/gray/202511101440/render_resourcd.zip",
        ],
      },
    },
  ],

  /*
   * 域名级拦截（DNS 层 reject，不需要 MITM）。
   *
   * ⚠️ 高风险域名清单（绝不能加进来，会造成功能损坏）：
   *   pan.baidu.com / update.pan.baidu.com   网盘核心接口
   *   bcebos.com（staticsns/staticplat）     功能图标、二维码、静态资源
   *   antpcdn.com 整域                       承载 render_resourcd.zip(242MB) 渲染引擎
   *   pcsnetwork.netdisk.baidu.com           弹窗探测
   *   als.baidu.com / usr-api.yunxish.com    崩溃与统计上报
   */
  filterGroups: [
    {
      note: "百度自有广告框架（AFD）：广告决策入口与上报",
      hosts: ["afd.baidu.com", "mobads.baidu.com", "mobads-logs.baidu.com"],
    },
    {
      note: "广告聚合 / 竞价平台（「摇一摇跳京东」的决策链路）",
      hosts: [
        "api-v3.mentamob.com",
        "api-nxs-v4.mentamob.com",
        "bid-adx2.vlion.cn",
        "bj-td-menta-01-callback.advlion.com",
        "adx-cfg-u1.ubixioe.com",
      ],
    },
    {
      note: "第三方广告素材与联盟",
      hosts: [
        "p1-lm.adukwai.com",
        "tstatic.66mobi.com",
        "im-x.jd.com",
        "ssdkauth.hpplay.cn",
        "mobads-pre-config.cdn.bcebos.com",
      ],
    },
    {
      note: "广告归因 SDK（AppLovin）",
      hosts: [
        "1qojio.skadsdkless.appsflyersdk.com",
        "1qojio.launches.appsflyersdk.com",
        "1qojio.inapps.appsflyersdk.com",
      ],
    },
  ],

  logTag: "[baidu-netdisk-ads]",

  evidence: "baidu-netdisk/har-index.tsv",

  evidenceExempt: [],
  filterExemptNote: "",

  /* 明确放行：与广告同域但承载正常功能，加了会出问题 */
  filterExempt: [
    "pan.baidu.com",
    "update.pan.baidu.com",
    "staticsns.cdn.bcebos.com",
    "staticplat.cdn.bcebos.com",
    "pop.pcsnetwork.netdisk.baidu.com",
    "als.baidu.com",
    "usr-api.yunxish.com",
    "sp0.baidu.com",
  ],
  filterExemptNote:
    "均为网盘核心功能或统计上报；其中 bcebos 是功能 CDN，antpcdn 整域含 242MB 渲染引擎，故对这些域名只做精确路径拦截（见 rewrites），不做整域 reject。",
};
