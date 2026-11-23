# 给 DeepSeek Harness 桌面端装补丁 / 体检 / 回滚
#
#   装补丁.ps1                    自动找安装目录，装补丁
#   装补丁.ps1 -Root "D:\xxx"      指定安装目录
#   装补丁.ps1 -Check              只报状态，一个文件都不动
#   装补丁.ps1 -Rollback           退回官方原样（删解包目录，恢复 app.asar）
#
# 做法：Electron 找应用时 resources\app\ 目录优先于 resources\app.asar。
# 所以把归档解成目录、改目录、归档改名放着不动 —— 二进制归档全程不碰。

[CmdletBinding()]
param(
  [string]$Root = '',
  [switch]$Check,
  [switch]$Rollback,
  [string[]]$Only = @(),
  [string[]]$Skip = @()
)

$ErrorActionPreference = 'Stop'
try { $null = $Host.UI.RawUI.WindowTitle } catch { }

$kit = $PSScriptRoot                             # patchkit 根目录（本脚本就在根上）
$patchMjs = Join-Path $kit 'patch.mjs'

function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Die([string]$t) { Say ''; Say $t 'Red'; Say ''; exit 1 }

Say ''
Say '  DeepSeek Harness 0.2.x 补丁包' 'Cyan'
Say '  ------------------------------------------------------------' 'DarkGray'

# ── 1. 找安装目录 ─────────────────────────────────────────────
if (-not $Root) {
  $cand = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
    (Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'),
    'C:\Program Files\DeepSeek Harness',
    'D:\DeepSeek Harness'
  )
  foreach ($c in $cand) {
    if (Test-Path (Join-Path $c 'DeepSeek Harness.exe')) { $Root = $c; break }
  }
}
if (-not $Root) {
  Die @"
未找到 DeepSeek Harness 安装目录。
请以 -Root 指定：  install.ps1 -Root "D:\DeepSeek Harness"
"@
}
if (-not (Test-Path (Join-Path $Root 'DeepSeek Harness.exe'))) {
  Die "该目录下不存在 DeepSeek Harness.exe：$Root"
}
$Root = (Resolve-Path -LiteralPath $Root).Path

$res     = Join-Path $Root 'resources'
$asar    = Join-Path $res 'app.asar'
$asarOff = Join-Path $res 'app.asar.off'
$appDir  = Join-Path $res 'app'
$pkgDir  = Join-Path $appDir 'dsh\node_modules\@deepseek-ai'

Say ("  安装目录： " + $Root) 'White'

# ── 2. 回滚 ───────────────────────────────────────────────────
if ($Rollback) {
  Say ''
  Say '  正在恢复官方原版…' 'Yellow'
  if (Test-Path $appDir)  { Remove-Item -LiteralPath $appDir -Recurse -Force; Say '  已删除解包目录' 'Gray' }
  if (Test-Path $asarOff) {
    if (Test-Path $asar) { Die 'app.asar 与 app.asar.off 同时存在，请先确认保留哪一个。' }
    Rename-Item -LiteralPath $asarOff -NewName 'app.asar'
    Say '  已恢复 app.asar' 'Gray'
  }
  Say ''
  Say '  恢复完成，客户端已回到官方原版。' 'Green'
  Say ''
  exit 0
}

# ── 3. 这个安装目录不能正开着 ─────────────────────────────────
# 只看目标目录里的进程：两个版本并存时，开着旧版不该拦住新版。
$running = @(Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) })
if ($running.Count -gt 0 -and -not $Check) {
  Say ''
  Say '  客户端正在运行，请先关闭。' 'Red'
  Say ('  运行中的进程： ' + (($running | ForEach-Object { $_.ProcessId }) -join ', ')) 'DarkGray'
  Say ''
  exit 1
}

# ── 4. 需要的话，把归档解成目录 ───────────────────────────────
$unpacked = $false
if (-not (Test-Path $pkgDir)) {
  if (-not (Test-Path $asar)) {
    if (Test-Path $asarOff) {
      Die @"
归档已重命名为 app.asar.off，但解包目录不存在。
请先执行恢复（install.ps1 -Rollback），再重新安装。
"@
    }
    Die "该目录下既无 app.asar 也无 app 目录：$res"
  }
  if ($Check) {
    Say ''
    Say '  状态：未安装（归档仍为 app.asar，无解包目录）' 'Yellow'
    Say '  执行不带 -Check 的安装即可应用。' 'Gray'
    Say ''
    exit 0
  }
  Say ''
  Say '  首次安装，正在解包官方归档（数百 MB，约一分钟）…' 'Yellow'
  Push-Location $kit
  try {
    & npx --yes '@electron/asar' extract $asar $appDir
    if ($LASTEXITCODE -ne 0) { Die '解包失败，详见上方输出。' }
  } finally { Pop-Location }
  $unpacked = $true
  Say '  解包完成' 'Gray'
  if (Test-Path $asar) {
    Rename-Item -LiteralPath $asar -NewName 'app.asar.off'
    Say '  归档已重命名为 app.asar.off（未删除，可恢复）' 'Gray'
  }
}

if (-not (Test-Path $pkgDir)) { Die "解包目录中不存在目标包目录：$pkgDir" }

# ── 5. 打补丁 ─────────────────────────────────────────────────
Say ''
$nodeArgs = @($patchMjs, '--target', ('dir:' + $pkgDir))
if ($Check) { $nodeArgs += '--check' }
if ($Only.Count -gt 0) { $nodeArgs += @('--only', ($Only -join ',')) }
if ($Skip.Count -gt 0) { $nodeArgs += @('--skip', ($Skip -join ',')) }

Push-Location $kit
try { & node @nodeArgs } finally { Pop-Location }
$code = $LASTEXITCODE

Say ''
Say '  ------------------------------------------------------------' 'DarkGray'
if ($Check) {
  Say '  仅检查状态，未修改任何文件。' 'Gray'
} elseif ($code -eq 0) {
  Say '  安装完成，启动客户端即可生效。' 'Green'
  if ($unpacked) { Say '  （首次安装为解包模式，归档保留原处，可用 -Rollback 恢复）' 'DarkGray' }
} else {
  Say '  存在未应用的补丁，见上方叉号标记。' 'Yellow'
}
Say ''
exit $code
