// A 组：服务端行为
// 这三条决定「沙箱怎么给权限」「插件注入的消息能不能落盘」——不修它们，后面全白搭。
// 顺序有依赖：sandbox 两条互不相干；loop 与 format 是同一件事的两道门，必须都开。

export default [
  {
    id: 'sandbox-no-low-label',
    group: 'server',
    title: '沙箱不再给工作区打 Low 完整性标签',
    why: '2.0 的 grantWrite 会把 Low 标签写成可继承 ACE。整个 F 盘程序都在被授权目录里，' +
      '打了标签就是全机降权（2026-09-29 真出过事）。改成 keep：保留现有标签、不强加。',
    pkg: 'dsh-sandbox-windows-acl',
    file: 'lib/types-*.js',   // 文件名带构建 hash（0.2.0 是 types-Cl_DXjhk.js，0.2.2 是 types-DXWX0PXB.js）
    find: /\t\tlet label;\n\t\ttry \{\n\t\t\tlabel = buildLowLabelAcl\(api, lowLabelSidPtr\);\n\t\t\} catch \(error\) \{\n\t\t\tif \(descriptor !== null\) api\.localFree\(descriptor\);\n\t\t\tthrow error;\n\t\t\}\n(\t\tmergeAndApply\(api, path, Buffer\.concat\(\[buildExplicitAccess\(worldSidPtr, 3, 64, 2\), buildExplicitAccess\(sidPtr, 1, GRANT_MASK\)\]\), oldAcl, )\{\n\t\t\tkind: "apply",\n\t\t\tacl: label\n\t\t\}/,
    repl: '\t\t/* [patchkit] 不打 Low 完整性标签：label 动作改成 keep（保留现有、不强加）。 */\n$1{\n\t\t\tkind: "keep"\n\t\t}',
    // 已打的判据：grantWrite 那次 mergeAndApply 的 label 动作是 keep。
    // 不能查「有没有 apply+acl:label」—— 补丁注释里就写着这串，会误判成没打。
    skipWhen: (t) => /oldAcl, \{\s*kind: "keep"\s*\}, descriptor, "grantWrite"/.test(t),
    verify: (t) => /oldAcl, \{\s*kind: "keep"\s*\}, descriptor, "grantWrite"/.test(t),
  },

  {
    id: 'sandbox-no-restrict-integrity',
    group: 'server',
    title: '沙箱令牌不把完整性降到 Low',
    why: '2.0 额外调 restrictTokenIntegrity 把沙箱令牌本身也降到 Low。1.5 只剥特权、不降完整性。',
    pkg: 'dsh-sandbox-windows-acl',
    file: 'lib/types-*.js',   // 文件名带构建 hash（0.2.0 是 types-Cl_DXjhk.js，0.2.2 是 types-DXWX0PXB.js）
    find: /\n\t\t\trestrictTokenIntegrity\(api, restrictedToken, lowLabelSid\);/,
    repl: '\n\t\t\t/* [patchkit] 不调 restrictTokenIntegrity：令牌保持原完整性，只剥特权（同 1.5）。 */',
    skip: /\[patchkit\] 不调 restrictTokenIntegrity/,
    verify: (t) => !t.includes('restrictTokenIntegrity(api, restrictedToken'),
  },

  {
    id: 'loop-allow-plugin-source',
    group: 'server',
    title: 'agent-loop 认 plugin 来源的注入消息',
    why: '2.0 的 isOwned 只认 kind === "runtime-context"，1.5 的 kind === "plugin" 被当成外来物丢掉，' +
      'mneme / Hindsight / prompt-preset 的注入全废。',
    pkg: 'dsh-agent-loop',
    file: 'lib/index.js',
    find: /function isOwned\(message\) \{\n\treturn message\.source\.kind === SOURCE;\n\}/,
    repl: 'function isOwned(message) {\n\t/* [patchkit] 补回 1.5 的 plugin 来源，否则插件注入的消息会被 loop 丢掉。 */\n\treturn message.source.kind === SOURCE || message.source.kind === "plugin";\n}',
    skip: /message\.source\.kind === "plugin"/,
    verify: (t) => t.includes('message.source.kind === "plugin"'),
  },

  {
    id: 'format-allow-plugin-source',
    group: 'server',
    title: 'v4 会话格式放行 plugin 来源（两处校验）',
    why: '2.0 新增的 v3→v4 兼容层会把 source.kind === "plugin" 判为非法并抛 SessionFormatError，' +
      '跟上面那条是同一件事的第二道门。删掉排除条件。',
    pkg: 'dsh-session-format-v3-to-v4',
    file: 'lib/index.js',
    find: / \|\| value\["kind"\] === "plugin"\) throw new SessionFormatError\("format v4 message requires a producer-owned source kind"\);/g,
    repl: ' /* [patchkit] 放行插件注入的 source */) throw new SessionFormatError("format v4 message requires a producer-owned source kind");',
    skip: /\[patchkit\] 放行插件注入的 source/,
    // 只看结构：v4 校验里不再出现 value["kind"] === "plugin" 这个排除条件
    verify: (t) => !/value\["kind"\] === "plugin"\) throw a SessionFormatError|value\["kind"\] === "plugin"\) throw new SessionFormatError/.test(t),
  },

  {
    id: 'format-allow-plugin-developer',
    group: 'server',
    title: 'v4 会话格式放行 plugin 来源（developer 消息那条）',
    why: '同上，是 assertDeveloperMessage 里的另一处同类校验。',
    pkg: 'dsh-session-format-v3-to-v4',
    file: 'lib/index.js',
    find: / \|\| source\["kind"\] === "plugin"\) throw new SessionFormatError\("format v4 developer message requires id, role, content, and a producer-owned source"\);/,
    repl: ' /* [patchkit] 同上 */) throw new SessionFormatError("format v4 developer message requires id, role, content, and a producer-owned source");',
    skip: /\[patchkit\] 同上 \*\/\) throw new SessionFormatError\("format v4 developer/,
    verify: (t) => !t.includes('source["kind"] === "plugin"'),
  },

  {
    id: 'sandbox-short-circuit-without-label',
    group: 'server',
    title: '不打 Low 标签后，授权短路不再要求标签',
    why: 'grantWrite 开头有一个「已经授过权就直接返回」的短路，它的条件里含 hasExactLabel(低完整性标签)。' +
      '上面那条 sandbox-no-low-label 把 label 动作改成 keep（不再打标签），于是这个条件永远为假 —— ' +
      '每次 pwsh 命令都要重新 merge + apply 一遍 DACL，在中文长路径上极慢，还要抢同一把路径锁，' +
      '表现为「命令永远跑不完」（2026-11-24 桌面端实测：同一句 Get-ChildItem 在 1.5 秒回、在 2.2 无限挂起）。' +
      '1.5 的同一函数只有 hasExactGrant 一条条件，所以它一直正常；这里把标签那条去掉，只留「授权 ACE 与 world deny 都在」。',
    pkg: 'dsh-sandbox-windows-acl',
    file: 'lib/types-*.js',
    find: /if \(oldAcl !== null && labelAcl !== null && hasExactGrant\(oldAcl, sidPtr\) && hasExactDeny\(oldAcl, worldSidPtr\) && hasExactLabel\(labelAcl, lowLabelSidPtr\)\) \{/,
    repl: 'if (oldAcl !== null && hasExactGrant(oldAcl, sidPtr) && hasExactDeny(oldAcl, worldSidPtr) /* [patchkit] 不再要求 Low 标签：上面的 label 动作已改成 keep，要求它就永远进不来，每条命令都要重改一次 DACL */) {',
    skip: /hasExactDeny\(oldAcl, worldSidPtr\) \/\* \[patchkit\] 不再要求 Low 标签/,
    // 判据：短路条件里不再出现 hasExactLabel
    verify: (t) => !/hasExactLabel\(labelAcl, lowLabelSidPtr\)\) \{/.test(t),
  },
];
