# patchkit 维护说明

本文件面向补丁维护者。使用者请参阅上一级 `README.md` 或本目录 `用法.md`。

---

## 补丁定义结构

```js
{
  id: 'chat-default-verbose',        // 唯一标识，命令行以它开关
  group: 'ui-layout',                // 分组，对应 patches/ 下的文件
  title: '默认视图改为全展开',          // 一句话说明
  why: '…',                          // 该条目修正的问题
  pkg: 'dsh-client-ui-chat',         // 目标包
  file: 'lib/client.js',             // 包内路径，支持通配符
  find: '原文',                       // 字符串、正则，或两者组成的数组
  repl: '替换内容',                   // 与 find 一一对应
  skip: /already-patched/,           // 已应用判定（正则）
  skipWhen: (t) => boolean,          // 需按结构判定时使用，优先于 skip
  verify: (t) => boolean,            // 应用后的断言
  optional: true,                    // 未匹配时计为跳过，不计为失败
}
```

`find` 与 `repl` 为数组时按顺序尝试，取首个匹配成功的组合。用于同一改动在不同版本中写法不一致的情况。

---

## 编写规则

**单条补丁对应单一行为。** 同一处的关联改动归入同一分组，不跨组。

**同组内按依赖排序。** 后一条依赖前一条插入的代码时，顺序不可调整。

**类名前缀不硬编码。** 打包后的 CSS Module 类名带构建 hash，不同构建取值不同。补丁中书写占位前缀，运行时按目标文件实际探测值替换。

**带 hash 的文件名使用通配符。** 形如 `dist/assets/index-*.css`，由脚本按目录展开。

**`verify` 以结构判定。** 断言依据目标结构书写，不使用补丁自身的注释文本作为判据。

**插入到 `switch` 或函数体内部的代码，`find` 与 `repl` 的括号必须成对核对。** `find` 匹配掉的闭合括号，`repl` 需原样补回，否则文件语法不完整，客户端无法加载。核对方法：对修改后的文件与官方原件分别做语法检查，两者报错行号之差等于插入行数，方可确认未引入新问题。

**组件样式可能存在于两处。** 外壳使用构建产物 `dsh-web-frontend/dist/assets/index-*.css`，仅修改 `*.module.css` 源文件不生效。两处均需修改：产物用于当前运行，源文件用于后续重建。

**`_patchkit-backup/` 仅保存首次出现的版本。** 该副本为官方原版，供恢复使用，不应在每次写入时覆盖。

---

## 补丁分组

| 分组 | 条数 | 内容 |
|---|---|---|
| `server` | 5 | 沙箱不写入 Low 完整性标签、令牌完整性不变、放行插件注入（两处校验） |
| `ui-inject` | 3 | 上下文注入独立成行、中文名称、快照展开 |
| `ui-reasoning` | 7 | 思考行：末行跟随、纯文本渲染、字号、行高、换行 |
| `ui-label` | 2 | 标签使用高一级色阶 |
| `ui-layout` | 2 | 默认全展开、行间距统一 |
| `ui-trajectory` | 3 | 轨迹行附带来源、详情栏中文名称 |

---

## 命令行

```
node patch.mjs --list                        列出全部补丁
node patch.mjs --target dev --check          查看状态，不写入
node patch.mjs --target dev                  应用全部
node patch.mjs --target dev --only ui-label  仅应用指定分组
node patch.mjs --target dev --only <id>      仅应用指定条目
node patch.mjs --target dev --skip server    跳过指定分组
```

## 目标类型

```
dev                          开发树（v2/node_modules/@deepseek-ai）
dir:<绝对路径>                任意解包目录，指向 @deepseek-ai 层级
asar:<绝对路径>               Electron 归档
```

桌面端使用 `dir:`。归档文件保留原状供恢复使用，修改对象为解包后的目录 —— 客户端加载 `resources/app/` 的优先级高于 `resources/app.asar`。

---

## 常见问题

**提示原文未匹配。** 目标版本不一致，或该包已被其他方式修改。以 `--check` 定位具体条目。

**提示替换后无变化。** 通常为 `skip` 判定过严：文件已处于目标状态但未被识别。补充 `skipWhen` 按结构判定。

**客户端停留在 Loading plugins。** 某个客户端 bundle 存在语法错误。检查日志中 `loaded without registering` 所在行以定位包名，从 `_patchkit-backup/` 取原件比对。

**大版本升级后多条补丁未匹配。** 客户端代码的引号形式、压缩程度、包结构均可能变化。逐条确认原文当前形式，将 `find` 改为不依赖引号与空白的正则，或在数组中加入新的写法。
