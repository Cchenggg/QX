# 贡献指南

本仓库是**多 App 去广告规则集合**。新增一个 App，就是加几个文件、跑通校验。

**使用者请看 [`README.md`](README.md)**；本文是维护者文档。

---

## 零、仓库结构与命令

```
apps/              每个 App 一个定义文件 ← 唯一事实来源
apps-scripts/      QX 脚本 + 配套 fixtures
src/               manifest 与渲染/解析工具
tests/             四层校验
docs/<app>/        抓包证据（har-index.tsv）
dist/              构建产物（勿手改）
build.js           构建
```

```bash
node build.js              # 从 apps/ 生成 dist/ 与根目录兼容别名
node build.js --check      # 校验 dist/ 与 apps/ 一致（CI 用）
node tests/run-all.js      # 四层离线校验
node tests/run-all.js --online   # 追加线上链接校验
npm run verify             # build:check + test，提交前必跑
```

### 四层校验在防什么

| 层 | 文件 | 防的问题 |
|---|---|---|
| 1 | `test-snippet-format.js` | 两个 `Invalid Line` 报错复发、兼容别名漂移 |
| 2 | `test-rules.js` | 正则不可编译、前缀误伤（`/getSplash` 命中 `/getSplashFrequencyStatistics`）、规则互相遮蔽、urlPrefix 规则误伤正常流量 |
| 3 | `test-script-contract.js` | 规则改了脚本没改（静默失效）、脚本改了规则没改、改写结果不对 |
| 4 | `test-evidence.js` | **域名拼写错误**（如 `guangtuikeji` 打成 `guangtuakeji`，拦不住任何东西且不报错） |

规则的边界面（`[\/?]`）、可选端口、URL 前缀匹配都由构建强制生成，
**不要在 App 定义里手写正则**。

---

## 一、开始之前：确认这个 App 值得做

先判断目标 App 的广告接口是否**可改写**。抓包确认三点：

1. 广告配置来自**明文 JSON 响应**（不是加密二进制、不是 protobuf）
2. 响应体**没有签名校验**（改了就失效的那种）
3. 请求可以 MITM（不是证书固定 / 不走 QUIC）

只要满足，就能做。参考两步路的例子：
`adConfig/get` 返回明文 JSON，只有**请求**带 `psign`，响应体无签名 —— 所以可安全改写。

> **反例**：如果广告是 SDK 自己在客户端根据本地配置决策的，且配置加密，那就只能靠
> `[filter_local]` 拦域名，无法精确关开关。

---

## 二、抓包要求

1. 用 Quantumult X 抓包（设置 → HTTP 抓包），完整走一遍：
   **冷启动 → 开屏 → 各主要页面 → 触发弹窗**
2. 把抓包导出的 HAR 里**请求索引**整理成 TSV，放到 `docs/<app-id>/har-index.tsv`
3. 建议同时写一份 `docs/<app-id>/ANALYSIS.md`，记录：
   - 广告总开关是哪个接口、哪些字段
   - 时间线（哪个接口对应哪个广告位）
   - 广告素材来自哪些联盟域名

索引表建议列（与两步路保持一致）：

```
请求序号	时间	方法	状态码	响应体大小	请求体大小	URL
```

> 这张表不是摆设：`tests/test-evidence.js` 会用它交叉校验每个被拦域名。
> **没有抓包证据的域名会被校验拦下** —— 这是为了防住"手打域名拼错"这类静默失效。

---

## 三、加文件的四个步骤

### 1. `apps/<app-id>.js` — 定义（唯一事实来源）

复制 `apps/tbulu.js` 改名，逐字段填写。**字段说明见 [`apps/_schema.md`](apps/_schema.md)。**

要点：

- `id` 必须与文件名一致（`build.js` 会校验）
- `rewrites[].path` **只写接口路径**，不要写正则 —— 边界由构建强制拼接
- `filterGroups` 里**只写域名**，从抓包复制，禁止手打
- `hosts` 填需要 MITM 解密的域名
- `evidence` 指向 `docs/<app-id>/har-index.tsv`

### 2. `apps-scripts/<name>.js` — QX 脚本

参考 `apps-scripts/tbulu-ads.js`。必须遵守：

- 暴露 `const TAG = "[<标签>]"`，与 `apps/<id>.js` 的 `logTag` 一致
- 暴露契约数组：

  ```js
  const MATCH_PATHS = ["/api/ad/config", /* ... */];
  ```

  它必须与 `rewrites[].path` **一一对应**（不多不少），由
  `tests/test-script-contract.js` 校验。

