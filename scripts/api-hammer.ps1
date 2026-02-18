# API Hammer Script
# Deterministic smoke + isolation testing for PsyMetric APIs (multi-project aware)
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\api-hammer.ps1 -Base "http://localhost:3000" -ProjectId "00000000-0000-4000-a000-000000000001"
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\api-hammer.ps1 -Base "https://your-deployment.vercel.app" -ProjectSlug "psymetric"
#
# Optional isolation check (requires a second project):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\api-hammer.ps1 -Base "http://localhost:3000" -ProjectId "...A..." -OtherProjectId "...B..."

param(
    [Parameter(Mandatory=$false)]
    [string]$Base = "http://localhost:3000",

    # Preferred: explicit project scoping
    [Parameter(Mandatory=$false)]
    [string]$ProjectId,

    [Parameter(Mandatory=$false)]
    [string]$ProjectSlug,

    # Optional: second project for cross-project negative tests
    [Parameter(Mandatory=$false)]
    [string]$OtherProjectId,

    [Parameter(Mandatory=$false)]
    [string]$OtherProjectSlug
)

$ErrorActionPreference = "Continue"

$PassCount = 0
$FailCount = 0
$SkipCount = 0

# Clean the base URL
$Base = $Base.TrimEnd('/')

function Get-ProjectHeaders {
    param(
        [string]$Pid,
        [string]$Pslug
    )

    $headers = @{}

    if ($Pid -and $Pid.Trim().Length -gt 0) {
        $headers["x-project-id"] = $Pid
        return $headers
    }

    if ($Pslug -and $Pslug.Trim().Length -gt 0) {
        $headers["x-project-slug"] = $Pslug
        return $headers
    }

    # No explicit project provided: resolver may fall back to DEFAULT_PROJECT_ID.
    return $headers
}

$Headers = Get-ProjectHeaders -Pid $ProjectId -Pslug $ProjectSlug
$OtherHeaders = Get-ProjectHeaders -Pid $OtherProjectId -Pslug $OtherProjectSlug

Write-Host ("API Hammer - Testing " + $Base) -ForegroundColor Cyan
if ($Headers.Count -gt 0) {
    Write-Host ("Project headers: " + ($Headers.GetEnumerator() | ForEach-Object { $_.Key + "=" + $_.Value } | Sort-Object | Join-String -Separator ", ")) -ForegroundColor Gray
} else {
    Write-Host "Project headers: (none) — resolver may fall back to DEFAULT_PROJECT_ID" -ForegroundColor DarkYellow
}
Write-Host ""

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Url,
        [int]$ExpectedStatus,
        [string]$Description,
        [hashtable]$RequestHeaders
    )

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
    }
    catch {
        Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
        return $false
    }
}

function Try-GetJson {
    param(
        [string]$Url,
        [hashtable]$RequestHeaders
    )

    try {
        return Invoke-RestMethod -Uri $Url -Method GET -Headers $RequestHeaders -TimeoutSec 30
    } catch {
        return $null
    }
}

# -----------------------------------------------------------------------------
# Smoke Tests - Basic GET operations should work (project-scoped)
# -----------------------------------------------------------------------------
Write-Host "=== SMOKE TESTS (GET, project-scoped) ===" -ForegroundColor Yellow

if (Test-Endpoint "GET" "$Base/api/events" 200 "GET /api/events" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/entities" 200 "GET /api/entities" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/relationships" 200 "GET /api/relationships" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/distribution-events" 200 "GET /api/distribution-events" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/metric-snapshots" 200 "GET /api/metric-snapshots" $Headers) { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== VALIDATION TESTS (400 expected, project-scoped) ===" -ForegroundColor Yellow

if (Test-Endpoint "GET" "$Base/api/entities?entityType=invalid" 400 "Bad entityType filter" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/entities?status=invalid" 400 "Bad status filter" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/relationships?fromEntityId=not-a-uuid" 400 "Bad fromEntityId UUID" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/relationships?toEntityId=invalid-uuid-format" 400 "Bad toEntityId UUID" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/distribution-events?platform=invalid" 400 "Bad platform filter" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/metric-snapshots?metricType=invalid" 400 "Bad metricType filter" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/metric-snapshots?entityId=not-a-uuid" 400 "Bad entityId UUID" $Headers) { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== PAGINATION TESTS (project-scoped) ===" -ForegroundColor Yellow

if (Test-Endpoint "GET" "$Base/api/entities?page=1&limit=5" 200 "Basic pagination" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/entities?page=999&limit=20" 200 "High page number" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/entities?limit=1" 200 "Minimum limit" $Headers) { $PassCount++ } else { $FailCount++ }
if (Test-Endpoint "GET" "$Base/api/entities?limit=50" 200 "Maximum limit" $Headers) { $PassCount++ } else { $FailCount++ }

# -----------------------------------------------------------------------------
# Isolation Tests - Optional (requires two distinct projects)
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "=== ISOLATION TESTS (optional) ===" -ForegroundColor Yellow

$hasOther = ($OtherHeaders.Count -gt 0)

if (-not $hasOther) {
    Write-Host "Skipping isolation tests: provide -OtherProjectId or -OtherProjectSlug" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    if (($ProjectId -and $OtherProjectId) -and ($ProjectId -eq $OtherProjectId)) {
        Write-Host "Skipping isolation tests: ProjectId and OtherProjectId are identical" -ForegroundColor DarkYellow
        $SkipCount++
    } else {
        # Fetch a single entity ID from Project A. If none exist, skip.
        $list = Try-GetJson -Url "$Base/api/entities?limit=1" -RequestHeaders $Headers
        $entityId = $null

        if ($null -ne $list) {
            # listResponse may wrap items in different shapes; try common patterns.
            if ($list.items -and $list.items.Count -gt 0) { $entityId = $list.items[0].id }
            elseif ($list.data -and $list.data.Count -gt 0) { $entityId = $list.data[0].id }
            elseif (($list -is [System.Array]) -and $list.Count -gt 0) { $entityId = $list[0].id }
        }

        if (-not $entityId) {
            Write-Host "Skipping cross-project entity fetch: no entities found in primary project" -ForegroundColor DarkYellow
            $SkipCount++
        } else {
            # Should be NOT FOUND when using other project headers
            if (Test-Endpoint "GET" "$Base/api/entities/$entityId" 404 "Cross-project entity fetch should 404" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
        }

        # Events endpoint should still work (just scoped differently) for other project
        if (Test-Endpoint "GET" "$Base/api/events?limit=1" 200 "GET /api/events (other project)" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
    }
}

# Summary
Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) {
    Write-Host ""
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
    Write-Host "System is stable, project-scoped, and validates inputs properly." -ForegroundColor Gray
    exit 0
} else {
    Write-Host ""
    Write-Host "SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "Check endpoint implementations, project scoping, and validation logic." -ForegroundColor Gray
    exit 1
}
