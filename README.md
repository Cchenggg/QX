# 两步路去广告 — Quantumult X

针对「两步路 / 户外助手」(`lolaage.2bulu.zhushou`) 的 Quantumult X 去广告脚本。

解决的核心痛点：**开屏和弹窗广告极易误触、直接跳转第三方 App**（有赞商城、App Store、京东等）。

> 抓包依据：2026-10-15 HAR，App iOS **9.2.7**
> 适配状态：以 9.2.7 抓包编写。App 升级后若接口字段变化，脚本可能失效（见下方「排查」）。

---

## 一、文件说明

| 文件 | 作用 |
|---|---|
| `tbulu-ads.js` | QX 脚本：改写两步路自家广告接口 |
| `rewrite.conf` | QX 配置片段：`[rewrite_local]` / `[filter_local]` / `[mitm]` 三段 |
| `test.js` | 本地验证脚本（电脑上跑：`node test.js`） |

---

## 二、原理：广告开关在哪

抓包发现 `GET https://helper.2bulu.com/adConfig/get` 返回的是**明文 JSON、无响应体签名**
（只有请求带 `psign`），因此可以安全改写。原始响应：

```json
{"errCode":"0","data":{
  "freeAdEnabled":true,
  "splashAd":{"on":true,"dailyMaxDisplayCount":10,"randomDisplay":false,
              "adList":[{"adType":"taku","num":3,"index":0},
                        {"adType":"2bulu","num":1,"index":1}],
              "hotStart":{"on":true,"displayInterval":120000}},
  "interstitialAd":{"on":true,"dailyMaxDisplayCount":3,"hotStart":null}}}
```

| 字段 | 含义 |
|---|---|
| `splashAd.on = true` | 开屏广告开启 |
| `adList: taku×3 + 2bulu×1` | 开屏 3 次走 TopOn 联盟素材、1 次走自家素材 |
| `splashAd.hotStart.on=true`<br>`displayInterval=120000` | **热启动二次开屏**，间隔 2 分钟 |
| `interstitialAd.on = true` | 插屏 / 弹窗广告开启 |

抓到的真实时间线（对应「冷启动 → 开屏 → 我的 → 弹窗」）：

```
01:23:58  冷启动  adConfig/get → getSplash → saveSplashFrequencyStatistics
01:24:00  开屏广告展示
01:24:05  切到"我的" → getPopInfo / 各广告 SDK 上报
01:24:06  首页信息流加载，第一条就是推广位：
          {"id":"A157","type":1,"link":{"url":"https://shop45920354.m.youzan.com/..."}}
01:24:08  二次开屏 getSplash → 紧接着 43 个有赞商城请求 = 已经跳走了
```

**关键结论**：跳转落地页是有赞商城；广告**素材**来自快手联盟 `p66-ad.adkwai.com`。
所以方案分两层——关掉开关（脚本改写）+ 掐断素材来源（域名 reject）。

---

## 三、安装

### 1. 添加重写规则

QX → 设置 → 配置文件 → `⋯` → 编辑，把 `rewrite.conf` 里的
`[rewrite_local]`（6 条）和 `[filter_local]`（27 条）追加进去。

脚本已用 GitHub raw 直链，QX 会自动同步更新，**不需要手动往手机传文件**。

### 2. 追加 MITM 主机名

`[mitm]` 段的 `hostname` **追加**（不要覆盖原有的）：

```
hostname = helper.2bulu.com, utility.2bulu.com
```

### 3. 安装并信任 MITM 证书（漏这步脚本一定不生效）

1. QX → 设置 → MitM → 生成证书 → 允许安装描述文件
2. 设置 → 通用 → VPN与设备管理 → 安装该描述文件
3. **设置 → 通用 → 关于本机 → 证书信任设置 → 打开 Quantumult X 的开关**
4. 回到 QX → 设置 → MitM → 打开 MitM 开关

第 3 步是绝大多数人失败的原因。

---

## 四、验证

开 QX 抓包（HTTP 抓包），完全退出两步路后重开，检查两处：

**1. `adConfig/get` 响应**应为：

```json
"splashAd":{"on":false,...,"adList":[]}
```

**2. QX 日志**应有：

```
[2bulu-ads] 已关闭 splashAd / interstitialAd
```

---

## 五、设计说明

1. **第三方广告域名用 `[filter_local]` 的 `host, xxx, reject`，不用脚本拦截。**
   依据 [QX 官方 sample.conf](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)：
   `The reject action will return DNS response with 127.0.0.1 to the query.`
   它是 **DNS 层**拦截，**不需要 MITM**、也不用写进 `hostname`。
   这样 MITM 范围只剩两步路自家接口，最小最安全，也不会被 SDK 的证书校验绕过。

2. **脚本只做响应体改写，不含拦截逻辑。**
   遇到非目标 URL 或无响应体时一律 `$done({})` 原样放行，绝不误吞正常请求。

3. **路径按精确等值匹配，不做前缀匹配。**
   否则 `/getSplash` 会误命中 `/getSplashFrequencyStatistics`。
   重写规则同样带 `[/?]` 边界，脚本内部也按 pathname 精确匹配，两头都防。
   `test.js` 里有对应的回归用例。

---

## 六、已知限制 / 排查

**`getSplash` 的响应体在抓包里是空的**（`"text":""`, `bodySize:0`）。
抓包时 App 走的是 HTTP/3 (QUIC)（HAR 里可见 `sdkquic.e.qq.com`），QX 没抓到它的响应体。
所以脚本对它做的是「返回空列表」的稳妥处理，**不保证客户端一定接受**——
真正的兜底是 `adConfig` 关开关 + 域名 reject 两层。

如果开屏广告仍在，说明 `getSplash` 走 QUIC 绕过了 MITM，可尝试：

- 在 QX `[general]` 加 `udp_drop_list = QUIC`（让 App 回落 TCP，MITM 才能生效）
  注意这是**全局设置**，可能影响其他 App 的 QUIC 性能。
- 或关掉 QX 里 HTTP/3 相关开关。

| 现象 | 处理 |
|---|---|
| 日志无 `[2bulu-ads]` | 重写规则未加载或正则未匹配，核对配置后重新加载 |
| 有日志但广告还在 | `getSplash` 走 QUIC，见上 |
| 两步路功能异常 | 注释掉 `[filter_local]` 全部规则复测，确认是否拦多了 |
| App 升级后失效 | 重新抓包比对 `adConfig/get` 字段，可能要调整脚本 |

**脚本拦不住的**：App 通过 URL Scheme / `LSApplicationWorkspace` 直接唤起第三方 App
的行为不走网络。但只要广告素材被 reject，就没有可点击的广告，也就无从唤起。

---

## 七、本地测试

```powershell
node test.js
```

用抓包真实 JSON 覆盖 24 项断言：开关关闭、列表清空、推广位过滤、
非目标 URL 不误伤、无响应体安全放行、异常 JSON 容错。
