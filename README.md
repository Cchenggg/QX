# 多 App 去广告 — Quantumult X

针对多个 App 的 QX 去广告规则与脚本集合，目标 App 均为 iOS。

**统一入口**：加两条引用覆盖清单里所有 App。以后新增 App，你的引用不用改。

---

## 快速开始

| 位置 | 地址 |
|---|---|
| 设置 → **重写** → 引用 → 添加 | `https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-All.snippet` |
| 设置 → **过滤器** → 引用 → 添加 | `https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-Filter.snippet` |

然后装 MITM 证书（**漏这步脚本一定不生效**）：

1. QX → 设置 → MitM → 生成证书 → 允许安装描述文件
2. 系统 设置 → 通用 → VPN与设备管理 → 安装该描述文件
3. **系统 设置 → 关于本机 → 证书信任设置 → 打开 Quantumult X 的开关** ← 关键，90% 的失败在这
4. 回到 QX → 设置 → MitM → 打开 MitM 开关

> **为什么是两条引用？** QX 的限制：`[rewrite_remote]` 只能装重写规则，
> `[filter_remote]` 只能装过滤器规则，两者无法合并进一个文件被引用。

---

## 支持清单

| App | 适配版本 | 做法 | 重写 | 拦截域名 |
|---|---|---|---|---|
| 百度网盘 | 13.35.2 | 域名拦截（无广告开关，切断广告链路） | 2 | 16 |
| 两步路 / 户外助手 | 9.2.7 | 改写广告总开关 + 域名拦截 | 6 | 31 |

### 只想要某一个 App

用单 App 引用替代聚合引用（**二选一，别同时加**）：

```
百度网盘  重写：https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/baidu-netdisk.snippet
          过滤：https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/baidu-netdisk-filter.snippet

两步路    重写：https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu.snippet
          过滤：https://ghfast.top/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu-filter.snippet
```

---

## 更新订阅

QX 对远程资源的默认同步间隔是 **24 小时**。想立即更新：

**QX → 设置 → 重写 → 左滑对应条目 → 手动更新**，过滤器同理。

更新后需要改的地方只有一处，且只在新增 App 时才需要：

| 项 | 是否随引用自动同步 |
|---|---|
| 重写规则 | ✅ 自动 |
| 过滤器规则 | ✅ 自动 |
| **MITM 主机名** | ⚠️ **不随引用同步，需手动确认** |

**MITM 主机名该填什么**（QX → 设置 → MitM → 主机名）：

```
helper.2bulu.com, utility.2bulu.com
```

> ⚠️ 如果你之前手动加过 `pan.baidu.com` 或其它百度域名，**请删掉**。
> 百度网盘全部规则都是 reject（不需要解密），把百度域名放进 MITM
> 只会白白扩大证书解密范围，没有任何好处。

---

## 排查

### 两个常见报错

| 报错 | 原因 | 正确做法 |
|---|---|---|
| `Invalid Line<!DOCTYPE html>` | 用了 `github.com/.../blob/...` 网页地址 | 改用 `raw.githubusercontent.com` 地址 |
| `Invalid Line [rewrite_local]` | 引用了含 `[section]` 标题的 `.conf` | 引用 `.snippet` 纯规则片段 |

依据 QX 官方 [sample-import-rewrite.snippet](https://github.com/crossutility/Quantumult-X/blob/master/sample-import-rewrite.snippet)：
引用文件只接受规则行和可选的 `hostname` 行，不含任何 `[section]` 标题。

### 其他现象

| 现象 | 处理 |
|---|---|
| 脚本没生效，日志无标签输出 | ① MITM **证书信任开关**没开 ② 引用没加载 ③ 脚本地址拉不到 |
| 引用地址打不开 | 换前缀：把 `ghfast.top` 换成 `gh-proxy.com`，或直连 raw（需代理） |
| 某 App 功能异常 | 把该 App 的 filter 域名注释掉复测，确认是否拦多了 |
| 两步路开屏广告还在 | 见下方「已知限制」的 QUIC 问题 |
| App 升级后失效 | 需重新抓包比对接口字段 |

**换前缀说明**：默认用 `ghfast.top` 是因为 `raw.githubusercontent.com`
国内直连不稳定（实测 6 次里 1 次失败且卡 15 秒）。`gh-proxy.com` 更快但带
60 秒 CDN 缓存，刚更新完会短暂下发旧版。若你的 QX 里 GitHub 走代理，
可把所有 `https://ghfast.top/https://raw.githubusercontent.com/`
替换为 `https://raw.githubusercontent.com/`。

---

## 已知限制

**两步路的 `getSplash` 可能走 HTTP/3 (QUIC) 绕过 MITM**，导致脚本改写不生效。
真正的兜底是「关广告总开关 + 域名拦截」两层，多数情况下已足够。

若开屏广告仍在，可在 QX `[general]` 加 `udp_drop_list = QUIC`
（让 App 回落 TCP，MITM 才能生效）。⚠️ 这是**全局设置**，可能影响其他 App 的 QUIC 性能。

**百度网盘没有广告开关**，只能切断广告请求链路（域名拦截）。
其中 `s0-ant.baidu.com` 的开屏素材与搜索图标共用路径前缀，无法区分——
实测 973 条抓包中该图标出现 0 次，代价可接受；若将来真的加载，图标会显示为空。

**规则拦不住的**：App 通过 URL Scheme / `LSApplicationWorkspace` 直接唤起第三方 App
的行为不走网络。但只要广告素材域名被拦截，就没有可点击的广告，也就无从唤起。

---

## 免责声明

本项目仅用于个人学习与减少干扰性广告，规则基于公开抓包整理。请勿用于商业用途，使用风险自负。

---

## 给维护者

仓库结构、构建命令、四层校验说明、以及新增 App 的完整流程，
见 [`CONTRIBUTING.md`](CONTRIBUTING.md) 与 [`apps/_schema.md`](apps/_schema.md)。

各 App 的接口与域名明细见 [`SCRIPTS.md`](SCRIPTS.md)（由构建自动生成）。

```bash
node build.js        # 从 apps/ 生成 dist/
npm run verify       # 构建一致性 + 四层校验，必须全绿
```
