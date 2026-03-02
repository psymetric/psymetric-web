# API Hammer — Coordinator
# Usage: .\api-hammer.ps1 [-Base http://localhost:3000] [-ProjectId <id>] [-ProjectSlug <slug>]
#                          [-OtherProjectId <id>] [-OtherProjectSlug <slug>]

param(
    [string]$Base = "http://localhost:3000",
    [string]$ProjectId,
    [string]$ProjectSlug,
    [string]$OtherProjectId,
    [string]$OtherProjectSlug
)

# ── Parse-check guardrail (catches syntax errors before execution) ─────────────
$_parseTargets = @(
    $MyInvocation.MyCommand.Path
    "$PSScriptRoot\hammer\hammer-lib.ps1"
    "$PSScriptRoot\hammer\hammer-core.ps1"
    "$PSScriptRoot\hammer\hammer-seo.ps1"
    "$PSScriptRoot\hammer\hammer-sil2.ps1"
    "$PSScriptRoot\hammer\hammer-sil3.ps1"
    "$PSScriptRoot\hammer\hammer-sil4.ps1"
    "$PSScriptRoot\hammer\hammer-sil5.ps1"
    "$PSScriptRoot\hammer\hammer-sil6.ps1"
    "$PSScriptRoot\hammer\hammer-sil7.ps1"
    "$PSScriptRoot\hammer\hammer-sil8.ps1"
    "$PSScriptRoot\hammer\hammer-sil8-a1.ps1"
    "$PSScriptRoot\hammer\hammer-sil8-a2.ps1"
    "$PSScriptRoot\hammer\hammer-sil8-b2.ps1"
    "$PSScriptRoot\hammer\hammer-sil8-a3.ps1"
    "$PSScriptRoot\hammer\hammer-sil9.ps1"
)
foreach ($_pt in $_parseTargets) {
    $_tokens = $null
    $_parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($_pt, [ref]$_tokens, [ref]$_parseErrors) | Out-Null
    if ($_parseErrors -and $_parseErrors.Count -gt 0) {
        Write-Host ("PARSE ERROR in " + (Split-Path $_pt -Leaf) + ": " + $_parseErrors[0].Message) -ForegroundColor Red
        exit 1
    }
}

$ErrorActionPreference = "Continue"
$Base = $Base.TrimEnd('/')

# ── Shared counters (script: scope so dot-sourced modules write to these) ──────
$script:PassCount = 0
$script:FailCount = 0
$script:SkipCount = 0

# ── Load shared helpers + sentinel registry ────────────────────────────────────
. "$PSScriptRoot\hammer\hammer-lib.ps1"

# ── Seed shared state ──────────────────────────────────────────────────────────
$Headers      = Get-ProjectHeaders -ProjectIdValue $ProjectId      -ProjectSlugValue $ProjectSlug
$OtherHeaders = Get-ProjectHeaders -ProjectIdValue $OtherProjectId -ProjectSlugValue $OtherProjectSlug

$_seed = Try-GetJson -Url "$Base/api/entities?limit=1" -RequestHeaders $Headers
$entityId = $null
if ($_seed -and $_seed.data -and $_seed.data.Count -gt 0) { $entityId = $_seed.data[0].id }

# ── Run modules ────────────────────────────────────────────────────────────────
. "$PSScriptRoot\hammer\hammer-core.ps1"
. "$PSScriptRoot\hammer\hammer-seo.ps1"
. "$PSScriptRoot\hammer\hammer-sil2.ps1"
. "$PSScriptRoot\hammer\hammer-sil3.ps1"
. "$PSScriptRoot\hammer\hammer-sil4.ps1"
. "$PSScriptRoot\hammer\hammer-sil5.ps1"
. "$PSScriptRoot\hammer\hammer-sil6.ps1"
. "$PSScriptRoot\hammer\hammer-sil7.ps1"
. "$PSScriptRoot\hammer\hammer-sil8.ps1"
. "$PSScriptRoot\hammer\hammer-sil8-a1.ps1"
. "$PSScriptRoot\hammer\hammer-sil8-a2.ps1"
. "$PSScriptRoot\hammer\hammer-sil8-b2.ps1"
. "$PSScriptRoot\hammer\hammer-sil8-a3.ps1"
. "$PSScriptRoot\hammer\hammer-sil9.ps1"

# ── Summary ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $script:PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $script:FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $script:SkipCount) -ForegroundColor DarkYellow

if ($script:FailCount -eq 0) { exit 0 } else { exit 1 }
