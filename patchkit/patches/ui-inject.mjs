// B 组：对话流里的「上下文注入」这一行
//
// 1.5 里注入在正文和轨迹各显示一份；2.0 只在轨迹里留，正文被两道关卡联手藏了。
//
// 0.2.2 起官方自己修了第二道（isVisibleChatNode 不再要求 context 带工具变更），
// 所以「可见」那条在新版上本来就成立，只剩「中文名 + 快照展开」还需要补。
// 第一道（白名单 TURN_PROCESS_INDEPENDENT_KINDS）在 0.2.2 里被 stepGrouping 机制取代了，
// 靠 ui-layout 的 verbose 档一起解决，这里那条标成可选。

const LABELS_FIND_020 = `\t\t\t\tcase "skill-invocation": return {
\t\t\t\t\trole: "inject",
\t\t\t\t\tlabel: readString(record, "name") ?? kind
\t\t\t\t};
\t\t\t\tdefault: return {
\t\t\t\t\trole: "inject",
\t\t\t\t\tlabel: kind
\t\t\t\t};`;

// 0.2.2 的代码压成一行、引号换成反引号，结构一模一样。
const LABELS_FIND_022 = 'case`skill-invocation`:return{role:`inject`,label:readString(record,`name`)??kind};default:return{role:`inject`,label:kind}}}';

const LABELS_REPL_HEAD = '/* [patchkit] 运行期快照 / 技能目录给中文名，快照展开成各段贡献者 */';

const LABELS_BODY = `case "runtime-context":
case "system-prompt": {
\tconst SECTION_NAMES = {
\t\t"memory": "记忆",
\t\t"sandbox:policy": "文件策略",
\t\t"approval:policy": "审批策略",
\t\t"time-context": "时间",
\t\t"prompt-preset": "预设",
\t\t"skill-catalog": "技能目录",
\t\t"hindsight": "Hindsight"
\t};
\tconst list = Array.isArray(record.sections) ? record.sections : [];
\tconst names = list.map((s) => s && s.name).filter((n) => typeof n === "string" && n !== "").map((n) => SECTION_NAMES[n] ?? n);
\treturn {
\t\trole: "inject",
\t\tlabel: names.length === 0 ? (kind === "runtime-context" ? "运行期快照" : "系统提示词") : names.join("、")
\t};
}
case "skill-catalog": {
\tconst n = Array.isArray(record.entries) ? record.entries.length : 0;
\treturn {
\t\trole: "inject",
\t\tlabel: n === 0 ? "技能目录" : \`技能目录 \${n} 条\`
\t};
}
default: return {
\trole: "inject",
\tlabel: kind
};`;

export default [
  {
    id: 'chat-context-independent-row',
    group: 'ui-inject',
    title: '上下文注入在对话流里独立成行（0.2.0 专用）',
    why: '0.2.0 把 context 归进「过程组」，只有轨迹里能看到；白名单里加进 context 就独立成一条。' +
      '0.2.2 换成了 stepGrouping 机制，这个白名单不存在了，靠 ui-layout 的 verbose 档解决 —— 所以标成可选。',
    optional: true,
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: 'const TURN_PROCESS_INDEPENDENT_KINDS = new Set([\n\t\t\t"system-prompt",\n\t\t\t"user",',
    repl: 'const TURN_PROCESS_INDEPENDENT_KINDS = new Set([\n\t\t\t"system-prompt",\n\t\t\t/* [patchkit] 上下文注入独立成行，不进过程组 */\n\t\t\t"context",\n\t\t\t"user",',
    skip: /TURN_PROCESS_INDEPENDENT_KINDS = new Set\(\[\n\t\t\t"system-prompt",\n\t\t\t\/\* \[patchkit\]/,
    // 只看结构：白名单里出现 "context" 就算打过（不管注释写成什么样）
    verify: (t) => /TURN_PROCESS_INDEPENDENT_KINDS = new Set\(\[\s*"system-prompt",[\s\S]{0,240}?"context",/.test(t),
  },

  {
    id: 'chat-context-visible',
    group: 'ui-inject',
    title: '去掉「普通 context 不可见」的限制（0.2.0 专用）',
    why: '0.2.0 的 isVisibleChatNode 只在 context 含 tool-addition/tool-removal 时放行，' +
      '纯文本注入永远不满足，节点造出来也会被滤掉。0.2.2 官方已经删掉这个条件，所以这条在新版自己就成立。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: 'return node.visibility === "visible" && node.kind !== "system-prompt" && (node.kind !== "context" || node.data.content.some((block) => block.type === "tool-addition" || block.type === "tool-removal")) && !(node.kind === "command" && node.data.name === "permission");',
    repl: '/* [patchkit] 去掉「普通 context 不可见」的限制：1.5 的正文里注入是一行一行显示的 */\n\t\t\treturn node.visibility === "visible" && node.kind !== "system-prompt" && !(node.kind === "command" && node.data.name === "permission");',
    skip: /\[patchkit\] 去掉「普通 context 不可见」/,
    verify: (t) => !t.includes('node.kind !== "context" || node.data.content.some'),
  },

  {
    id: 'chat-context-labels',
    group: 'ui-inject',
    title: '注入行出中文名 + 把快照展开成各段贡献者',
    why: '放行后显示的是 runtime-context / skill-catalog 这种 raw kind。' +
      '这里给中文名，并把 runtime-context 的 sections 展开成「记忆、文件策略、审批策略」——' +
      '比 1.5 只显示插件包名更清楚。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    // 两版写法不同，都列出来，谁先匹配上就用谁。
    // 0.2.2 那条 find 把结尾的 `}}}`（对象 + switch + 函数）一起吃掉了，
    // 所以 repl 必须原样补回去，否则整个 client.js 语法断裂、客户端一条都加载不起来。
    find: [LABELS_FIND_020, LABELS_FIND_022],
    repl: [LABELS_REPL_HEAD + '\n' + LABELS_BODY, LABELS_REPL_HEAD + LABELS_BODY + '}}'],
    skip: /\[patchkit\] 运行期快照/,
    verify: (t) => t.includes('case "runtime-context":') && t.includes('SECTION_NAMES'),
  },
];
