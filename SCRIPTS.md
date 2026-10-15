# 脚本清单

本仓库所有 QX 脚本的索引。**以后新增脚本，只需在这里加一行、并在 `rewrite.conf` 里加对应规则。**

---

## 地址前缀说明

下表「脚本地址」列默认使用 `gh-proxy.com` 前缀代理。实测结论：

| 地址 | 直连成功率 | 平均延迟 | 说明 |
|---|---|---|---|
| `https://gh-proxy.com/` | 6/6 | 0.7~1.3s | **默认推荐**，国内直连可用 |
| `https://ghfast.top/` | 6/6 | 1.1~1.4s | 等价替代 |
| `https://ghproxy.net/` | 6/6 | 0.6~0.9s | 等价替代 |
| `https://cdn.jsdelivr.net/gh/Cchenggg/QX@main/` | 6/6 | 0.4~1.0s | 等价替代（路径格式不同，见下） |
| `https://raw.githubusercontent.com/` | **5/6** | 15s 超时 | 国内直连不稳定，仅 QX 走代理时可用 |

> 这些公共前缀代理会有**瞬时抖动**（偶发 502 或连接失败），QX 会缓存已下载的脚本，
> 单次失败不影响使用——下次同步成功即可。若长期拉不到，换一个前缀即可。

回退地址就是把前缀换掉，路径部分不变：

```
默认：  https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/<文件名>
替代1： https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/<文件名>
替代2： https://cdn.jsdelivr.net/gh/Cchenggg/QX@main/<文件名>     ← 注意格式不同
代理：  https://raw.githubusercontent.com/Cchenggg/QX/main/<文件名>
```

> 已验证四种地址返回的内容 SHA256 与仓库文件完全一致。

### ⚠️ 别用 `blob` 网页地址

```
❌ https://github.com/Cchenggg/QX/blob/main/tbulu-ads.js
✅ https://raw.githubusercontent.com/Cchenggg/QX/main/tbulu-ads.js
```

`github.com/.../blob/...` 是**给人看的网页**（返回 258KB HTML），QX 拿到后会解析到
`<!DOCTYPE html>`，报错 **`Invalid Line<!DOCTYPE html>`**。
引用配置或脚本一律用 `raw.githubusercontent.com` 地址（或它的前缀代理）。

---

## 清单

### QX 引用地址（推荐用法）

| 引用位置 | 地址 | 内容 |
|---|---|---|
| 设置 → **重写** → 引用 | `https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/rewrite.snippet` | 6 条重写规则 + `hostname` |
| 设置 → **过滤器** → 引用 | `https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/filter.snippet` | 31 条广告域名 reject |

> `.snippet` 是**纯规则**文件（无 `[section]` 标题），专门给 QX 引用用。
> `rewrite.conf` 是给人复制粘贴的**完整配置**，含 section 标题，**不能用于引用**。

### 脚本

| 脚本 | 用途 | 脚本地址（默认前缀） |
|---|---|---|
| `tbulu-ads.js` | 两步路去广告：关闭开屏/插屏广告开关、清空广告位、过滤信息流推广位 | `https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/tbulu-ads.js` |

---

## 各脚本详情

### tbulu-ads.js — 两步路去广告

- **目标 App**：两步路 / 户外助手（`lolaage.2bulu.zhushou`）
- **适配版本**：iOS 9.2.7（2026-10-15 抓包）
- **处理的接口**：

  | 接口 | 作用 |
  |---|---|
  | `/adConfig/get` | 广告总开关，关闭 `splashAd` + `interstitialAd` |
  | `/getSplash` | 开屏广告（含热启动二次开屏） |
  | `/v9/advert/getUniversalAd` | 通用广告位 |
  | `/advert/getAllAdInfo` | 广告位汇总 |
  | `/getPopInfo` | 弹窗商品位 |
  | `/v9/home/feed` | 首页信息流中的 `A<数字>` 推广位 |

- **配套规则**：`rewrite.snippet`（6 条重写）+ `filter.snippet`（31 条域名 reject）
- **MITM 主机名**：`helper.2bulu.com`、`utility.2bulu.com`
- **测试**：`node test.js`（31 项断言）

---

## 新增脚本的步骤

1. 把脚本文件放到仓库根目录，命名用小写连字符：`<app名>-<用途>.js`，例：`xxx-ads.js`
2. **两份文件都要加规则**（必须同步，别只改一份）：

   | 文件 | 用途 | 加什么 |
   |---|---|---|
   | `rewrite.snippet` | 给 QX **引用**用 | **纯规则行**，不加 `[section]` 标题 |
   | `rewrite.conf` | 给人**复制粘贴**用 | 同样规则，放在 `[rewrite_local]` 段里 |

   ```ini
   ; rewrite.snippet（纯规则，无 section 标题）
   ^https?:\/\/api\.example\.com\/ad\/config[/?] url script-response-body https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/xxx-ads.js
   ```

3. 需要拦广告域名时，`filter.snippet` 和 `rewrite.conf` 的 `[filter_local]` **也都要加**：
   `host, 域名, reject`，按脚本分组
4. 需要改写响应的域名：
   - `rewrite.snippet` 里加/合并 `hostname = ...` 行
   - `rewrite.conf` 里加到 `[mitm]` 的 `hostname`（**追加，不要覆盖**）
5. 上方「清单」表格加一行，并在「各脚本详情」补一节
6. 写 `test-<脚本名>.js` 本地验证，别只靠肉眼看
7. 提交前校验两份文件规则一致：

   ```powershell
   $a = @([IO.File]::ReadAllText("$pwd\filter.snippet") -split "`r?`n" | ? { $_.Trim() -match '^host,' } | % { $_.Trim() })
   $b = @([IO.File]::ReadAllText("$pwd\rewrite.conf")  -split "`r?`n" | ? { $_.Trim() -match '^host,' } | % { $_.Trim() })
   Compare-Object $a $b
   ```

### 规则写法四条铁律

1. **末尾一定加 `[/?]` 边界**，否则前缀误伤。
   踩过的坑：`/getSplash` 会命中 `/getSplashFrequencyStatistics`。
2. **用 `[/?]` 字符类，不要写裸 `?`**，裸 `?` 会被当成正则量词。
3. **脚本内部也别用 `indexOf` 做前缀匹配**，按 pathname 精确等值比较。
4. **域名必须从抓包复制，不要手打**。
   踩过的坑：`guangtuikeji.com` 被打成 `guangtuakeji.com`，拼错的域名拦不住任何东西。
