// D 组：标签与内容的字色分层
//
// 1.5 的做法：
//   · `.row` 不设 color（继承正文色）
//   · `.title` 明确 secondary —— 标签比内容「重」一档
//   · 内容元素（.summary / .source）明确 tertiary —— 淡一档
//   · 于是「上下文注入 · time-context」一眼能分出哪个是标签、哪个是内容
//
// 2.0 的做法：
//   · `.row` 直接给了 tertiary
//   · `.title` 改成 inherit
//   · 结果标签和内容落在同一档，「思考 · …」「运行命令 · …」糊成一片，读的时候分不清断在哪
//
// 这条规则有两份载体，都得改：
//   · 源：dsh-client-ui-primitives/lib/DisclosureRow.module.css
//   · 产物：dsh-web-frontend/dist/assets/index-*.css（壳真正加载的是这份）
// 只改源不生效（实测：改完重启，浏览器里还是 color:inherit），所以产物那条是必须的。

const SRC_FIND = '.title {\n  flex: none;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  color: inherit;\n}';
const SRC_REPL = '.title {\n  flex: none;\n  font-size: var(--dsh-content-font-size-secondary, 13px);\n  line-height: calc(24px + var(--dsh-content-font-delta, 0px));\n  /* [patchkit] 标签比内容深一档，跟 1.5 一致 */\n  color: var(--dsw-alias-label-secondary);\n}';

// 产物里是压缩成一行的，类名带构建 hash（._title_jhda5_85），所以用 \w+ 兜住 hash。
const BUILD_FIND = /\._title_\w+\{flex:none;font-size:var\(--dsh-content-font-size-secondary, 13px\);line-height:calc\(24px \+ var\(--dsh-content-font-delta, 0px\)\);color:inherit\}/;

export default [
  {
    id: 'label-title-secondary-build',
    group: 'ui-label',
    title: '标签比内容深一档（前端产物 CSS）',
    why: '壳加载的是 dsh-web-frontend/dist/assets/index-*.css，DisclosureRow 的 .title 在那里是 color:inherit，' +
      '继承 .row 的 tertiary，于是标签和内容同色。1.5 的 .title 是 secondary。这条是真正生效的那条。',
    pkg: 'dsh-web-frontend',
    file: 'dist/assets/index-*.css',
    find: BUILD_FIND,
    repl: (m) => m.replace('color:inherit', 'color:var(--dsw-alias-label-secondary)'),
    skip: /\._title_\w+\{[^}]*color:var\(--dsw-alias-label-secondary\)[^}]*\}/,
    verify: (t) => /\._title_\w+\{[^}]*color:var\(--dsw-alias-label-secondary\)[^}]*\}/.test(t),
  },

  {
    id: 'label-title-secondary-source',
    group: 'ui-label',
    title: '标签比内容深一档（源 CSS，供重建）',
    why: '跟上面同一条改动，落在源文件上。当前运行时不读它（读的是构建产物），' +
      '但 dsh 一旦重新构建前端，产物会从这份源重新生成 —— 留着它，重建后不会打回原样。' +
      '0.2.2 把 primitives 并进了前端 bundle，这个包整个不在了，所以标成可选。',
    optional: true,
    pkg: 'dsh-client-ui-primitives',
    file: 'lib/DisclosureRow.module.css',
    find: SRC_FIND,
    repl: SRC_REPL,
    skip: /\.title \{[^}]*color: var\(--dsw-alias-label-secondary\)/,
    verify: (t) => /\.title \{[^}]*color: var\(--dsw-alias-label-secondary\)/.test(t),
  },
];
