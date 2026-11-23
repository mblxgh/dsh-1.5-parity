// E 组：轨迹视图（TrajectoryTable）
// 2.0 的轨迹行只显示 kind 标签（「上下文」「系统」），来源要展开详情才看得到，
// 而详情里也只是把 kind 首字母大写（Runtime-context 这种）。
// 这里补一个来源后缀直接挂在行标签后面，并把详情的「来源」栏改成中文名。

// 行标签用的后缀函数。插进 client.js 之后，任何地方都能调。
const SOURCE_SUFFIX_FN = `/** [patchkit] 轨迹行的一句话来源后缀，让读者不用展开就能看出这条注入来自哪。 */
function trajectorySourceSuffix(source, t) {
	if (typeof source !== "object" || source === null || Array.isArray(source)) return "";
	const kind = source.kind;
	if (kind === "user") return "";
	if (kind === "agent-instructions") {
		const paths = Array.isArray(source.changes) ? source.changes.map((c) => c && c.path).filter((p) => typeof p === "string" && p !== "") : [];
		return paths.length === 0 ? "" : " · " + paths.join("、");
	}
	if (kind === "skill-catalog") {
		const n = Array.isArray(source.entries) ? source.entries.length : 0;
		return n === 0 ? " · 技能目录" : " · 技能目录 " + n + " 条";
	}
	if (kind === "session-reference") {
		const labels = Array.isArray(source.references) ? source.references.map((r) => r && r.label).filter((l) => typeof l === "string" && l !== "") : [];
		return labels.length === 0 ? "" : " · " + labels.join("、");
	}
	if (kind === "plugin") return typeof source.plugin === "string" && source.plugin !== "" ? " · " + source.plugin : "";
	if (kind === "runtime-context" || kind === "system-prompt") {
		const SECTION_NAMES = {
			"memory": "记忆",
			"sandbox:policy": "文件策略",
			"approval:policy": "审批策略",
			"time-context": "时间",
			"prompt-preset": "预设",
			"skill-catalog": "技能目录",
			"hindsight": "Hindsight"
		};
		const sections = Array.isArray(source.sections) ? source.sections.map((s) => s && s.name).filter((s) => typeof s === "string" && s !== "").map((n) => SECTION_NAMES[n] ?? n) : [];
		return sections.length === 0 ? "" : " · " + sections.join("、");
	}
	if (kind === "compact-checkpoint") return " · 压缩检查点";
	if (kind === "approval-request" || kind === "sandbox-mode") return "";
	return typeof kind === "string" && kind !== "" ? " · " + kind : "";
}
`;

// 详情「来源」栏的中文名表。
const SOURCE_NAMES_BLOCK = `/* [patchkit] 中文名 + 具体来源，替掉原来的首字母大写 */
			const SOURCE_NAMES = {
				"agent-instructions": "工作区指令",
				"skill-catalog": "技能目录",
				"skill-invocation": "技能调用",
				"runtime-context": "运行时快照",
				"system-prompt": "系统提示词",
				"session-reference": "跨会话召回",
				"compact-checkpoint": "压缩检查点",
				"plugin": "插件"
			};
			const base = SOURCE_NAMES[kind] ?? \`\${kind[0]?.toUpperCase() ?? ""}\${kind.slice(1)}\`;
			const suffix = trajectorySourceSuffix(properties, t);
			return suffix === "" ? base : base + suffix;
		}`;

export default [
  {
    id: 'trajectory-source-fn',
    group: 'ui-trajectory',
    title: '插入 trajectorySourceSuffix 函数',
    why: '轨迹行的来源后缀靠它算。后面两条都要用。',
    pkg: 'dsh-client-ui-trajectory',
    file: 'lib/client.js',
    // 两版差别只在一处空格：0.2.0 是 `messageSourceLabel(source, t) {`，0.2.2 是 `messageSourceLabel(source,t){`。
    find: /(function messageSourceLabel\(source,\s*t\)\s*\{)/,
    repl: SOURCE_SUFFIX_FN + '$1',
    skip: /function trajectorySourceSuffix\(source, t\) \{/,
    verify: (t) => t.includes('function trajectorySourceSuffix(source, t)'),
  },

  {
    id: 'trajectory-kind-label',
    group: 'ui-trajectory',
    title: '轨迹行的 kind 标签后面加来源',
    why: '原来是「上下文」三个字，读者得展开详情才知道这条注入来自哪。' +
      '加上后缀直接变成「上下文 · $DSH_HOME/AGENTS.md」。',
    pkg: 'dsh-client-ui-trajectory',
    file: 'lib/client.js',
    find: [
      /className: TrajectoryTable_module_css_default\.kindTagLabel,\n(\s*)children: t\(KIND_LABEL_KEY\[record\.cell\.kind\]\)/,
      /kindTagLabel,children:t\(KIND_LABEL_KEY\[record\.cell\.kind\]\)/,
    ],
    repl: [
      'className: TrajectoryTable_module_css_default.kindTagLabel,\n$1children: `${t(KIND_LABEL_KEY[record.cell.kind])}${trajectorySourceSuffix(record.cell.messageSource, t)}`',
      'kindTagLabel,children:`${t(KIND_LABEL_KEY[record.cell.kind])}${trajectorySourceSuffix(record.cell.messageSource,t)}`',
    ],
    skip: /\$\{trajectorySourceSuffix\(record\.cell\.messageSource/,
    verify: (t) => /\$\{trajectorySourceSuffix\(record\.cell\.messageSource/.test(t),
  },

  {
    id: 'trajectory-source-label',
    group: 'ui-trajectory',
    title: '详情「来源」栏改用中文名 + 具体来源',
    why: '原来是 kind 首字母大写（Runtime-context 这种）。改中文名，再把 changes/sections 展开成具体来源。',
    pkg: 'dsh-client-ui-trajectory',
    file: 'lib/client.js',
    find: [
      '\tif (typeof kind !== "string" || kind === "") return t("source.unknown");\n\t\t\treturn `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`;\n\t\t}',
      'if(typeof kind!==`string`||kind===``)return t(`source.unknown`);return`${kind[0]?.toUpperCase()??``}${kind.slice(1)}`}',
    ],
    repl: [
      '\tif (typeof kind !== "string" || kind === "") return t("source.unknown");\n\t\t\t' + SOURCE_NAMES_BLOCK,
      'if(typeof kind!==`string`||kind===``)return t(`source.unknown`);' + SOURCE_NAMES_BLOCK,
    ],
    skip: /\[patchkit\] 中文名 \+ 具体来源/,
    verify: (t) => t.includes('const SOURCE_NAMES = {'),
  },
];
