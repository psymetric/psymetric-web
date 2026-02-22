# API Hammer Script
# Deterministic smoke + isolation testing for PsyMetric APIs (multi-project aware)
#
# Coverage:
# - /api/projects
# - /api/entities
# - /api/entities/:id/graph
# - /api/draft-artifacts (Phase 2 S0 byda_s_audit: create + list + validation + isolation)
# - /api/draft-artifacts/:id/archive (Phase 2 lifecycle: archive semantics)
# - /api/draft-artifacts/expire (Phase 2 lifecycle: TTL enforcement)
# - /api/draft-artifacts/:id/promote (Phase 2 promotion: draft -> metric snapshots + archive)
# - /api/audits/run (Phase 2 S0: deterministic audit generator)

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

function Test-PostEmpty {
    param([string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $RequestHeaders -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
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

function Test-Patch {
    param([string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $response = Invoke-WebRequest -Uri $Url -Method PATCH -Headers $RequestHeaders -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
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

function Create-DraftArtifact {
    param([string]$EntityId,[hashtable]$RequestHeaders,[string]$DescriptionPrefix)

    $nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $body = @{
        kind = "byda_s_audit"
        entityId = $EntityId
        content = @{
            schemaVersion = "byda.s0.v1"
            entityId = $EntityId
            scores = @{
                citability = 50
                extractability = 50
                factualDensity = 50
            }
            notes = "api-hammer"
            createdAt = $nowIso
        }
    }

    try {
        Write-Host ("Testing: " + $DescriptionPrefix) -NoNewline
        $json = $body | ConvertTo-Json -Depth 10 -Compress
        $resp = Invoke-WebRequest -Uri "$Base/api/draft-artifacts" -Method POST -Headers $RequestHeaders -Body $json -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201) {
            Write-Host "  PASS" -ForegroundColor Green
            try {
                $parsed = $resp.Content | ConvertFrom-Json
                return @{ ok = $true; id = $parsed.data.id; body = $body }
            } catch {
                return @{ ok = $false; id = $null; body = $body }
            }
        } else {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 201)") -ForegroundColor Red
            return @{ ok = $false; id = $null; body = $body }
        }
    } catch {
        Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
        return @{ ok = $false; id = $null; body = $body }
    }
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
Write-Host "=== AUDITS TESTS (S0 RUN) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping audits/run tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $runBody = @{ entityId = $entityId }
    if (Test-PostJson "$Base/api/audits/run" 201 "POST /api/audits/run (valid)" $Headers $runBody) { $PassCount++ } else { $FailCount++ }

    $runUnknown = @{ entityId = $entityId; nope = "x" }
    if (Test-PostJson "$Base/api/audits/run" 400 "POST /api/audits/run rejects unknown field" $Headers $runUnknown) { $PassCount++ } else { $FailCount++ }

    $runBadUuid = @{ entityId = "not-a-uuid" }
    if (Test-PostJson "$Base/api/audits/run" 400 "POST /api/audits/run rejects invalid uuid" $Headers $runBadUuid) { $PassCount++ } else { $FailCount++ }

    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/audits/run" 404 "POST /api/audits/run cross-project non-disclosure" $OtherHeaders $runBody) { $PassCount++ } else { $FailCount++ }
    }

    if (Test-Endpoint "GET" "$Base/api/audits?limit=5" 200 "GET /api/audits (list)" $Headers) { $PassCount++ } else { $FailCount++ }

    $auditList = Try-GetJson -Url "$Base/api/audits?limit=1" -RequestHeaders $Headers
    $auditId = $null
    if ($auditList -and $auditList.data -and $auditList.data.Count -gt 0) { $auditId = $auditList.data[0].id }

    if ($auditId) {
        if (Test-Endpoint "GET" "$Base/api/audits/$auditId" 200 "GET /api/audits/:id (valid)" $Headers) { $PassCount++ } else { $FailCount++ }
        if ($OtherHeaders.Count -gt 0) {
            if (Test-Endpoint "GET" "$Base/api/audits/$auditId" 404 "GET /api/audits/:id cross-project non-disclosure" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
        }
    } else {
        Write-Host "Skipping audits/:id tests: no audit id available" -ForegroundColor DarkYellow
        $SkipCount++
    }

    if (Test-Endpoint "GET" "$Base/api/audits/not-a-uuid" 400 "GET /api/audits/:id invalid uuid" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/audits/00000000-0000-4000-a000-000000000009" 404 "GET /api/audits/:id not found" $Headers) { $PassCount++ } else { $FailCount++ }
}

Write-Host ""
Write-Host "=== DRAFT-ARTIFACTS TESTS (BYDA-S S0) ===" -ForegroundColor Yellow

$draftId = $null
$draftIdForPromote = $null

if (-not $entityId) {
    Write-Host "Skipping draft-artifacts tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $create1 = Create-DraftArtifact -EntityId $entityId -RequestHeaders $Headers -DescriptionPrefix "POST /api/draft-artifacts (valid, capture id for lifecycle)"
    if ($create1.ok) { $PassCount++; $draftId = $create1.id } else { $FailCount++ }

    if (Test-Endpoint "GET" "$Base/api/draft-artifacts?limit=5" 200 "GET /api/draft-artifacts (list)" $Headers) { $PassCount++ } else { $FailCount++ }

    $unknownBody = $create1.body.Clone()
    $unknownBody["nope"] = "x"
    if (Test-PostJson "$Base/api/draft-artifacts" 400 "POST draft-artifacts rejects unknown body field" $Headers $unknownBody) { $PassCount++ } else { $FailCount++ }

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
            createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
    }
    if (Test-PostJson "$Base/api/draft-artifacts" 400 "POST draft-artifacts rejects mismatched entityId" $Headers $mismatch) { $PassCount++ } else { $FailCount++ }

    $badScore = $create1.body.Clone()
    $badScore.content = $create1.body.content.Clone()
    $badScore.content.scores = $create1.body.content.scores.Clone()
    $badScore.content.scores.citability = 101
    if (Test-PostJson "$Base/api/draft-artifacts" 400 "POST draft-artifacts rejects score out of range" $Headers $badScore) { $PassCount++ } else { $FailCount++ }

    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/draft-artifacts" 404 "POST draft-artifacts cross-project non-disclosure" $OtherHeaders $create1.body) { $PassCount++ } else { $FailCount++ }
    }
}

Write-Host ""
Write-Host "=== DRAFT LIFECYCLE TESTS (ARCHIVE) ===" -ForegroundColor Yellow

if (-not $draftId) {
    Write-Host "Skipping archive tests: no draftId captured" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    if (Test-Patch "$Base/api/draft-artifacts/$draftId/archive" 200 "PATCH archive (draft -> archived)" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Patch "$Base/api/draft-artifacts/$draftId/archive" 400 "PATCH archive (already archived)" $Headers) { $PassCount++ } else { $FailCount++ }
    if ($OtherHeaders.Count -gt 0) {
        if (Test-Patch "$Base/api/draft-artifacts/$draftId/archive" 404 "PATCH archive cross-project non-disclosure" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
    }
    if (Test-Patch "$Base/api/draft-artifacts/not-a-uuid/archive" 400 "PATCH archive invalid uuid" $Headers) { $PassCount++ } else { $FailCount++ }
}

Write-Host ""
Write-Host "=== DRAFT LIFECYCLE TESTS (EXPIRE) ===" -ForegroundColor Yellow

if (Test-PostEmpty "$Base/api/draft-artifacts/expire" 200 "POST /api/draft-artifacts/expire (ttl enforcement)" $Headers) { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== DRAFT PROMOTION TESTS (PROMOTE) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping promote tests: no entityId" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    # Create a fresh draft for promotion to avoid interference from archive tests.
    $create2 = Create-DraftArtifact -EntityId $entityId -RequestHeaders $Headers -DescriptionPrefix "POST /api/draft-artifacts (valid, capture id for promote)"
    if ($create2.ok) { $PassCount++; $draftIdForPromote = $create2.id } else { $FailCount++ }

    if ($draftIdForPromote) {
        if (Test-PostEmpty "$Base/api/draft-artifacts/$draftIdForPromote/promote" 200 "POST promote (draft -> metric snapshots + archive)" $Headers) { $PassCount++ } else { $FailCount++ }
        if (Test-PostEmpty "$Base/api/draft-artifacts/$draftIdForPromote/promote" 400 "POST promote (already archived)" $Headers) { $PassCount++ } else { $FailCount++ }
        if ($OtherHeaders.Count -gt 0) {
            if (Test-PostEmpty "$Base/api/draft-artifacts/$draftIdForPromote/promote" 404 "POST promote cross-project non-disclosure" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
        }
    } else {
        Write-Host "Skipping promote tests: no draftIdForPromote captured" -ForegroundColor DarkYellow
        $SkipCount++
    }

    if (Test-PostEmpty "$Base/api/draft-artifacts/not-a-uuid/promote" 400 "POST promote invalid uuid" $Headers) { $PassCount++ } else { $FailCount++ }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) { exit 0 } else { exit 1 }
