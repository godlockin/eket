<#
.SYNOPSIS
    EKET Quick Setup for Windows - 分级安装 & 项目初始化

.DESCRIPTION
    安装级别:
    - Level 1 (默认): Skills + Commands → ~/.claude/
    - Level 2 (-Init): + 项目框架初始化
    - Level 3 (-Full): + CLI 二进制文件

.EXAMPLE
    # 最简安装
    irm https://raw.githubusercontent.com/godlockin/eket/main/scripts/quick-setup.ps1 | iex

    # 项目初始化
    .\quick-setup.ps1 -Init

    # 完整安装
    .\quick-setup.ps1 -Full

.NOTES
    需要 PowerShell 5.1+ 或 PowerShell Core 7+
    需要 Git 已安装
#>

[CmdletBinding()]
param(
    [switch]$Init,
    [switch]$Full,
    [switch]$Upgrade,
    [string]$SkillsDir = "$env:USERPROFILE\.claude\skills\eket",
    [string]$CommandsDir = "$env:USERPROFILE\.claude\commands",
    [string]$HooksDir = "$env:USERPROFILE\.claude\hooks",
    [string]$InstallDir = "$env:USERPROFILE\.local\bin"
)

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────
$RepoUrl = "https://github.com/godlockin/eket"
$RepoRaw = "https://raw.githubusercontent.com/godlockin/eket/main"
$TempDir = Join-Path $env:TEMP "eket-setup-$(Get-Random)"

# 安装级别
$Level = 1
if ($Init) { $Level = 2 }
if ($Full) { $Level = 3 }

# ─────────────────────────────────────────────
# 辅助函数
# ─────────────────────────────────────────────
function Write-Banner {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║                                                               ║" -ForegroundColor Cyan
    Write-Host "║   EKET Quick Setup (Windows)                                  ║" -ForegroundColor Cyan
    Write-Host "║   Human-AI Special Forces Team Coordination                   ║" -ForegroundColor Cyan
    Write-Host "║                                                               ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step { param($msg) Write-Host "→ $msg" -ForegroundColor Blue }
function Write-Ok { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }

# ─────────────────────────────────────────────
# 依赖检查
# ─────────────────────────────────────────────
function Test-Dependencies {
    Write-Step "检查依赖..."

    $missing = @()

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        $missing += "git"
    }

    if ($missing.Count -gt 0) {
        Write-Err "缺少依赖: $($missing -join ', ')"
        Write-Host ""
        Write-Host "安装方式:"
        Write-Host "  winget install Git.Git"
        Write-Host "  或从 https://git-scm.com/download/win 下载"
        exit 1
    }

    Write-Ok "依赖检查通过"
}

# ─────────────────────────────────────────────
# 下载仓库
# ─────────────────────────────────────────────
function Get-Repository {
    Write-Step "下载 EKET (shallow clone)..."

    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    $clonePath = Join-Path $TempDir "eket"

    try {
        # 尝试 sparse checkout
        git clone --depth 1 --filter=blob:none --sparse "$RepoUrl.git" $clonePath 2>$null
        Push-Location $clonePath
        git sparse-checkout set `
            .claude/skills/eket `
            template/.claude `
            template/hooks `
            template/CLAUDE.md `
            template/AGENTS.md `
            template/confluence `
            template/jira `
            scripts 2>$null
        git submodule update --init --recursive .claude/skills/eket 2>$null
        Pop-Location
        Write-Ok "下载完成"
    }
    catch {
        # 回退到完整 clone
        Write-Warn "Sparse checkout 失败，尝试完整下载..."
        git clone --depth 1 "$RepoUrl.git" $clonePath
        Write-Ok "下载完成"
    }

    return $clonePath
}

# ─────────────────────────────────────────────
# 安装 Skills
# ─────────────────────────────────────────────
function Install-Skills {
    param($RepoPath)

    Write-Step "安装 Skills → $SkillsDir"

    $srcSkills = Join-Path $RepoPath ".claude\skills\eket"

    if (Test-Path $srcSkills) {
        # 创建父目录
        $parentDir = Split-Path $SkillsDir -Parent
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null

        # 删除旧版本
        if (Test-Path $SkillsDir) {
            Remove-Item $SkillsDir -Recurse -Force
        }

        # 复制新版本
        Copy-Item $srcSkills $SkillsDir -Recurse

        $count = (Get-ChildItem $SkillsDir -Filter "*.md" -Recurse).Count
        Write-Ok "Skills ($count 个文件)"
    }
    else {
        Write-Warn "Skills 目录未找到"
    }
}

