// 补丁内核：纯函数，不认识文件系统
// 一条补丁长这样：
//   {
//     id:      'chat-show-context',      唯一标识，命令里用它开关
//     group:   'ui-inject',              分组（对应 patches/ 下的文件）
//     title:   '对话流显示上下文注入',      一句话人话
//     why:     '...',                     为什么要这么改（写给以后的我）
//     pkg:     'dsh-client-ui-chat',      改哪个包
//     file:    'lib/client.js',           包内路径
//     find / repl / test / skip,          跟 String.replace 同语义
//     verify:  (text) => boolean          打完后的断言
//   }

/**
 * 判断一条补丁是不是已经打在文本上了。
 * 优先用 skipWhen(函数)、其次 verify —— 这两个都只看「结果长什么样」，
 * 不看注释里留的标记，所以换过标记的旧补丁也能被正确认出来。
 * 都没有才退回 skip 正则。
 * @param {string} text
 * @param {object} patch
 * @returns {boolean}
 */
export function alreadyApplied(text, patch) {
  for (const fn of [patch.skipWhen, patch.verify]) {
    if (typeof fn === 'function') {
      try {
        if (fn(text) === true) return true;
      } catch {
        // 断言自己炸了就当没打过
      }
    }
  }
  if (patch.skip) return patch.skip.test(text);
  return false;
}

/**
 * 把一条补丁应用到文本上。
 * find / repl 可以是数组：同一个改动在不同版本里写法不一样时，按顺序试，
 * 谁先匹配上就用谁（数组里 repl 跟 find 一一对应）。
 * @param {string} text 原文本
 * @param {object} patch 补丁对象
 * @returns {{text: string, state: 'applied'|'already'|'nomatch'|'nochange'}}
 */
export function applyOne(text, patch) {
  if (alreadyApplied(text, patch)) return { text, state: 'already' };
  if (patch.test && !patch.test.test(text)) return { text, state: 'nomatch' };
  const finds = Array.isArray(patch.find) ? patch.find : [patch.find];
  const repls = Array.isArray(patch.repl) ? patch.repl : [patch.repl];
  for (let i = 0; i < finds.length; i += 1) {
    const next = text.replace(finds[i], repls[i] ?? repls[0]);
    if (next !== text) return { text: next, state: 'applied' };
  }
  return { text, state: 'nochange' };
}

/**
 * 补丁是否已生效。有 verify 用 verify，否则用 skip。
 * @param {string} text
 * @param {object} patch
 * @returns {boolean}
 */
export function checkOne(text, patch) {
  if (typeof patch.verify === 'function') {
    try {
      return patch.verify(text) === true;
    } catch {
      return false;
    }
  }
  if (patch.skip) return patch.skip.test(text);
  return false;
}

/**
 * 把一个包的所有补丁按顺序应用到文本。
 * 顺序有意义：后一条可能依赖前一条插入的代码。
 * @param {string} text
 * @param {object[]} patches 已按目标文件筛过、且排好序
 * @returns {{text: string, results: Array<{id: string, state: string}>}}
 */
export function applyAll(text, patches) {
  let cur = text;
  const results = [];
  for (const p of patches) {
    const r = applyOne(cur, p);
    cur = r.text;
    results.push({ id: p.id, state: r.state });
  }
  return { text: cur, results };
}

/**
 * 按组把补丁分桶。
 * @param {object[]} patches
 * @returns {Map<string, object[]>}
 */
export function groupBy(patches, key) {
  const m = new Map();
  for (const p of patches) {
    const k = typeof key === 'function' ? key(p) : p[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return m;
}

/**
 * 依赖顺序：同一条链上的补丁必须按声明顺序跑。
 * 这里只做稳定排序 —— 保持 patches 文件里的书写顺序（JavaScript 数组顺序即执行顺序）。
 * @param {object[]} patches
 * @returns {object[]}
 */
export function ordered(patches) {
  return patches.slice();
}

// ── 目标适配 ─────────────────────────────────────────────────────
// 打包好的 CSS Module 类名带构建 hash：开发树里是 lcKema_root，
// 官方 asar 里可能整个换掉（实测桌面端就没有 lcKema_ 这个前缀）。
// 所以补丁里写的是「占位前缀」，运行前按目标文件里实际探到的前缀替换掉。

const PREFIX_PROBES = {
  'lcKema_': /\b\w+_thinkBody\b/,
  'EvIC1a_': /\b\w+_flowItem\b/,
  'O_Ebla_': /\b\w+_expandBody\b/,
};

/**
 * 从一段 CSS/JS 文本里探出实际使用的类名前缀。
 * @param {string} text
 * @returns {Record<string,string>} 占位前缀 → 实际前缀
 */
export function detectPrefixes(text) {
  const actual = {};
  for (const [placeholder, probe] of Object.entries(PREFIX_PROBES)) {
    const m = text.match(probe);
    if (m) actual[placeholder] = m[0].slice(0, m[0].lastIndexOf('_') + 1);
  }
  return actual;
}

/**
 * 把一条补丁里的占位前缀换成目标文件的真实前缀。
 * verify 会做反向归一化（把文本里的真实前缀换回占位符再断言），
 * 这样同一条 verify 在两种目标上都成立。
 * @param {object} patch
 * @param {Record<string,string>} actual
 * @returns {object}
 */
export function adaptPatch(patch, actual) {
  const pairs = Object.entries(actual).filter(([ph, real]) => real && ph !== real);
  if (pairs.length === 0) return patch;

  const fix = (s) => {
    let out = s;
    for (const [ph, real] of pairs) out = out.split(ph).join(real);
    return out;
  };
  const fixRe = (re) => {
    let src = re.source;
    for (const [ph, real] of pairs) src = src.split(ph).join(real);
    return new RegExp(src, re.flags);
  };

  const out = { ...patch };
  const fixOne = (v) => {
    if (typeof v === 'string') return fix(v);
    if (v instanceof RegExp) return fixRe(v);
    return v;
  };
  out.find = Array.isArray(patch.find) ? patch.find.map(fixOne) : fixOne(patch.find);
  if (Array.isArray(patch.repl)) out.repl = patch.repl.map(fixOne);
  else if (typeof patch.repl === 'string') out.repl = fix(patch.repl);
  if (patch.test instanceof RegExp) out.test = fixRe(patch.test);
  if (patch.skip instanceof RegExp) out.skip = fixRe(patch.skip);
  if (typeof patch.verify === 'function') {
    out.verify = (t) => {
      let norm = t;
      for (const [ph, real] of pairs) norm = norm.split(real).join(ph);
      return patch.verify(norm);
    };
  }
  return out;
}
