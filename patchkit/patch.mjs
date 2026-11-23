#!/usr/bin/env node
// patchkit CLI —— 给 DeepSeek Harness 0.2.0 打整合补丁
//
//   node patch.mjs --list                       列出全部补丁
//   node patch.mjs --target dev --check         只看现状（哪些已打、哪些可打）
//   node patch.mjs --target dev                 打全部
//   node patch.mjs --target dev --only ui-inject        只打某一组
//   node patch.mjs --target dev --only chat-context-visible,chat-context-labels   只打指定 id
//   node patch.mjs --target dev --skip ui-layout        跳过某一组
//   node patch.mjs --target asar:"F:/.../app.asar"      打 Electron 归档（解包→改→打回）
//   node patch.mjs --target asar:"..." --dry            只解包看现状，不打回
//
// 一次运行里，同一个文件的所有补丁会按声明顺序连续应用、最后只写一次盘，
// 所以「后一条依赖前一条插入的代码」这种链条是安全的。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyAll, checkOne, groupBy, detectPrefixes, adaptPatch } from './lib/core.mjs';
import { resolveTarget } from './lib/targets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GROUPS = ['server', 'ui-inject', 'ui-reasoning', 'ui-label', 'ui-layout', 'ui-trajectory'];

// ── 参数 ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = { target: 'dev', only: [], skip: [], check: false, list: false, dry: false };
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--target') opt.target = argv[++i];
  else if (a === '--only') opt.only.push(...String(argv[++i]).split(',').filter(Boolean));
  else if (a === '--skip') opt.skip.push(...String(argv[++i]).split(',').filter(Boolean));
  else if (a === '--check') opt.check = true;
  else if (a === '--list') opt.list = true;
  else if (a === '--dry') opt.dry = true;
  else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
}

function usage() {
  console.log(`patchkit —— 0.2.0 整合补丁

  --list                  列出全部补丁（id / 组 / 标题）
  --target <spec>         目标，默认 dev
                            dev                        开发树 v2/node_modules/@deepseek-ai
                            dir:<路径>                  任意已解包的 @deepseek-ai 目录
                            asar:<路径>                 Electron 归档（解包→改→打回）
  --only <a,b>            只打这些（组名或补丁 id 都行）
  --skip <a,b>            跳过这些
  --check                 不写盘，只报每条的状态
  --dry                   asar 模式下改完不打回
`);
}

// ── 载入补丁 ──────────────────────────────────────────────────────
const all = [];
for (const g of GROUPS) {
  const mod = await import(pathToFileURL(path.join(HERE, 'patches', g + '.mjs')).href);
  for (const p of mod.default ?? []) all.push(p);
}

if (opt.list) {
  let cur = '';
  for (const p of all) {
    if (p.group !== cur) { cur = p.group; console.log(`\n[${cur}]`); }
    console.log(`  ${p.id.padEnd(34)} ${p.title}`);
  }
  console.log(`\n共 ${all.length} 条`);
  process.exit(0);
}

// ── 过滤 ──────────────────────────────────────────────────────────
function selected(p) {
  if (opt.skip.includes(p.group) || opt.skip.includes(p.id)) return false;
  if (opt.only.length === 0) return true;
  return opt.only.includes(p.group) || opt.only.includes(p.id);
}
const picked = all.filter(selected);
if (picked.length === 0) {
  console.error('没有选中任何补丁（检查 --only / --skip）');
  process.exit(1);
}

// ── 解析目标 ──────────────────────────────────────────────────────
const t = resolveTarget(opt.target);
console.log(`目标：${t.label}`);
console.log(`补丁：${picked.length} 条（共 ${all.length} 条）\n`);

// ── 按文件分组 ────────────────────────────────────────────────────
// 前端产物带构建 hash（index-BPHePDI_.css），每次构建都会变，
// 所以 file 里可以写 * 通配，运行时按目录展开。
function expandRel(root, rel) {
  const abs = path.join(root, rel);
  if (!rel.includes('*')) return fs.existsSync(abs) ? [abs] : [];
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) return [];
  const pat = path.basename(abs).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp('^' + pat + '$');
  return fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n));
}

const byFile = groupBy(picked, (p) => `${p.pkg}/${p.file}`);
let applied = 0, already = 0, failed = 0, skipped = 0;
const touched = [];
const seen = [];   // 自检阶段要复查的（实际路径, 补丁列表）

