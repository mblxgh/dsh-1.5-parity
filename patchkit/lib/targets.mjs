// 目标解析：补丁往哪里打
//   dev             → 开发树（v2/node_modules/@deepseek-ai）
//   dir:<绝对路径>   → 任意已解包的 @deepseek-ai 目录
//   asar:<绝对路径>  → Electron asar：解包到临时目录，改完再打回去
//
// 返回统一形状：
//   { kind, root, label, pack?: async () => void }
// root = 里面直接能看到 dsh-client-ui-chat 这类包名的目录

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ASAR_INNER = path.join('dsh', 'node_modules', '@deepseek-ai');

/**
 * @param {string} spec 目标说明
 * @returns {{kind: 'dir'|'asar', root: string, label: string, pack?: () => Promise<void>}}
 */
export function resolveTarget(spec) {
  if (!spec || spec === 'dev') {
    // 开发树按本文件位置推导：patchkit/lib/../../v2/node_modules/@deepseek-ai
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'v2', 'node_modules', '@deepseek-ai');
    if (!fs.existsSync(root)) throw new Error('开发树不存在：' + root);
    return { kind: 'dir', root, label: 'dev ' + root };
  }

  if (spec.startsWith('dir:')) {
    const root = path.resolve(spec.slice(4));
    if (!fs.existsSync(root)) throw new Error('目录不存在：' + root);
    return { kind: 'dir', root, label: 'dir ' + root };
  }

  if (spec.startsWith('asar:')) {
    const asarPath = path.resolve(spec.slice(5));
    if (!fs.existsSync(asarPath)) throw new Error('asar 不存在：' + asarPath);
    const work = path.join(os.tmpdir(), 'patchkit-' + path.basename(asarPath, '.asar'));
    if (fs.existsSync(work)) fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });

    runAsar(['extract', asarPath, work]);
    const root = path.join(work, ASAR_INNER);
    if (!fs.existsSync(root)) throw new Error('解出来的包里没找到 ' + ASAR_INNER);

    return {
      kind: 'asar',
      root,
      label: 'asar ' + asarPath,
      // 打回去：先备份原归档，再就地覆盖。
      // 不加 --unpack：原归档的 unpacked 目录（原生模块）本来就在 asar 外面、
      // 不在解包结果里，重打包不会碰它；加了 --unpack 反而会把普通文件也复述一遍、
      // 体积从 116MB 涨到 348MB。
      async pack() {
        const backup = asarPath + '.bak-before-patch';
        if (!fs.existsSync(backup)) fs.copyFileSync(asarPath, backup);
        runAsar(['pack', work, asarPath]);
      },
    };
  }

  throw new Error('看不懂的目标：' + spec);
}

function runAsar(args) {
  // npx 拉起 @electron/asar（本机实测 v4.3.2）。Windows 上要用 npx.cmd + shell，
  // 而 shell 模式下参数是被拼成命令行的 —— 路径带空格（DeepSeek Harness）时必须自己加引号。
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const useShell = process.platform === 'win32';
  const quoted = useShell
    ? args.map((a) => (/[\s"*?]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a))
    : args;
  execFileSync(npx, ['--yes', '@electron/asar', ...quoted], {
    stdio: 'inherit',
    shell: useShell,
  });
}
