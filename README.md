# 去广告 — Quantumult X

## 一、安装（5 分钟）

### 步骤 1：把配置追加到 QX

打开 **QX → 设置 → 配置文件 → 点当前配置右侧 `⋯` → 编辑**，把
[`rewrite.conf`](https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/rewrite.conf)
里的内容追加进去，注意：

| 段落              | 怎么加                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `[rewrite_local]` | 把 6 条规则贴进去（你的配置里通常已有这个 section，**只贴规则行，别重复写 section 标题**） |
| `[filter_local]`  | 同上，贴 31 条 `host, 域名, reject`                                                        |
| `[mitm]`          | 把 `hostname` 那行**追加**到已有的 hostname 后面，**不要覆盖**                             |

> **偷懒办法**：也可以走「引用模式」——QX → 设置 → 重写 → 引用 → 添加：
>
> ```
> https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/rewrite.conf
> ```
>
> ⚠️ 引用地址**必须用 raw 地址，不能用 `github.com/.../blob/...` 网页地址**：
>
> ```
> ✅ https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/rewrite.conf
> ✅ https://raw.githubusercontent.com/Cchenggg/QX/main/rewrite.conf   （QX 里 GitHub 走代理时用）
> ✅ https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/rewrite.conf
> ❌ https://github.com/Cchenggg/QX/blob/main/rewrite.conf
> ```
>
> 用 ❌ 会报 **`Invalid Line<!DOCTYPE html>`**：`blob` 地址是给人看的网页，
> QX 下载到的是 258KB 的 HTML 页面，解析到第一行 `<!DOCTYPE html>` 就报错。
> 正确地址返回的是 5585B 配置原文（已核对 SHA256 与仓库文件逐字节一致）。
>
> 走引用模式后规则改动你在 GitHub 一提交，QX 自动同步。
> 但 **`[filter_local]` 的域名拦截和 `[mitm]` 的 hostname 不一定随引用生效**，
> 保险起见这两段仍按上表手动加一次（加完就不用再管）。

保存后 QX 会提示重新加载配置，确认。

### 步骤 2：安装并信任 MITM 证书

**这步漏了脚本一定不生效，是 90% 的人失败的原因。**

1. QX → 设置 → MitM → 生成证书 → 允许安装描述文件
2. 系统 设置 → 通用 → VPN与设备管理 → 安装该描述文件
3. **系统 设置 → 通用 → 关于本机 → 证书信任设置 → 打开 Quantumult X 的开关** ← 关键
4. 回到 QX → 设置 → MitM → 打开 MitM 开关

### 步骤 3：验证

打开 QX 的 **抓包（HTTP 抓包）**，完全退出两步路后重新打开，检查两处：

**① `adConfig/get` 的响应**应为 `"splashAd":{"on":false,...,"adList":[]}`

**② QX 日志**（设置 → 日志）应出现：

```
[2bulu-ads] 已关闭 splashAd / interstitialAd
```

看到这两条就成功了。

---

## 二、脚本清单

完整清单（含每个脚本处理的接口、配套规则、MITM 域名）见 **[`SCRIPTS.md`](SCRIPTS.md)**。

| 脚本           | 用途                                                            |
| -------------- | --------------------------------------------------------------- |
| `tbulu-ads.js` | 两步路去广告：关开屏/插屏广告开关、清空广告位、过滤信息流推广位 |

**新增脚本只改两个地方**：`SCRIPTS.md` 加一行，`rewrite.conf` 加对应规则。详细步骤见 SCRIPTS.md 末尾。

---

## 三、地址选择（重要）

所有脚本地址**默认用 `gh-proxy.com` 前缀代理**，因为实测 `raw.githubusercontent.com` 在国内直连极不稳定：

| 地址                                            | 直连表现                  | 结论                     |
| ----------------------------------------------- | ------------------------- | ------------------------ |
| `https://gh-proxy.com/`                         | 200/200/200，0.7~1.3s     | **默认推荐**             |
| `https://ghfast.top/`                           | 200/200/200，1.1~1.4s     | 等价替代                 |
| `https://cdn.jsdelivr.net/gh/Cchenggg/QX@main/` | 200/200/200，0.4~1.0s     | 等价替代（路径格式不同） |
| `https://raw.githubusercontent.com/`            | **000/000/200，15s 超时** | 仅 QX 走代理时可用       |

已验证四种地址返回的内容 SHA256 与仓库文件**完全一致**。

**如果你的 QX 里 GitHub 走代理**（可在 QX 里测：访问 `https://raw.githubusercontent.com/Cchenggg/QX/main/tbulu-ads.js` 能否打开），
可以把 `rewrite.conf` 里所有 `https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/`
整体替换成 `https://raw.githubusercontent.com/Cchenggg/QX/main/`，更快更直接。

---

## 四、排查

