# 多 App 去广告 — Quantumult X

针对多个 App 的 Quantumult X 去广告规则与脚本集合。

**统一入口**：加两条引用即可覆盖清单里所有 App。以后新增 App，你的引用不用改。

---

## 一、快速开始

在 QX 里添加两条引用。

| 位置 | 地址 |
|---|---|
| 设置 → **重写** → 引用 → 添加 | `https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-All.snippet` |
| 设置 → **过滤器** → 引用 → 添加 | `https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-Filter.snippet` |

**为什么是两条而不是一条？** 这是 QX 的限制，不是本仓库的设计选择：
`[rewrite_remote]` 只能装重写规则，`[filter_remote]` 只能装过滤器规则，
两者无法合并到一个文件里被引用。所以"统一入口"做到的是
**两条引用覆盖全部 App**，而不是物理上一个文件。

### MITM 证书（漏这步脚本一定不生效）

`AdBlock-All.snippet` 里带了 `hostname` 行，引用后 MITM 主机名会**自动生效**，
不需要手动往 设置 → MitM 里加。

但证书本身要装：

1. QX → 设置 → MitM → 生成证书 → 允许安装描述文件
2. 系统 设置 → 通用 → VPN与设备管理 → 安装该描述文件
3. **系统 设置 → 关于本机 → 证书信任设置 → 打开 Quantumult X 的开关** ← 关键
4. 回到 QX → 设置 → MitM → 打开 MitM 开关

---

## 二、支持清单

| App | 平台 | 适配版本 | 去广告范围 | 单 App 引用 |
|---|---|---|---|---|
| 两步路 / 户外助手 | iOS | 9.2.7 | 开屏、插屏/弹窗、信息流推广位、各广告位 + 31 个广告联盟域名拦截 | [重写](https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu.snippet) / [过滤](https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu-filter.snippet) |

> 只要能抓到明文 JSON 响应且无响应体签名的接口，就能加进来。

### 只想要某一个 App？

用单 App 引用替代聚合引用（二选一，别同时加）：

```
重写：  https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu.snippet
过滤器：https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/tbulu-filter.snippet
```

---

## 三、手动导入（不用引用功能）