- 按 **pathname 精确等值**匹配，不要用 `indexOf` 做前缀匹配
  （否则 `/getSplash` 会误命中 `/getSplashFrequencyStatistics`）
- 非目标路径一律 `$done({})` **原样放行**，绝不误吞正常请求
- 解析失败也要兜底 `$done({})`，不能让 App 拿到空响应

### 3. `apps-scripts/<name>.fixtures.js` — 测试夹具

参考 `apps-scripts/tbulu-ads.fixtures.js`。必须提供：

- `paths`：每个受守卫路径的**真实形状响应体** + 断言函数
- `passthrough`：必须原样放行的路径（**含同前缀干扰项**，如 `/getSplashFrequencyStatistics`）
- `robustness`：异常输入（非 JSON、`data: null`、空 body）

### 4. `docs/<app-id>/har-index.tsv` — 抓包证据

见上一节。

### 5. 收尾

```bash
node build.js      # 生成 dist/ 与 SCRIPTS.md
npm run verify     # 构建一致性 + 四层校验，必须全绿
```

README 的「支持清单」表格也由构建产出，**不要手改**。

---

## 四、四条铁律（都是踩过的坑）

| # | 铁律 | 曾经的后果 |
|---|---|---|
| 1 | 规则末尾必须有 `[\/?]` 边界 | `/getSplash` 命中 `/getSplashFrequencyStatistics`，误改统计接口 |
| 2 | 域名必须从抓包复制 | `guangtuikeji.com` 打成 `guangtuakeji.com`，规则拦不住任何东西**且不报错** |
| 3 | 脚本按 pathname 精确匹配 | 同上前缀误伤 |
| 4 | 引用件不得含 `[section]` 标题 | QX 报 `Invalid Line [rewrite_local]`；用 blob 网页地址则报 `Invalid Line<!DOCTYPE html>` |
| 5 | urlPrefix 规则必须写 `selfTest` | 拦到正常流量的代价可能极高（百度网盘案例：拦错路径会失去 242MB 渲染引擎 → 预览功能损坏） |

前三条已由构建强制（你在 `apps/*.js` 里写不出正则），第四条由
`tests/test-snippet-format.js` 固化拦截，第五条由 `tests/test-rules.js`
强制（`selfTest.exclude` 里必须包含同域的正常流量 URL，且断言不被命中）。

> **用 urlPrefix 前的必做功课**：先抓包确认同一域名下**确实**存在必须放行的正常流量。
> 如果该域名纯粹是广告域名，用 `filterGroups` 整域 reject 更简单也更安全。

---

## 五、禁止事项

- ❌ 直接改 `dist/`、`SCRIPTS.md`、根目录的 `rewrite.snippet` / `filter.snippet` / `rewrite.conf`
  —— 都是构建产物，改了会被 `node build.js --check` 打回
- ❌ 在 `apps/*.js` 里手写正则或手拼 URL
- ❌ 为了"保守"而拦 SDK 上报域名（拦了没用还增加误伤面）；
  确实要放行的写进 `filterExempt` 并说明原因
- ❌ 删除 `dist/` 里的文件 —— 老用户可能正在引用它们
  （根目录三个兼容别名尤其不能动，改了地址会让老用户配置失效）

---

## 六、提交前自检清单

- [ ] `npm run verify` 全绿
- [ ] `apps/<id>.js` 的 `logTag` 与脚本 `TAG` 一致
- [ ] `MATCH_PATHS` 与 `rewrites[].path` 一一对应
- [ ] 每个被拦域名都能在 `har-index.tsv` 里搜到
- [ ] `fixtures` 覆盖了所有守卫路径 + 同前缀干扰项
- [ ] 新 App 已出现在 README / SCRIPTS.md 的清单里（跑过 `node build.js`）
- [ ] 没有把 HAR 原件（可能几十 MB）提交进仓库，只提交索引 TSV

---

## 七、CI 行为

`.github/workflows/build.yml`：

| Job | 触发 | 内容 |
|---|---|---|
| `verify` | push / PR | `build.js --check` + 四层离线校验（阻塞合并） |
| `online` | push main | 线上链接可用性校验（`continue-on-error`，不阻塞） |

`online` 单独拆出来是因为它依赖公网，网络抖动不应阻塞合并。
