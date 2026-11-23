// C 组：思考行（ReasoningRow）
// 1.5 的思考：
//   · 折叠时缩略行显示「全文最后一行」，每帧跟着末端滚
//   · 展开时是 white-space:pre-wrap 的纯文本，13px / 20px / 灰色，原文几个换行就是几个
// 2.0 的思考：
//   · 缩略行取「最后一个已完成段落的第一行」→ 看着像定时刷新
//   · 展开时走 markdown，段落吃 <p> margin，字号靠 compact 变体给
// 下面按依赖顺序排，改代码前别调顺序。
//
// 0.2.2 把客户端代码压成一行、引号从 " 换成 `，所以 find 尽量写成不管引号与空白的正则；
// 结构真的变了的（渲染槽）才列两种写法。

export default [
  {
    id: 'reasoning-latest-line-fn',
    group: 'ui-reasoning',
    title: '插入 latestLine（取全文最后一个非空行）',
    why: '1.5 的做法。后续那条要靠它。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    // 不管 `function firstLine(text) {` 还是 `function firstLine(text){`，都在它前面插。
    find: /(function firstLine\(text\)\s*\{)/,
    repl: '/** [patchkit] 取全文最后一个非空行（1.5 的做法）。 */\n\t\tfunction latestLine(text) {\n\t\t\tconst visible = text.trimEnd();\n\t\t\tconst newline = visible.lastIndexOf("\\n");\n\t\t\treturn newline === -1 ? visible : visible.slice(newline + 1);\n\t\t}\n\t\t$1',
    skip: /function latestLine\(text\) \{/,
    verify: (t) => t.includes('function latestLine(text)'),
  },

  {
    id: 'reasoning-latest-line',
    group: 'ui-reasoning',
    title: '思考缩略行改用末行跟随',
    why: '2.0 取「最后一个已完成段落的第一行」，段内正在写的那行不参与显示，看着像定时刷新（其实按段落跳）。' +
      '1.5 是每帧跟着末端走。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: /const summaryText\s*=\s*running\s*\?\s*latestCompletedParagraphFirstLine\(text\)\s*:\s*firstLine\(text\);/,
    repl: 'const summaryText = running ? latestLine(text) : firstLine(text); /* [patchkit] 恢复 1.5 的末行跟随 */',
    skip: /const summaryText\s*=\s*running\s*\?\s*latestLine\(text\)/,
    verify: (t) => /const summaryText\s*=\s*running\s*\?\s*latestLine\(text\)/.test(t),
  },

  {
    id: 'reasoning-body-color',
    group: 'ui-reasoning',
    title: '思考正文补回灰色 + 清掉段落外边距',
    why: '1.5 的 thinkBody 有 color:var(--dsw-alias-label-tertiary)（灰），2.0 没设、继承了正文黑，' +
      '所以 2.0 的思考看着更「重」。顺手把 <p> 的上下外边距清零（后面 pre-wrap 要用）。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: '.lcKema_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0}',
    repl: '.lcKema_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0;color:var(--dsw-alias-label-tertiary)}'
      + '.lcKema_root .lcKema_thinkBody p{margin-top:0!important;margin-bottom:0!important}'
      + '.lcKema_root .lcKema_thinkBody p+p{margin-top:calc(20px + var(--dsh-content-font-delta-secondary,0px))!important}',
    skip: /\.lcKema_thinkBody\{padding:[^}]*color:var\(--dsw-alias-label-tertiary\)/,
    verify: (t) => /\.\w+_thinkBody\{padding:[^}]*color:var\(--dsw-alias-label-tertiary\)/.test(t),
  },

  {
    id: 'reasoning-body-font',
    group: 'ui-reasoning',
    title: '思考正文字号 13px / 行高 20px',
    why: '2.0 靠 markdown 的 compact 变体给这两个值；正文改成纯文本后没人给，会继承容器的 14px，' +
      '看着大一号。1.5 的 thinkBody 明确写着 13/20。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: '.lcKema_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0;color:var(--dsw-alias-label-tertiary)}',
    repl: '.lcKema_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',
    skip: /\.lcKema_thinkBody\{padding:[^}]*font-size:var\(--dsh-content-font-size-secondary/,
    verify: (t) => /\.\w+_thinkBody\{padding:[^}]*font-size:var\(--dsh-content-font-size-secondary/.test(t),
  },

  {
    id: 'reasoning-body-wrap',
    group: 'ui-reasoning',
    title: '思考正文换行方式改 pre-wrap + 断词',
    why: '2.0 是 normal：模型打的单个换行被折成空格，整段挤成一行长文；长英文串还不断词、横向溢出被裁。' +
      '1.5 是 pre-wrap。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: '.lcKema_root .lcKema_thinkBody p{margin-top:0!important;margin-bottom:0!important}',
    repl: '.lcKema_root .lcKema_thinkBody{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}'
      + '.lcKema_root .lcKema_thinkBody p{margin-top:0!important;margin-bottom:0!important}',
    // 已打的判据必须是「thinkBody 那条规则里出现了 pre-wrap」——
    // 只查 white-space:pre-wrap 这个通用串会被文件别处的规则骗过去。
    skipWhen: (t) => /\w+_thinkBody\{[^}]*white-space:pre-wrap/.test(t),
    verify: (t) => /\w+_thinkBody\{[^}]*white-space:pre-wrap/.test(t),
  },

  {
    id: 'reasoning-plaintext',
    group: 'ui-reasoning',
    title: '思考正文不走 markdown，按纯文本渲染',
    why: '光加 pre-wrap 不够：markdown 生成的 <p> 外边距会和 pre-wrap 留下的空行叠加，段落之间空两行。' +
      '1.5 根本不解析 markdown，直接渲染原文。这条让它回到那个行为。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    // 0.2.0：直接挂 MarkdownText。0.2.2：改成渲染槽 renderSlot，槽里默认还是 markdown。
    find: [
      /expanded \? \(0, react_jsx_runtime\.jsx\)\("div", \{\n\t\t\t\tclassName: ReasoningRow_module_css_default\.thinkBody,\n\t\t\t\tchildren: \(0, react_jsx_runtime\.jsx\)\(_deepseek_ai_dsh_client_ui_primitives\.MarkdownText, \{\n\t\t\t\t\ttext,\n\t\t\t\t\tstreaming: running,\n\t\t\t\t\tlabels,\n\t\t\t\t\tvariant: "compact"\n\t\t\t\t\}\)\n\t\t\t\}\)/,
      /children:renderSlot\(`conversation\.chat\.reasoning\.body`,\{rawText,text,running\}\)/,
    ],
    repl: [
      'expanded ? (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: ReasoningRow_module_css_default.thinkBody,\n\t\t\t\t/* [patchkit] 按 1.5 的做法当纯文本渲染：pre-wrap 保留每个换行，不做 markdown 解析 */\n\t\t\t\tchildren: text\n\t\t\t})',
      '/* [patchkit] 按 1.5 的做法当纯文本渲染：pre-wrap 保留每个换行，不做 markdown 解析 */children:text',
    ],
    skip: /(\[patchkit\]|\[本机补丁)[^\n]*当纯文本渲染/,
    // 只看结构：原来那段 MarkdownText 调用（或渲染槽）彻底消失，且 thinkBody 直接挂 children: text
    // 注释里可能夹着说明文字，所以两处之间的窗口给宽一点。
    verify: (t) => !t.includes('MarkdownText, {\n\t\t\t\t\ttext,\n\t\t\t\t\tstreaming: running,')
      && !t.includes('renderSlot(`conversation.chat.reasoning.body`')
      && /thinkBody,[\s\S]{0,600}?children:text\b/.test(t),
  },

  {
    id: 'reasoning-summary-color',
    group: 'ui-reasoning',
    title: '思考缩略行字色补回灰色',
    why: '1.5 的 .lcKema_summary 有 color:var(--dsw-alias-label-tertiary)，2.0 丢了、继承成主文字色。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: '.lcKema_summary{min-width:0;font-size:',
    repl: '.lcKema_summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:',
    skip: /\.lcKema_summary\{min-width:0;color:var\(--dsw-alias-label-tertiary\);font-size:/,
    verify: (t) => /\.\w+_summary\{min-width:0;color:var\(--dsw-alias-label-tertiary\);font-size:/.test(t),
  },
];