# ─────────────────────────────────────────────
# 安装 Commands
# ─────────────────────────────────────────────
function Install-Commands {
    param($RepoPath)

    Write-Step "安装 Commands → $CommandsDir"

    $srcCommands = Join-Path $RepoPath "template\.claude\commands"

    if (Test-Path $srcCommands) {
        New-Item -ItemType Directory -Path $CommandsDir -Force | Out-Null

        $count = 0
        Get-ChildItem $srcCommands -Filter "eket-*.sh" | ForEach-Object {
            Copy-Item $_.FullName $CommandsDir -Force
            $count++
        }

        # 复制通用库
        $commonLib = Join-Path $srcCommands "_eket_common.sh"
        if (Test-Path $commonLib) {
            Copy-Item $commonLib $CommandsDir -Force
        }

        Write-Ok "Commands ($count 个)"
        Write-Warn "注意: .sh 命令需要 Git Bash 或 WSL 执行"
    }
    else {
        Write-Warn "Commands 目录未找到"
    }
}

# ─────────────────────────────────────────────
# 安装 Hooks
# ─────────────────────────────────────────────
function Install-Hooks {
    param($RepoPath)

    Write-Step "安装 Hooks → $HooksDir"

    $srcHooks = Join-Path $RepoPath "template\hooks"

    if (Test-Path $srcHooks) {
        New-Item -ItemType Directory -Path $HooksDir -Force | Out-Null

        $count = 0
        Get-ChildItem $srcHooks -Filter "*.js" | ForEach-Object {
            Copy-Item $_.FullName $HooksDir -Force
            $count++
        }

        Write-Ok "Hooks ($count 个)"
    }
    else {
        Write-Warn "Hooks 目录未找到"
    }
}

# ─────────────────────────────────────────────
# 初始化项目
# ─────────────────────────────────────────────
function Initialize-Project {
    param($RepoPath)

    $projectDir = Get-Location
    Write-Step "初始化项目 → $projectDir"

    # 检查是否已初始化
    $identityFile = Join-Path $projectDir ".eket\IDENTITY.md"
    if (Test-Path $identityFile) {
        Write-Warn "项目已初始化，跳过"
        return
    }

    # 创建目录结构
    $dirs = @(
        ".claude\commands",
        ".eket\state",
        ".eket\sessions",
        ".eket\logs",
        "confluence\memory\lessons",
        "confluence\architecture",
        "jira\tickets",
        "jira\epics"
    )

    foreach ($dir in $dirs) {
        New-Item -ItemType Directory -Path (Join-Path $projectDir $dir) -Force | Out-Null
    }

    # 复制模板
    $tplDir = Join-Path $RepoPath "template"

    $filesToCopy = @(
        @{ Src = "CLAUDE.md"; Dst = "CLAUDE.md" },
        @{ Src = "AGENTS.md"; Dst = "AGENTS.md" },
        @{ Src = ".claude\settings.json"; Dst = ".claude\settings.json" }
    )

    foreach ($file in $filesToCopy) {
        $srcFile = Join-Path $tplDir $file.Src
        $dstFile = Join-Path $projectDir $file.Dst
        if (Test-Path $srcFile) {
            Copy-Item $srcFile $dstFile -Force
            Write-Ok $file.Dst
        }
    }

    # 复制 confluence 和 jira 模板
    $confluenceSrc = Join-Path $tplDir "confluence"
    $jiraSrc = Join-Path $tplDir "jira"

    if (Test-Path $confluenceSrc) {
        Copy-Item "$confluenceSrc\*" (Join-Path $projectDir "confluence") -Recurse -Force 2>$null
        Write-Ok "confluence/"
    }

    if (Test-Path $jiraSrc) {
        Copy-Item "$jiraSrc\*" (Join-Path $projectDir "jira") -Recurse -Force 2>$null
        Write-Ok "jira/"
    }

    # 创建 IDENTITY.md
    $identityContent = @"
# EKET Identity

**角色**: 未设置
**初始化时间**: $(Get-Date -Format "o")

运行 ``/eket-start`` 选择 Master 或 Slaver 角色。
"@
    Set-Content -Path $identityFile -Value $identityContent -Encoding UTF8
    Write-Ok ".eket\IDENTITY.md"

    # 更新 .gitignore
    $gitignore = Join-Path $projectDir ".gitignore"
    $eketIgnore = @"

# EKET
.eket/state/
.eket/logs/
.eket/sessions/
"@

    if (Test-Path $gitignore) {
        $content = Get-Content $gitignore -Raw
        if ($content -notmatch "\.eket/state") {
            Add-Content -Path $gitignore -Value $eketIgnore
            Write-Ok ".gitignore 已更新"
        }
    }
    else {
        Set-Content -Path $gitignore -Value $eketIgnore.Trim()
        Write-Ok ".gitignore 已创建"
    }

    Write-Ok "项目初始化完成"
}

