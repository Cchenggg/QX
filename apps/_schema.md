# `apps/*.js` 字段说明

每个 App 一个文件，文件名即 `id`（小写连字符）。这是该 App 的**唯一事实来源**，
`dist/` 下的所有分发件都由 `build.js` 从这里生成。

新增 App：复制 `apps/tbulu.js` 改名，改完跑 `npm test`。

---

## 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 唯一标识，须与文件名一致。用于 `dist/<id>.snippet` 等命名 |
| `name` | string | ✅ | 短名，用于分发件里的分组注释，如「两步路」 |
| `displayName` | string | ✅ | 完整名，用于 README 清单表，如「两步路 / 户外助手」 |
| `enabled` | boolean | ✅ | `false` 时该 App 不参与聚合分发件（但单 App 片段仍生成，便于排查） |
| `app` | object | ✅ | 见下 |
| `scripts` | string[] | ✅ | 需要的脚本文件名，相对 `apps-scripts/` |
| `hosts` | string[] | ✅ | 需要 MITM 解密的域名 |
| `rewrites` | object[] | ✅ | 重写规则，见下 |
| `filterGroups` | object[] | ✅ | 域名拦截，按用途分组，见下 |
| `logTag` | string | ✅ | 日志标签，须与脚本里的 `TAG` 一致，由 `test-script-contract.js` 校验 |
| `evidence` | string | ⬜ | 抓包索引相对 `docs/` 的路径；`test-evidence.js` 用它交叉校验域名 |
| `filterExempt` | string[] | ⬜ | 明确放行不拦的域名，写明原因，避免后人误加 |
| `filterExemptNote` | string | ⬜ | 放行原因 |

### `app`

| 字段 | 说明 |
|---|---|
| `bundle` | 包名 / Bundle ID |
| `platform` | `ios` / `android` / `both` |
| `version` | 编写时抓到的 App 版本 |
| `capturedAt` | 抓包日期 `YYYY-MM-DD` |

---

## `rewrites[]`

rewrites 支持**两种模式**，二选一。

### 模式 A：`path`（常规接口改写，绝大多数情况用这个）

| 字段 | 必填 | 说明 |
|---|---|---|
| `path` | ✅ | **只写接口路径**，如 `/adConfig/get`。不要写正则、不要带 query |
| `action` | ✅ | QX 动作，如 `script-response-body`、`reject` |
| `script` | 条件 | `action` 含 `script-` 时必填，值须在 `scripts[]` 里 |
| `note` | ⬜ | 中文说明，会作为注释写进分发件 |

**路径不要手写正则**：`build.js` 会自动拼成 `^https?:\/\/<host><path>[\/?]`，
末尾 `[\/?]` 边界强制附加。这是为了避免踩过的坑——
不加边界时 `/getSplash` 会命中 `/getSplashFrequencyStatistics`。

### 模式 B：`urlPrefix` + `urlPattern`（同域混用，精确到路径）

用于**同一域名下只有部分路径是广告**的场景。典型：百度网盘的素材 CDN
`antpcdn.com` 既承载开屏素材（`/e/`）又承载 242MB 的渲染引擎（`/b/`），
整域拦截会破坏核心功能，必须按路径切分。

| 字段 | 必填 | 说明 |
|---|---|---|
| `urlPrefix` | ✅ | 主机部分，可用占位符 |
| `urlPattern` | ✅ | host 之后的路径部分，可用占位符 |
| `stopAfter` | ⬜ | 默认 `false`（前缀匹配，允许后面还有内容）。`true` 时要求 URL 在此结束 |
| `action` | ✅ | 通常为 `reject` |
| `note` | ⬜ | 说明必须写清「为什么不能整域拦」 |
| `selfTest` | ✅ | `{match:[], exclude:[]}`，真实抓包 URL 样例 |

**占位符**（不要直接写正则语法——会被 `esc()` 转义成字面量）：

| 占位符 | 展开为 | 用途 |
|---|---|---|
| `{OPT_SUB}` | `(?:[^/]*\.)?` | 可选子域名 |
| `{ANY}` | `[^/]*` | 单层任意段 |
| `{ANYDIR}` | `(?:[^/]*\/)*` | 多层任意目录段 |
| `{HOST}` | `[^/]+` | 任意主机名 |

主机名后**可选端口**由构建自动处理（`(?::\d+)?`），无需自己写。

**`selfTest` 是强制的**：urlPrefix 规则无法从正则反推校验样例，
必须提供真实抓包 URL。`tests/test-rules.js` 会断言
`match` 全部命中、`exclude` 全部不命中——这是防止误伤核心功能的唯一保障。

```js
{
  urlPrefix: "{ANY}antpcdn.com",
  urlPattern: "/e/{HOST}/{ANYDIR}",
  action: "reject",
  note: "开屏素材 CDN 代理路径。⚠️ 不能拦 /b/ —— 那是渲染引擎 render_resourcd.zip(242MB)",
  selfTest: {
    match:   ["https://xxx.antpcdn.com:19001/e/s0-ant.baidu.com/staticsns/amis/2026-8/1/a.png"],
    exclude: ["https://xxx.antpcdn.com:19001/b/pkg-ant.baidu.com/.../render_resourcd.zip"],
  },
}
```

> **选型建议**：能用模式 A 就别用模式 B。模式 B 只适合"域名本身不能拦"
> 的情况——先去抓包确认同一域名下确实有必须放行的正常流量。

---

## `filterGroups[]`

| 字段 | 必填 | 说明 |
|---|---|---|
| `note` | ✅ | 分组说明，写清"拦的是谁的什么请求" |
| `hosts` | ✅ | 域名数组，只写域名 |

**域名写法铁律**：

1. **必须从抓包文件复制，禁止手打**。
   曾经把 `guangtuikeji.com` 打成 `guangtuakeji.com` —— 拼错的域名拦不住任何东西，
   **而且不会报任何错**。`test-evidence.js` 会拿 `docs/<app>/har-index.tsv` 交叉校验，
   没有抓包证据的域名会被拦下。
2. 只写域名：不带 `http://`、不带端口、不带路径、不带通配符（`host` 项不支持通配）。
3. 全部小写。
4. **不要为了"保守"而拦 SDK 上报域名**——拦了没用还增加误伤面。
   确实想放行的写进 `filterExempt` 并说明原因。
5. 同一域名不要重复出现；也不要同时出现在 `hosts`（要 MITM 解密）和
   `filterGroups`（要 DNS reject）里——一个要解密一个要阻断，语义互斥。

---

## 校验会检查什么

`npm test` 会验证（详见 `tests/`）：

- 分发件格式：不含 `[section]` 标题、不含 HTML、LF 换行
- 规则语法：正则可编译、双向匹配（自己的 URL 命中、同前缀干扰 URL 不命中）
- 规则遮蔽：没有一条规则的正则命中另一条规则的目标 URL
- 脚本契约：`rewrites[].path` 与脚本导出的 `MATCH_PATHS` **一一对应**
- 域名：语法合法、无重复、无 hosts/filters 冲突
- 证据：每个拦截域名都能在抓包索引里找到
- 链接：线上 raw 地址返回 200、非 HTML、内容与本地一致（`--online`）