for (const [rel, list] of byFile) {
  const files = expandRel(t.root, rel);
  if (files.length === 0) {
    // 整组都是可选项时（比如那个包在新版里被合并掉了），文件不在不算失败。
    if (list.every((p) => p.optional)) {
      console.log(`· ${rel} —— 这一版没有这个文件（都是可选项）`);
      skipped += list.length;
    } else {
      console.log(`✗ ${rel} —— 文件不存在，跳过 ${list.length} 条`);
      failed += list.length;
    }
    continue;
  }
  for (const one of files) {
  const abs = one;
  seen.push([abs, list]);
  const before = fs.readFileSync(abs, 'utf8');
  // 按这个文件里实际的类名前缀，把补丁里的占位前缀换掉
  const prefixes = detectPrefixes(before);
  const list2 = list.map((p) => adaptPatch(p, prefixes));
  const { text, results } = applyAll(before, list2);
  const changed = text !== before;

  console.log(`${rel}${Object.keys(prefixes).length ? '  （前缀：' + Object.values(prefixes).join(' ') + '）' : ''}`);
  for (const r of results) {
    const p = list2.find((x) => x.id === r.id);
    const mark = r.state === 'applied' ? '✓' : r.state === 'already' ? '·' : '✗';
    let note = r.state === 'already' ? '已经打过'
      : r.state === 'nomatch' ? '原文没匹配上（版本不对？）'
      : r.state === 'nochange' ? '替换后没变化'
      : '已打';
    const miss = r.state === 'nomatch' || r.state === 'nochange';
    if (miss && p && p.optional) note = '跳过（这一版没这处写法）';
    console.log(`  ${mark} ${r.id.padEnd(32)} ${note}`);
    if (r.state === 'applied') applied += 1;
    else if (r.state === 'already') already += 1;
    else if (miss && p && p.optional) skipped += 1;
    else failed += 1;
  }

  if (opt.check) {
    console.log('  （--check：不写盘）');
    continue;
  }

  if (changed) {
    const bakDir = path.join(t.root, '..', '_patchkit-backup');
    fs.mkdirSync(bakDir, { recursive: true });
    const realRel = path.relative(t.root, abs);
    const bakPath = path.join(bakDir, realRel.replace(/[\\/]/g, '__'));
    // 只备份第一次见到的版本 —— 那份才是官方原样。
    // 每次覆盖的话，跑第二遍时备份到的就是「已经打过一轮补丁」的版本，回滚会回不到原样。
    if (!fs.existsSync(bakPath)) fs.writeFileSync(bakPath, before, 'utf8');
    fs.writeFileSync(abs, text, 'utf8');
    touched.push(realRel);
  }
  }
}

// ── 自检 ──────────────────────────────────────────────────────────
// --check 不写盘，磁盘上还是旧的，自检必然失败，所以这个模式不跑。
if (!opt.check) {
  console.log('\n自检：');
  for (const [abs, list] of seen) {
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const adapted = list.map((p) => adaptPatch(p, detectPrefixes(text)));
    for (const p of adapted) {
      if (typeof p.verify !== 'function') continue;
      const ok = checkOne(text, p);
      console.log(`  ${ok ? '✓' : '✗'} ${p.id}${ok ? '' : p.optional ? '（可选项，忽略）' : ''}`);
      if (!ok) {
        if (p.optional) skipped += 1;
        else failed += 1;
      }
    }
  }
}

console.log(`\n合计：已打 ${applied} / 已存在 ${already} / 跳过 ${skipped} / 失败 ${failed}`);
if (touched.length) console.log('写过的文件：\n  ' + touched.join('\n  '));
// 有失败就以非零退出，脚本层（装补丁.cmd）才拦得住。
if (failed > 0) process.exitCode = 1;

// ── asar 打回 ─────────────────────────────────────────────────────
if (t.kind === 'asar' && !opt.check && !opt.dry) {
  if (touched.length === 0) {
    console.log('\n没有任何改动，不打回归档。');
  } else {
    console.log('\n正在打回 asar（原归档会先备份成 .bak-before-patch）…');
    await t.pack();
    console.log('打回完成。');
  }
} else if (t.kind === 'asar' && opt.dry) {
  console.log('\n--dry：解包目录留着，没打回归档。');
}