| 现象                     | 处理                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| 日志里没有 `[2bulu-ads]` | ① MITM 证书**信任开关**没开（最常见）② 重写规则没加载 ③ 脚本地址拉不到，在 QX 里手动打开那个脚本地址试试 |
| 脚本地址打不开           | 换前缀，见上方「地址选择」                                                                               |
| 有日志但开屏广告还在     | `getSplash` 走了 QUIC 绕过 MITM，见下方「已知限制」                                                      |
| 两步路功能异常           | 把 `[filter_local]` 全部规则注释掉重启 App 复测，确认是不是拦多了                                        |
| App 升级后失效           | 重新抓包比对 `adConfig/get` 字段，可能要调整脚本                                                         |

---

## 五、原理（了解即可）

抓包发现 `GET https://helper.2bulu.com/adConfig/get` 返回的是**明文 JSON、无响应体签名**
（只有请求带 `psign`），所以可以安全改写。原始响应：

```json
{
  "errCode": "0",
  "data": {
    "splashAd": {
      "on": true,
      "dailyMaxDisplayCount": 10,
      "randomDisplay": false,
      "adList": [
        { "adType": "taku", "num": 3, "index": 0 },
        { "adType": "2bulu", "num": 1, "index": 1 }
      ],
      "hotStart": { "on": true, "displayInterval": 120000 }
    },
    "interstitialAd": {
      "on": true,
      "dailyMaxDisplayCount": 3,
      "hotStart": null
    }
  }
}
```

| 字段                                                    | 含义                                       |
| ------------------------------------------------------- | ------------------------------------------ |
| `splashAd.on = true`                                    | 开屏广告开启                               |
| `adList: taku×3 + 2bulu×1`                              | 开屏 3 次走 TopOn 联盟素材、1 次走自家素材 |
| `splashAd.hotStart.on=true`<br>`displayInterval=120000` | **热启动二次开屏**，间隔 2 分钟            |
| `interstitialAd.on = true`                              | 插屏 / 弹窗广告开启                        |

真实时间线（对应「冷启动 → 开屏 → 我的 → 弹窗」）：

```
01:23:58  冷启动  adConfig/get → getSplash → saveSplashFrequencyStatistics
01:24:00  开屏广告展示
01:24:05  切到"我的" → getPopInfo / 各广告 SDK 上报
01:24:06  首页信息流加载，第一条就是推广位：
          {"id":"A157","type":1,"link":{"url":"https://shop45920354.m.youzan.com/..."}}
01:24:08  二次开屏 getSplash → 紧接着 43 个有赞商城请求 = 已经跳走了
```

**结论**：跳转落地页是有赞商城；广告**素材**来自快手联盟 `p66-ad.adkwai.com`。
所以方案分两层——关开关（脚本改写）+ 掐断素材来源（域名 reject）。

原始抓包索引归档在 [`docs-har-index.tsv`](docs-har-index.tsv)，
以后接口变化时可用来比对排查。

---

## 六、设计说明（改脚本前先看）

1. **域名拦截用 `[filter_local]` 的 `host, xxx, reject`，不用脚本拦截。**
   依据 [QX 官方 sample.conf](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)：
   `The reject action will return DNS response with 127.0.0.1 to the query.`
   它是 **DNS 层**拦截，**不需要 MITM**、也不用写进 `hostname`。
   这样 MITM 范围只剩必要域名，最小最安全，也不会被 SDK 证书校验绕过。

2. **脚本只做响应体改写，不含拦截逻辑。**
   遇到非目标 URL 或无响应体时一律 `$done({})` 原样放行，绝不误吞正常请求。

3. **路径必须精确匹配，不能前缀匹配。**
   `/getSplash` 是 `/getSplashFrequencyStatistics` 的前缀，用 `indexOf` 会误伤。
   规则加 `[/?]` 边界、脚本内按 pathname 精确等值，两头都防。`test.js` 有回归用例。

---

## 七、已知限制

**`getSplash` 的响应体在抓包里是空的**（`"text":""`, `bodySize:0`）。
抓包时 App 走的是 HTTP/3 (QUIC)（HAR 里可见 `sdkquic.e.qq.com`），QX 没抓到响应体。
所以脚本对它做的是「返回空列表」的稳妥处理，**不保证客户端一定接受**——
真正的兜底是 `adConfig` 关开关 + 域名 reject 两层。

如果开屏广告仍在，说明 `getSplash` 走 QUIC 绕过了 MITM，可尝试：

- 在 QX `[general]` 加 `udp_drop_list = QUIC`（让 App 回落 TCP，MITM 才能生效）
  注意这是**全局设置**，可能影响其他 App 的 QUIC 性能。
- 或关掉 QX 里 HTTP/3 相关开关。

**脚本拦不住的**：App 通过 URL Scheme / `LSApplicationWorkspace` 直接唤起第三方 App
的行为不走网络。但只要广告素材被 reject，就没有可点击的广告，也就无从唤起。

---

## 八、本地测试

```powershell
node test.js
```

用抓包真实 JSON 覆盖 31 项断言：开关关闭、列表清空、推广位过滤、
路径边界回归、非目标 URL 不误伤、无响应体安全放行、异常 JSON 容错。