# ─────────────────────────────────────────────
# 安装 CLI
# ─────────────────────────────────────────────
function Install-CLI {
    Write-Step "下载 EKET CLI → $InstallDir"

    # 检测架构
    $arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
    $artifact = "eket-windows-$arch.exe"
    $url = "$RepoUrl/releases/latest/download/$artifact"

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    $destPath = Join-Path $InstallDir "eket.exe"

    try {
        Invoke-WebRequest -Uri $url -OutFile $destPath -UseBasicParsing
        Write-Ok "CLI 已安装 ($destPath)"

        # 添加到 PATH（用户级别）
        $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($userPath -notlike "*$InstallDir*") {
            [Environment]::SetEnvironmentVariable("PATH", "$InstallDir;$userPath", "User")
            Write-Warn "已添加到 PATH，重启终端生效"
        }
    }
    catch {
        Write-Warn "CLI 下载失败 (可能尚无 Windows release)"
        Write-Host "  可手动编译: cd eket\rust && cargo build --release" -ForegroundColor Gray
    }
}

# ─────────────────────────────────────────────
# 验证安装
# ─────────────────────────────────────────────
function Test-Installation {
    Write-Host ""
    Write-Step "验证安装..."

    $success = $true

    # Skills
    if (Test-Path (Join-Path $SkillsDir "SKILL.md")) {
        Write-Ok "Skills: $SkillsDir"
    }
    else {
        Write-Warn "Skills 未完整"
        $success = $false
    }

    # Commands
    $cmdCount = (Get-ChildItem $CommandsDir -Filter "eket-*.sh" -ErrorAction SilentlyContinue).Count
    if ($cmdCount -gt 0) {
        Write-Ok "Commands: $cmdCount 个"
    }
    else {
        Write-Warn "Commands 未安装"
        $success = $false
    }

    # Hooks
    $hookCount = (Get-ChildItem $HooksDir -Filter "*.js" -ErrorAction SilentlyContinue).Count
    if ($hookCount -gt 0) {
        Write-Ok "Hooks: $hookCount 个"
    }

    # CLI (Level 3)
    if ($Level -ge 3) {
        $cliPath = Join-Path $InstallDir "eket.exe"
        if (Test-Path $cliPath) {
            Write-Ok "CLI: $cliPath"
        }
        else {
            Write-Warn "CLI 未安装"
        }
    }

    return $success
}

# ─────────────────────────────────────────────
# 打印成功信息
# ─────────────────────────────────────────────
function Write-Success {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✓ EKET 安装完成！ (Level $Level)" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""

    Write-Host "已安装组件:" -ForegroundColor White
    Write-Host "  Skills     → $SkillsDir"
    Write-Host "  Commands   → $CommandsDir"
    Write-Host "  Hooks      → $HooksDir"
    if ($Level -ge 3 -and (Test-Path (Join-Path $InstallDir "eket.exe"))) {
        Write-Host "  CLI        → $InstallDir\eket.exe"
    }
    if ($Init) {
        Write-Host "  项目框架   → $(Get-Location)"
    }
    Write-Host ""

    Write-Host "常用命令 (在 Claude Code 中):" -ForegroundColor White
    Write-Host "  /eket-start        启动 Master/Slaver" -ForegroundColor Green
    Write-Host "  /eket-claim        领取任务" -ForegroundColor Green
    Write-Host "  /eket-status       查看状态" -ForegroundColor Green
    Write-Host "  /eket-help         所有命令" -ForegroundColor Green
    Write-Host ""

    Write-Host "注意: Slash 命令 (.sh) 需要 Git Bash 或 WSL 执行" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "文档: $RepoUrl#readme" -ForegroundColor Cyan
    Write-Host ""
}

# ─────────────────────────────────────────────
# 清理
# ─────────────────────────────────────────────
function Remove-TempFiles {
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
try {
    Write-Banner

    $levelName = switch ($Level) {
        1 { "最简安装 (Skills + Commands + Hooks)" }
        2 { "项目初始化" }
        3 { "完整安装 (含 CLI)" }
    }
    Write-Host "安装级别: Level $Level - $levelName" -ForegroundColor Magenta
    Write-Host ""

    $startTime = Get-Date

    Test-Dependencies
    $repoPath = Get-Repository

    # Level 1: 基础组件
    Install-Skills -RepoPath $repoPath
    Install-Commands -RepoPath $repoPath
    Install-Hooks -RepoPath $repoPath

    # Level 2: 项目初始化
    if ($Init) {
        Write-Host ""
        Initialize-Project -RepoPath $repoPath
    }

    # Level 3: CLI
    if ($Full) {
        Write-Host ""
        Install-CLI
    }

    if (Test-Installation) {
        $elapsed = (Get-Date) - $startTime
        Write-Host ""
        Write-Host "耗时: $([math]::Round($elapsed.TotalSeconds)) 秒" -ForegroundColor Green
        Write-Success
    }
    else {
        Write-Host ""
        Write-Warn "安装未完全成功，请检查上述警告"
        Write-Host ""
        Write-Host "帮助: $RepoUrl/issues"
    }
}
finally {
    Remove-TempFiles
}
