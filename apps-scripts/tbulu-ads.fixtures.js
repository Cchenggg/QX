/*
 * 脚本测试夹具
 *
 * 与 <script-name>.js 同名同目录，由 test-script-contract.js 加载。
 * 加入新脚本时**必须**同时加这个文件，否则契约测试会失败。
 *
 * text/json 类字段是「真实抓包形状」的响应体，用来驱动脚本做真实改写断言。
 */

module.exports = {
  script: "tbulu-ads.js",

  /* 每个受守卫路径：合成响应体 + 断言函数 */
  paths: {
    "/adConfig/get": {
      note: "广告总开关",
      sample: JSON.stringify({
        errCode: "0",
        data: {
          platform: null,
          freeAdEnabled: true,
          newUserFreeAdDuration: 86400000,
          returningUserFreeAdDuration: 86400000,
          returningUserThreshold: 90,
          splashAd: {
            on: true,
            dailyMaxDisplayCount: 10,
            randomDisplay: false,
            adList: [
              { adType: "taku", num: 3, index: 0 },
              { adType: "2bulu", num: 1, index: 1 },
            ],
            hotStart: { on: true, displayInterval: 120000 },
          },
          interstitialAd: { on: true, dailyMaxDisplayCount: 3, hotStart: null },
        },
      }),
      assert(o) {
        return [
          ["splashAd.on 被关闭", o.data.splashAd.on === false],
          ["interstitialAd.on 被关闭", o.data.interstitialAd.on === false],
          ["adList 被清空", Array.isArray(o.data.splashAd.adList) && o.data.splashAd.adList.length === 0],
          ["hotStart 被关闭", o.data.splashAd.hotStart.on === false],
          ["errCode 保留 0", o.errCode === "0"],
          ["其它字段未被破坏", o.data.freeAdEnabled === true && o.data.returningUserThreshold === 90],
        ];
      },
    },

    "/getSplash": {
      note: "开屏广告",
      sample: JSON.stringify({ errCode: "0", data: [{ id: 1, img: "https://x/y.jpg" }] }),
      assert(o) {
        return [
          ["data 清空为空数组", Array.isArray(o.data) && o.data.length === 0],
          ["errCode 保留 0", o.errCode === "0"],
        ];
      },
    },

    "/v9/advert/getUniversalAd": {
      note: "通用广告位",
      sample: JSON.stringify({
        errCode: "0",
        data: [
          { id: 144, adTitle: "行走中国", linkType: 1, linkContent: "https://www.2bulu.com/x" },
          { id: 151, adTitle: "喜马拉雅神农架", linkType: 1, linkContent: "https://pro.m.jd.com/mall/active/xxx" },
        ],
      }),
      assert(o) {
        return [["广告列表清空", Array.isArray(o.data) && o.data.length === 0]];
      },
    },

    "/advert/getAllAdInfo": {
      note: "广告位汇总",
      sample: JSON.stringify({ data: {}, errCode: "0" }),
      assert(o) {
        return [["data 置为空对象", o.data && typeof o.data === "object" && !Array.isArray(o.data) && Object.keys(o.data).length === 0]];
      },
    },

    "/getPopInfo": {
      note: "弹窗商品位",
      sample: JSON.stringify({ errCode: "0", goods: { id: 9, title: "促销" } }),
      assert(o) {
        return [
          ["goods 置空", o.goods === null],
          ["errCode 保留 0", o.errCode === "0"],
        ];
      },
    },

    "/v9/home/feed": {
      note: "首页信息流推广位",
      sample: JSON.stringify({
        errCode: "0",
        data: [
          {
            id: "A157",
            type: 1,
            bizId: "157",
            cover: { fileId: 1694397103, width: 519, height: 696 },
            link: { url: "https://shop45920354.m.youzan.com/v2/feature/4I3ljDng1x", type: 1 },
          },
          { id: "D13494407", type: 2, bizId: "13494407", title: "生活就像摄影" },
          { id: "D13494408", type: 2, bizId: "13494408", title: "正常动态2" },
        ],
      }),
      assert(o) {
        return [
          ["推广位 A157 被移除", o.data.length === 2, `剩余 ${o.data.length}`],
          ["正常动态保留", o.data[0] && o.data[0].id === "D13494407" && o.data[1].id === "D13494408"],
        ];
      },
    },
  },

  /* 必须原样放行、不得改写的路径（含同前缀干扰项） */
  passthrough: [
    { note: "同前缀干扰：getSplashFrequencyStatistics", path: "/getSplashFrequencyStatistics", body: JSON.stringify({ errCode: "0", data: [1] }) },
    { note: "同前缀干扰：getAllAdInfoExtra", path: "/advert/getAllAdInfoExtra", body: JSON.stringify({ errCode: "0", data: [1] }) },
    { note: "同前缀干扰：v9/home/feedback", path: "/v9/home/feedback", body: JSON.stringify({ errCode: "0", data: [1] }) },
    { note: "普通接口", path: "/queryUserInfo", body: JSON.stringify({ errCode: "0", data: { userId: 1 } }) },
  ],

  /* 异常输入容错 */
  robustness: [
    { note: "非 JSON 响应不崩溃", path: "/adConfig/get", body: "not-json{{{" },
    { note: "data 为 null 不崩溃", path: "/v9/home/feed", body: JSON.stringify({ errCode: "0", data: null }) },
    { note: "空 body 不崩溃", path: "/adConfig/get", body: "" },
  ],
};
