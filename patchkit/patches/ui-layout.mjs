// D 组：对话流的版式
// 1.5 的特征是「完成的轮次不折叠、步骤一条条平铺、行间留白一格」。
// 2.0 默认 detailed：一轮跑完整个过程收进「已完成，用时 X」的折叠块。
// 这里把默认档换成 verbose（一处关掉三处折叠），并把行距统一成 16px。
//
// 行距为什么用一条正则统一改：2.0 里 --dsh-chat-flow-gap 出现 6 处（一处回落值 + 5 处赋值），
// 开发树和官方 asar 的初始值还不一样（6 / 12 / 16 都见过）。与其写六条各自找原文，
// 不如一条正则把它们同时归到同一个值 —— 加一条新构建也只改这一处。

export default [
  {
    id: 'chat-default-verbose',
    group: 'ui-layout',
    title: '默认显示档 detailed → verbose',
    why: 'verbose 是 foldCompletedTurns:false + stepGrouping:"none"，等于「完成的轮次不折叠、步骤不分组」。' +
      '合并审查里那三处「藏内容」的开关全挂在 foldCompletedTurns 上，改这一处就一起关了。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    // 两版写法不一样：0.2.0 是 `const X = "detailed";`，0.2.2 压成了 `const X=`detailed``。
    // 用「不管什么引号」的写法，一套补丁两版都能打。
    find: /(DEFAULT_TRANSCRIPT_VIEW_MODE\s*=\s*)(["'`])detailed\2/,
    repl: '$1$2verbose$2 /* [patchkit] 默认最详细：不折叠、不分组，过程平铺 */',
    skip: /DEFAULT_TRANSCRIPT_VIEW_MODE\s*=\s*["'`]verbose["'`]/,
    verify: (t) => /DEFAULT_TRANSCRIPT_VIEW_MODE\s*=\s*["'`]verbose["'`]/.test(t),
  },

  {
    id: 'chat-flow-gap',
    group: 'ui-layout',
    title: '对话流行距统一 16px（正文与工具调用行之间一格）',
    why: '2.0 各处给的值不一样：回落 6px、回复后覆盖 12/16px、运行中 12px。' +
      '1.5 只有一个值（16px 回落），也就是「一格」。这里全部归到 16px，正文、工具调用、思考行之间都留一格。',
    pkg: 'dsh-client-ui-chat',
    file: 'lib/client.js',
    find: /(--dsh-chat-flow-gap[,:])\s*\d+px/g,
    repl: '$116px',
    skipWhen: (t) => {
      const all = [...t.matchAll(/--dsh-chat-flow-gap[,:]\s*(\d+)px/g)].map((m) => m[1]);
      return all.length > 0 && all.every((v) => v === '16');
    },
    verify: (t) => {
      const all = [...t.matchAll(/--dsh-chat-flow-gap[,:]\s*(\d+)px/g)].map((m) => m[1]);
      return all.length > 0 && all.every((v) => v === '16');
    },
  },
];
