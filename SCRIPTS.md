# 规则与脚本明细

> 此文件由 build.js 从 apps/*.js 生成，请勿手动修改。（内容来自 apps/*.js，改完 apps/ 跑 `node build.js` 会重新生成本页）

---

## 引用地址

| 用途 | 地址 |
|---|---|
| 重写（全部 App） | `https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-All.snippet` |
| 过滤器（全部 App） | `https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-Filter.snippet` |

只需这两个。单 App 地址见下方各 App 小节。

---

## 支持清单

| App | 平台 | 适配版本 | 重写规则 | 拦截域名 | MITM 域名 |
|---|---|---|---|---|---|
| 两步路 / 户外助手 | ios | 9.2.7 | 6 | 31 | 1 |

---

## 各 App 明细

### 两步路 / 户外助手

- **id**：`tbulu`　**包名**：`lolaage.2bulu.zhushou`
- **适配版本**：ios 9.2.7　**抓包日期**：2026-10-15
- **定义文件**：[apps/tbulu.js](apps/tbulu.js)
- **抓包证据**：[docs/tbulu/har-index.tsv](docs/tbulu/har-index.tsv)

**单 App 引用**（可选，替代聚合引用）：

```
重写：  https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu.snippet
过滤器：https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu-filter.snippet
```

**处理的接口**：

| 接口路径 | 动作 | 说明 |
|---|---|---|
| `/adConfig/get` | script-response-body | 广告总开关：关闭开屏 + 插屏/弹窗广告（最关键的一条） |
| `/getSplash` | script-response-body | 开屏广告（冷启动 + 热启动二次开屏） |
| `/v9/advert/getUniversalAd` | script-response-body | 通用广告位 |
| `/advert/getAllAdInfo` | script-response-body | 广告位汇总 |
| `/getPopInfo` | script-response-body | 弹窗商品位 |
| `/v9/home/feed` | script-response-body | 首页信息流中的 A<数字> 推广位 |

**拦截的广告域名**：

- 开屏/插屏广告素材与投放（最关键：快手联盟，抓包里的创意图来源）
  - `p66-ad.adkwai.com`
- 穿山甲 / 字节 GroMore
  - `api-access.pangolin-sdk-toutiao.com`、`api-access.pangolin-sdk-toutiao1.com`、`log-api.pangolin-sdk-toutiao.com`、`gromore.pangolin-sdk-toutiao.com`、`sf3-fe-tos.pglstatp-toutiao.com`
- 广告聚合 / 竞价平台
  - `sdk.adx.adwangmai.com`、`sdk-cfg.adx.adwangmai.com`、`api-htp.beizi.biz`、`sdk.beizi.biz`、`sdkg.fancyapi.com`、`t2.fancyapi.com`、`static.fancyapi.com`、`lftxali.fancyapi.com`、`mpcfg.fancydsp.com`、`entry-su1.ubixioe.com`、`adx-cfg-u1.ubixioe.com`、`sdk.1rtb.net`、`s.tuia.cn`、`sdk-track.66mobi.com`、`tstatic.66mobi.com`、`sdk.zhangyuyidong.cn`、`sdklog.zhangyuyidong.cn`、`de.ad.gameley.com`、`jp.ad.gameley.com`
- 其他联盟
  - `mi.gdt.qq.com`、`v2mi.gdt.qq.com`、`adsmartget.guangtuikeji.com`、`report2.dhsz.cn`、`im-x.jd.com`、`api.ocpx.ydmob.com`

**明确放行**（不拦截）：`sdk.e.qq.com`、`tk.anythinktech.com`、`ujoy.anythinktech.com`、`adx-bj.anythinktech.com`、`da.statisticslinks.com`
> 原因：均为 SDK 上报接口，拦不拦都不影响去广告效果，少拦一点更稳。

**MITM 主机名**：`helper.2bulu.com`

**脚本**：`apps-scripts/tbulu-ads.js`　日志标签 `[2bulu-ads]`

---

## 修改规则

**不要直接改 `dist/` 或本页** —— 它们都是构建产物。改 `apps/<id>.js` 后执行：

```bash
node build.js        # 重新生成 dist/ 与本页
npm run verify       # 构建一致性 + 四层校验
```

新增 App 见 [CONTRIBUTING.md](CONTRIBUTING.md)。