不想用引用机制的话，把
[`AdBlock-All.conf`](https://gh-proxy.com/https://raw.githubusercontent.com/Cchenggg/QX/main/dist/AdBlock-All.conf)
的内容复制到 QX → 设置 → 配置文件 → `⋯` → 编辑 里，按段落合并：

| 段落 | 怎么加 |
|---|---|
| `[rewrite_local]` | 贴规则行，**别重复写 section 标题** |
| `[filter_local]` | 贴 `host, 域名, reject` 行 |
| `[mitm]` | 把 `hostname` **追加**到已有的后面，不要覆盖 |

⚠️ `.conf` 文件**不能用于引用**（含 `[section]` 标题，会报错），只适合手动导入。

---

## 四、排查

### 两个经典报错

| 报错 | 原因 | 正确做法 |
|---|---|---|
| `Invalid Line<!DOCTYPE html>` | 用了 `github.com/.../blob/...` 网页地址，QX 拿到的是 258KB HTML | 用 `raw.githubusercontent.com` 地址 |
| `Invalid Line [rewrite_local]` | 引用了含 `[section]` 标题的 `.conf` 完整配置 | 引用 `.snippet` 纯规则片段 |

依据：QX 官方 [sample-import-rewrite.snippet](https://github.com/crossutility/Quantumult-X/blob/master/sample-import-rewrite.snippet)
里只有规则行和可选的 `hostname` 行，没有任何 `[section]` 标题。

### 其他现象

| 现象 | 处理 |
|---|---|
| 脚本没生效，日志无标签输出 | ① MITM **证书信任开关**没开（最常见）② 引用没加载 ③ 脚本地址拉不到 |
| 引用地址打不开 | 换前缀：`gh-proxy.com` → `ghfast.top`，见下 |
| 有日志但开屏广告还在 | 该 App 的 `getSplash` 走了 QUIC 绕过 MITM，见「已知限制」 |
| 某 App 功能异常 | 把该 App 的 filter 域名注释掉复测，确认是否拦多了 |
| App 升级后失效 | 重新抓包比对接口字段，可能要调整脚本 |

### 地址选择

所有脚本与片段地址默认用 `gh-proxy.com` 前缀代理，因为实测
`raw.githubusercontent.com` 国内直连**不稳定**：

| 地址 | 直连成功率 | 延迟 |
|---|---|---|
| `https://gh-proxy.com/` | 6/6 | 0.7~1.3s |
| `https://ghfast.top/` | 6/6 | 1.1~1.4s |
| `https://raw.githubusercontent.com/` | 5/6（失败卡 15s） | — |

若确定 QX 里 GitHub 走代理，可把所有 `https://gh-proxy.com/https://raw.githubusercontent.com/`
替换为 `https://raw.githubusercontent.com/`。

### 更新机制

QX 对远程资源的默认同步间隔是 **86400 秒（24 小时）**。
想立即更新：QX → 设置 → 重写/过滤器 → 左滑对应条目 → 手动更新。

---

## 五、已知限制

**`getSplash` 类接口可能走 HTTP/3 (QUIC) 绕过 MITM**。
两步路的抓包里能看到 `sdkquic.e.qq.com`，其 `getSplash` 响应体 QX 没抓到。
脚本对它做的是「返回空列表」的稳妥处理，**不保证客户端一定接受**——
真正的兜底是 `adConfig` 关开关 + 域名 reject 两层。

若开屏广告仍在，可尝试在 QX `[general]` 加 `udp_drop_list = QUIC`
（让 App 回落 TCP，MITM 才能生效）。注意这是**全局设置**，可能影响其他 App 的 QUIC 性能。

**脚本拦不住的**：App 通过 URL Scheme / `LSApplicationWorkspace` 直接唤起第三方 App
的行为不走网络。但只要广告素材域名被 reject，就没有可点击的广告，也就无从唤起。

---

## 六、给维护者

### 仓库结构

```
apps/              每个 App 一个定义文件 ← 唯一事实来源
apps-scripts/      QX 脚本 + 配套 fixtures
src/               manifest 与渲染/解析工具
tests/             四层校验
docs/<app>/        抓包证据（har-index.tsv）
dist/              构建产物（勿手改）
build.js           构建
```

### 常用命令

```bash
node build.js              # 从 apps/ 生成 dist/ 与根目录别名
node build.js --check      # 校验 dist/ 与 apps/ 一致（CI 用）
node tests/run-all.js      # 四层离线校验
node tests/run-all.js --online   # 追加线上链接校验
npm run verify             # build:check + test
```

### 新增一个 App

见 [`CONTRIBUTING.md`](CONTRIBUTING.md) 与 [`apps/_schema.md`](apps/_schema.md)。概要：

1. 写 `apps/<app-id>.js`（复制 `apps/tbulu.js` 改）
2. 写 `apps-scripts/<name>.js` 与同名 `.fixtures.js`
3. 抓包索引放进 `docs/<app-id>/har-index.tsv`
4. `npm run verify` 必须全绿

### 四层校验在防什么

| 层 | 文件 | 防的问题 |
|---|---|---|
| 1 | `test-snippet-format.js` | 两个 `Invalid Line` 报错复发、兼容别名漂移 |
| 2 | `test-rules.js` | 正则不可编译、前缀误伤（`/getSplash` 命中 `/getSplashFrequencyStatistics`）、规则互相遮蔽、域名重复/冲突 |
| 3 | `test-script-contract.js` | 规则改了脚本没改（静默失效）、脚本改了规则没改、改写结果不对 |
| 4 | `test-evidence.js` | **域名拼写错误**（如 `guangtuikeji` 打成 `guangtuakeji`，拦不住任何东西且不报错）、链接失效、线上内容与仓库不一致 |

每条规则的边界面（`[\/?]`）与脚本内的路径守卫都由构建与校验强制，**不在 App 定义里手写正则**。

---

## 七、免责声明

本项目仅用于个人学习与减少干扰性广告，所有规则基于公开抓包整理。
请勿用于商业用途。使用风险自负。
