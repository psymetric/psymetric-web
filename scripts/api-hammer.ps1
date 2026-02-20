# API Hammer Script
# Deterministic smoke + isolation testing for PsyMetric APIs (multi-project aware)
#
# Coverage:
# - /api/projects
# - /api/entities
# - /api/entities/:id/graph
# - /api/draft-artifacts (Phase 2 S0 byda_s_audit: create + list + validation + isolation)

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

function Test-PostJson {
    param([string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders,[object]$BodyObj)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $json = $BodyObj | ConvertTo-Json -Depth 10 -Compress
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $RequestHeaders -Body $json -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
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
Write-Host "=== DRAFT-ARTIFACTS TESTS (BYDA-S S0) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping draft-artifacts tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    # Valid create
    $nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $valid = @{
        kind = "byda_s_audit"
        entityId = $entityId
        content = @{
            schemaVersion = "byda.s0.v1"
            entityId = $entityId
            scores = @{
                citability = 50
                extractability = 50
                factualDensity = 50
            }
            notes = "api-hammer"
            createdAt = $nowIso
        }
    }

    if (Test-PostJson "$Base/api/draft-artifacts" 201 "POST /api/draft-artifacts (valid)" $Headers $valid) { $PassCount++ } else { $FailCount++ }

    # List (deterministic ordering is enforced in code; we just check 200)
    if (Test-Endpoint "GET" "$Base/api/draft-artifacts?limit=5" 200 "GET /api/draft-artifacts (list)" $Headers) { $PassCount++ } else { $FailCount++ }

    # Validation: unknown body field
    $unknownBody = $valid.Clone()
    $unknownBody["nope"] = "x"
    if (Test-PostJson "$Base/api/draft-artifacts" 400 "POST draft-artifacts rejects unknown body field" $Headers $unknownBody) { $PassCount++ } else { $FailCount++ }

    # Validation: mismatched entityId
    $mismatch = @{
        kind = "byda_s_audit"
        entityId = $entityId
        content = @{
            schemaVersion = "byda.s0.v1"
            entityId = "00000000-0000-4000-a000-000000000002"
            scores = @{
                citability = 50
                extractability = 50
                factualDensity = 50
            }
            createdAt = $nowIso
        }
    }
    if (Test-PostJson "$Base/api/draft-artifacts" 400 "POST draft-artifacts rejects mismatched entityId" $Headers $mismatch) { $PassCount++ } else { $FailCount++ }

    # Validation: score out of range
    $badScore = $valid.Clone()
    $badScore.content = $valid.content.Clone()
    $badScore.content.scores = $valid.content.scores.Clone()
    $badScore.content.scores.citability = 101
    if (Test-PostJson "$Base/api/draft-artifacts" 400 "POST draft-artifacts rejects score out of range" $Headers $badScore) { $PassCount++ } else { $FailCount++ }

    # Isolation: cross-project create should 404 (non-disclosure)
    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/draft-artifacts" 404 "POST draft-artifacts cross-project non-disclosure" $OtherHeaders $valid) { $PassCount++ } else { $FailCount++ }
    }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) { exit 0 } else { exit 1 }
