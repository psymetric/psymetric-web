# API Hammer Script
# Deterministic smoke + isolation testing for PsyMetric APIs (multi-project aware)
#
# Updated: Added coverage for /api/projects and /api/entities/:id/graph

param(
    [Parameter(Mandatory=$false)]
    [string]$Base = "http://localhost:3000",

    [Parameter(Mandatory=$false)]
    [string]$ProjectId,

    [Parameter(Mandatory=$false)]
    [string]$ProjectSlug,

    [Parameter(Mandatory=$false)]
    [string]$OtherProjectId,

    [Parameter(Mandatory=$false)]
    [string]$OtherProjectSlug
)

$ErrorActionPreference = "Continue"
$PassCount = 0
$FailCount = 0
$SkipCount = 0
$Base = $Base.TrimEnd('/')

function Get-ProjectHeaders {
    param([string]$ProjectIdValue,[string]$ProjectSlugValue)
    $headers = @{}
    if ($ProjectIdValue) { $headers["x-project-id"] = $ProjectIdValue; return $headers }
    if ($ProjectSlugValue) { $headers["x-project-slug"] = $ProjectSlugValue; return $headers }
    return $headers
}

$Headers = Get-ProjectHeaders -ProjectIdValue $ProjectId -ProjectSlugValue $ProjectSlug
$OtherHeaders = Get-ProjectHeaders -ProjectIdValue $OtherProjectId -ProjectSlugValue $OtherProjectSlug

function Test-Endpoint {
    param([string]$Method,[string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $RequestHeaders -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host "  PASS" -ForegroundColor Green
            return $true
        } else {
            Write-Host ("  FAIL (got " + $response.StatusCode + ", expected " + $ExpectedStatus + ")") -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
        return $false
    }
}

function Try-GetJson {
    param([string]$Url,[hashtable]$RequestHeaders)
    try { return Invoke-RestMethod -Uri $Url -Method GET -Headers $RequestHeaders -TimeoutSec 30 } catch { return $null }
}

Write-Host "=== SMOKE TESTS (GET) ===" -ForegroundColor Yellow

if (Test-Endpoint "GET" "$Base/api/projects" 200 "GET /api/projects" @{}) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/entities" 200 "GET /api/entities" $Headers) { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== GRAPH TESTS ===" -ForegroundColor Yellow

$list = Try-GetJson -Url "$Base/api/entities?limit=1" -RequestHeaders $Headers
$entityId = $null
if ($list -and $list.data -and $list.data.Count -gt 0) { $entityId = $list.data[0].id }

if (-not $entityId) {
    Write-Host "Skipping graph tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    if (Test-Endpoint "GET" "$Base/api/entities/$entityId/graph" 200 "GET graph depth=1" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/entities/$entityId/graph?depth=2" 200 "GET graph depth=2" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/entities/$entityId/graph?depth=3" 400 "Invalid depth=3" $Headers) { $PassCount++ } else { $FailCount++ }
    if ($OtherHeaders.Count -gt 0) {
        if (Test-Endpoint "GET" "$Base/api/entities/$entityId/graph" 404 "Cross-project graph fetch" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
    }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) { exit 0 } else { exit 1 }
