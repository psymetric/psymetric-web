# API Hammer Script
# Deterministic smoke + isolation testing for PsyMetric APIs (multi-project aware)
#
# Coverage:
# - /api/projects
# - /api/entities (list + create + malformed JSON guard)
# - /api/entities/:id/graph
# - /api/entities/:id/verify-freshness (W2 content freshness)
# - /api/relationships (create → 201 + cross-project isolation)
# - /api/source-items/capture (create + malformed JSON guard)
# - /api/source-items/:id/status (triage + malformed JSON guard)
# - /api/source-items/:id/draft-replies (POST create + GET list + validation + isolation)
# - /api/draft-artifacts (Phase 2 S0 byda_s_audit: create + list + validation + isolation)
# - /api/draft-artifacts/:id/archive (Phase 2 lifecycle: archive semantics)
# - /api/draft-artifacts/expire (Phase 2 lifecycle: TTL enforcement)
# - /api/draft-artifacts/:id/promote (Phase 2 promotion: draft -> metric snapshots + archive)
# - /api/audits/run (Phase 2 S0: deterministic audit generator)
# - /api/audits (Phase 2 S1: list + filters)
# - /api/audits/:id (Phase 2 S1: single with includeExplain/includePromotion)
# - /api/seo/search-performance/ingest (Phase 0-SEO: bulk GSC ingestion)
# - /api/seo/search-performance (Phase 0-SEO: list with filters)
# - /api/quotable-blocks (Phase 0-SEO: create + list GEO citation assets)
# - /api/seo/keyword-research (W4: validation + confirm gate)
# - /api/seo/serp-snapshot (W5: validation + confirm gate)
# - /api/seo/content-brief (W6: deterministic brief generation)
# - /api/seo/ai-keyword-volume (W7: validation + confirm gate)
# - Deterministic ordering verification (entities list)
# - Response envelope validation (data + pagination fields)
# - Malformed JSON guard tests (M2 audit finding)

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

function Build-QueryString {
    param([hashtable]$Params)
    if (-not $Params -or $Params.Count -eq 0) { return "" }

    $parts = @()
    foreach ($k in ($Params.Keys | Sort-Object)) {
        if ($null -eq $k) { continue }
        $key = ($k.ToString()).Trim()
        if ([string]::IsNullOrWhiteSpace($key)) { continue }

        $raw = $Params[$k]
        if ($null -eq $raw) { continue }
        $val = ($raw.ToString()).Trim()
        if ([string]::IsNullOrWhiteSpace($val)) { continue }

        $encK = [System.Uri]::EscapeDataString($key)
        $encV = [System.Uri]::EscapeDataString($val)
        $parts += "$encK=$encV"
    }

    return ($parts -join "&")
}

function Build-Url {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$false)]
        [hashtable]$Params
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "Build-Url requires non-empty Path"
    }

    if (-not $Path.StartsWith('/')) {
        $Path = '/' + $Path
    }

    $qs = Build-QueryString -Params $Params

    if ([string]::IsNullOrWhiteSpace($qs)) {
        return "$Base$Path"
    }

    return "$Base$Path`?$qs"
}

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

function Test-PostJsonCapture {
    param([string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders,[object]$BodyObj)

    $result = @{ ok = $false; data = $null }

    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $json = $BodyObj | ConvertTo-Json -Depth 10 -Compress
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $RequestHeaders -Body $json -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host "  PASS" -ForegroundColor Green
            try {
                $parsed = $response.Content | ConvertFrom-Json
                $result.ok = $true
                $result.data = $parsed.data
            } catch {
                # If parsing fails, still treat request as ok; caller can fall back.
                $result.ok = $true
            }
            return $result
        } else {
            Write-Host ("  FAIL (got " + $response.StatusCode + ", expected " + $ExpectedStatus + ")") -ForegroundColor Red
            return $result
        }
    } catch {
        Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
        return $result
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

function Test-PutJson {
    param([string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders,[object]$BodyObj)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $json = $BodyObj | ConvertTo-Json -Depth 10 -Compress
        $response = Invoke-WebRequest -Uri $Url -Method PUT -Headers $RequestHeaders -Body $json -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
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

function Test-RawBody {
    param([string]$Method,[string]$Url,[int]$ExpectedStatus,[string]$Description,[hashtable]$RequestHeaders,[string]$RawBody)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $RequestHeaders -Body $RawBody -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
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

function Test-ResponseEnvelope {
    param([string]$Url,[hashtable]$RequestHeaders,[string]$Description,[bool]$ExpectPagination=$false)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $response = Invoke-WebRequest -Uri $Url -Method GET -Headers $RequestHeaders -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($response.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $response.StatusCode + ", expected 200)") -ForegroundColor Red
            return $false
        }
        $parsed = $response.Content | ConvertFrom-Json
        if (-not $parsed.data) {
            Write-Host "  FAIL (missing data field)" -ForegroundColor Red
            return $false
        }
        if ($ExpectPagination -and -not $parsed.pagination) {
            Write-Host "  FAIL (missing pagination field)" -ForegroundColor Red
            return $false
        }
        Write-Host "  PASS" -ForegroundColor Green
        return $true
    } catch {
        Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
        return $false
    }
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

    $runResult = Test-PostJsonCapture "$Base/api/audits/run" 201 "POST /api/audits/run (valid)" $Headers $runBody
    if ($runResult.ok) { $PassCount++ } else { $FailCount++ }

    $runUnknown = @{ entityId = $entityId; nope = "x" }
    if (Test-PostJson "$Base/api/audits/run" 400 "POST /api/audits/run rejects unknown field" $Headers $runUnknown) { $PassCount++ } else { $FailCount++ }

    $runBadUuid = @{ entityId = "not-a-uuid" }
    if (Test-PostJson "$Base/api/audits/run" 400 "POST /api/audits/run rejects invalid uuid" $Headers $runBadUuid) { $PassCount++ } else { $FailCount++ }

    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/audits/run" 404 "POST /api/audits/run cross-project non-disclosure" $OtherHeaders $runBody) { $PassCount++ } else { $FailCount++ }
    }

    if (Test-Endpoint "GET" "$Base/api/audits?limit=5" 200 "GET /api/audits (list)" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/audits?status=archived" 200 "GET /api/audits status=archived" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/audits?includeExpired=true" 200 "GET /api/audits includeExpired=true" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/audits?status=invalid" 400 "GET /api/audits invalid status" $Headers) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/audits?includeExpired=maybe" 400 "GET /api/audits invalid includeExpired" $Headers) { $PassCount++ } else { $FailCount++ }

    # Prefer the id from the just-created audit to avoid relying on existing project state.
    $auditId = $null
    if ($runResult -and $runResult.data -and $runResult.data.id) {
        $auditId = ($runResult.data.id).ToString().Trim()
    } else {
        $auditList = Try-GetJson -Url "$Base/api/audits?limit=1" -RequestHeaders $Headers
        if ($auditList -and $auditList.data -and $auditList.data.Count -gt 0) {
            $auditId = ($auditList.data[0].id).ToString().Trim()
        }
    }

    if ([string]::IsNullOrWhiteSpace($auditId) -or $auditId -notmatch '^[0-9a-fA-F-]{36}$') {
        $auditId = $null
    }

    if ($auditId) {
        if (Test-Endpoint "GET" "$Base/api/audits/$auditId" 200 "GET /api/audits/:id (valid)" $Headers) { $PassCount++ } else { $FailCount++ }

        $auditExplainUrl = Build-Url -Path "/api/audits/$auditId" -Params @{
            status = "draft"
            includeExplain = "true"
        }
        if (Test-Endpoint "GET" $auditExplainUrl 200 "GET /api/audits/:id includeExplain=true" $Headers) { $PassCount++ } else { $FailCount++ }

        if (Test-Endpoint "GET" "$Base/api/audits/$auditId?includeExplain=maybe" 400 "GET /api/audits/:id includeExplain invalid" $Headers) { $PassCount++ } else { $FailCount++ }
        if (Test-Endpoint "GET" "$Base/api/audits/$auditId?includePromotion=maybe" 400 "GET /api/audits/:id includePromotion invalid" $Headers) { $PassCount++ } else { $FailCount++ }

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

if (-not $entityId) {
    Write-Host "Skipping draft-artifacts tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $create1 = Create-DraftArtifact -EntityId $entityId -RequestHeaders $Headers -DescriptionPrefix "POST /api/draft-artifacts (valid, capture id for lifecycle)"
    if ($create1.ok) { $PassCount++; $draftId = ($create1.id).ToString().Trim() } else { $FailCount++ }

    if ([string]::IsNullOrWhiteSpace($draftId) -or $draftId -notmatch '^[0-9a-fA-F-]{36}$') {
        $draftId = $null
    }

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
Write-Host "=== SEO TESTS (SEARCH PERFORMANCE) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping SEO search-performance tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $runId = (Get-Date).Ticks
    $searchPerfBody = @{
        rows = @(
            @{
                query = "api-hammer-sp-$runId"
                pageUrl = "https://example.com/test-$runId"
                impressions = 100
                clicks = 10
                ctr = 0.1
                avgPosition = 3.5
                dateStart = "2026-02-01"
                dateEnd = "2026-02-07"
                entityId = $entityId
            }
        )
    }
    if (Test-PostJson "$Base/api/seo/search-performance/ingest" 200 "POST search-performance ingest (valid)" $Headers $searchPerfBody) { $PassCount++ } else { $FailCount++ }

    $badClicks = @{
        rows = @(
            @{
                query = "test"
                pageUrl = "https://example.com/test"
                impressions = 10
                clicks = 20
                ctr = 2.0
                avgPosition = 1.0
                dateStart = "2026-02-01"
                dateEnd = "2026-02-07"
            }
        )
    }
    if (Test-PostJson "$Base/api/seo/search-performance/ingest" 400 "POST search-performance rejects clicks>impressions" $Headers $badClicks) { $PassCount++ } else { $FailCount++ }

    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/seo/search-performance/ingest" 404 "POST search-performance cross-project entity" $OtherHeaders $searchPerfBody) { $PassCount++ } else { $FailCount++ }
    }

    if (Test-ResponseEnvelope "$Base/api/seo/search-performance?limit=5" $Headers "GET search-performance (list envelope)" $true) { $PassCount++ } else { $FailCount++ }
    if (Test-Endpoint "GET" "$Base/api/seo/search-performance?entityId=$entityId" 200 "GET search-performance entityId filter" $Headers) { $PassCount++ } else { $FailCount++ }
}

Write-Host ""
Write-Host "=== SEO TESTS (QUOTABLE BLOCKS) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping SEO quotable-blocks tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $runId = (Get-Date).Ticks
    $qbBody = @{
        entityId = $entityId
        text = "api-hammer quotable block $runId with sufficient length for validation"
        claimType = "statistic"
        sourceCitation = "api-hammer-$runId"
        topicTag = "test"
    }
    if (Test-PostJson "$Base/api/quotable-blocks" 201 "POST quotable-blocks (valid)" $Headers $qbBody) { $PassCount++ } else { $FailCount++ }

    $badClaimType = $qbBody.Clone()
    $badClaimType.claimType = "invalid"
    if (Test-PostJson "$Base/api/quotable-blocks" 400 "POST quotable-blocks invalid claimType" $Headers $badClaimType) { $PassCount++ } else { $FailCount++ }

    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/quotable-blocks" 404 "POST quotable-blocks cross-project entity" $OtherHeaders $qbBody) { $PassCount++ } else { $FailCount++ }
    }

    if (Test-ResponseEnvelope "$Base/api/quotable-blocks?limit=5" $Headers "GET quotable-blocks (list envelope)" $true) { $PassCount++ } else { $FailCount++ }
}

Write-Host ""
Write-Host "=== DETERMINISTIC ORDERING TEST ===" -ForegroundColor Yellow

$list1 = Try-GetJson -Url "$Base/api/entities?limit=10" -RequestHeaders $Headers
$list2 = Try-GetJson -Url "$Base/api/entities?limit=10" -RequestHeaders $Headers

if ($list1 -and $list2 -and $list1.data -and $list2.data) {
    $ids1 = $list1.data | ForEach-Object { $_.id }
    $ids2 = $list2.data | ForEach-Object { $_.id }

    $orderMatch = $true
    if ($ids1.Count -ne $ids2.Count) {
        $orderMatch = $false
    } else {
        for ($i = 0; $i -lt $ids1.Count; $i++) {
            if ($ids1[$i] -ne $ids2[$i]) {
                $orderMatch = $false
                break
            }
        }
    }

    if ($orderMatch) {
        Write-Host "Testing: Entities list ordering deterministic  PASS" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host "Testing: Entities list ordering deterministic  FAIL" -ForegroundColor Red
        $FailCount++
    }
} else {
    Write-Host "Skipping ordering test: unable to fetch entity lists" -ForegroundColor DarkYellow
    $SkipCount++
}

Write-Host ""
Write-Host "=== DRAFT PROMOTION TESTS (PROMOTE) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping promote tests: no entityId" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $draftIdForPromote = $null

    # Create an audit draft via /api/audits/run (not a generic draft) for promotion.
    $runPromoteBody = @{ entityId = $entityId }
    $runPromoteResult = Test-PostJsonCapture "$Base/api/audits/run" 201 "POST /api/audits/run (create audit for promote)" $Headers $runPromoteBody
    if ($runPromoteResult.ok -and $runPromoteResult.data -and $runPromoteResult.data.id) {
        $PassCount++
        $draftIdForPromote = ($runPromoteResult.data.id).ToString().Trim()
    } else {
        $FailCount++
    }

    if ([string]::IsNullOrWhiteSpace($draftIdForPromote) -or $draftIdForPromote -notmatch '^[0-9a-fA-F-]{36}$') {
        $draftIdForPromote = $null
    }

    if ($draftIdForPromote) {
        if (Test-PostEmpty "$Base/api/draft-artifacts/$draftIdForPromote/promote" 200 "POST promote (draft -> metric snapshots + archive)" $Headers) { $PassCount++ } else { $FailCount++ }

        # NOTE: GET /api/audits/:id currently hardcoded to status=draft (cannot read archived audits by ID)
        # This is inconsistent with GET /api/audits (list) which supports status=archived.
        # Skipping archived audit read tests until endpoint supports status query parameter.
        # See: src/app/api/audits/[id]/route.ts line 45 (status: DraftArtifactStatus.draft)
        Write-Host "Testing: GET /api/audits/:id includePromotion=true (promoted)  SKIP (endpoint limitation)" -ForegroundColor DarkYellow
        $SkipCount++
        Write-Host "Testing: GET /api/audits/:id includeExplain=true (promoted)  SKIP (endpoint limitation)" -ForegroundColor DarkYellow
        $SkipCount++

        # Verify idempotency: second promote should fail cleanly
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
Write-Host "=== MALFORMED JSON GUARD TESTS (M2) ===" -ForegroundColor Yellow

# POST /api/entities — malformed JSON should return 400
if (Test-RawBody "POST" "$Base/api/entities" 400 "POST /api/entities malformed JSON -> 400" $Headers "not-json{{") { $PassCount++ } else { $FailCount++ }

# POST /api/source-items/capture — malformed JSON should return 400
if (Test-RawBody "POST" "$Base/api/source-items/capture" 400 "POST /api/source-items/capture malformed JSON -> 400" $Headers "{{bad") { $PassCount++ } else { $FailCount++ }

# PUT /api/source-items/:id/status — malformed JSON should return 400 (use fake UUID, JSON parse happens before UUID lookup)
if (Test-RawBody "PUT" "$Base/api/source-items/00000000-0000-4000-a000-000000000001/status" 400 "PUT /api/source-items/:id/status malformed JSON -> 400" $Headers "not{json") { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== RELATIONSHIP TESTS (L1 FIX: 201) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping relationship tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    # Always create a fresh second entity so the relationship is guaranteed new each run
    $runId = (Get-Date).Ticks
    $ent2Body = @{
        entityType = "concept"
        title = "api-hammer-rel-target-$runId"
    }
    $ent2Result = Test-PostJsonCapture "$Base/api/entities" 201 "POST /api/entities (create second entity for rel test)" $Headers $ent2Body
    $entity2Id = $null
    if ($ent2Result.ok -and $ent2Result.data -and $ent2Result.data.id) {
        $PassCount++
        $entity2Id = ($ent2Result.data.id).ToString().Trim()
    } else {
        $FailCount++
    }

    if ($entity2Id) {
        $runId = (Get-Date).Ticks
        $relBody = @{
            fromEntityId = $entityId
            toEntityId = $entity2Id
            relationType = "CONCEPT_RELATES_TO_CONCEPT"
        }
        $relResult = Test-PostJsonCapture "$Base/api/relationships" 201 "POST /api/relationships returns 201 (L1 fix)" $Headers $relBody
        if ($relResult.ok) { $PassCount++ } else { $FailCount++ }

        # Duplicate should return 409
        if (Test-PostJson "$Base/api/relationships" 409 "POST /api/relationships duplicate -> 409" $Headers $relBody) { $PassCount++ } else { $FailCount++ }

        # Invalid relationType
        $badRelBody = @{
            fromEntityId = $entityId
            toEntityId = $entity2Id
            relationType = "INVALID_TYPE"
        }
        if (Test-PostJson "$Base/api/relationships" 400 "POST /api/relationships invalid relationType" $Headers $badRelBody) { $PassCount++ } else { $FailCount++ }

        # Cross-project
        if ($OtherHeaders.Count -gt 0) {
            if (Test-PostJson "$Base/api/relationships" 404 "POST /api/relationships cross-project" $OtherHeaders $relBody) { $PassCount++ } else { $FailCount++ }
        }
    } else {
        Write-Host "Skipping relationship tests: could not get second entity" -ForegroundColor DarkYellow
        $SkipCount++
    }
}

Write-Host ""
Write-Host "=== SOURCE ITEMS TESTS ===" -ForegroundColor Yellow

$runId = (Get-Date).Ticks
$captureBody = @{
    sourceType = "webpage"
    url = "https://example.com/api-hammer-$runId"
    operatorIntent = "api-hammer test capture"
    platform = "website"
}
$captureResult = Test-PostJsonCapture "$Base/api/source-items/capture" 201 "POST /api/source-items/capture (valid)" $Headers $captureBody
if ($captureResult.ok) { $PassCount++ } else { $FailCount++ }

# Recapture same URL -> 200
if (Test-PostJson "$Base/api/source-items/capture" 200 "POST /api/source-items/capture (recapture -> 200)" $Headers $captureBody) { $PassCount++ } else { $FailCount++ }

# Missing required field
$badCapture = @{ sourceType = "webpage"; url = "https://example.com/test" }
if (Test-PostJson "$Base/api/source-items/capture" 400 "POST /api/source-items/capture missing operatorIntent" $Headers $badCapture) { $PassCount++ } else { $FailCount++ }

# Triage (status update) — only if we captured something
$capturedItemId = $null
if ($captureResult.ok -and $captureResult.data -and $captureResult.data.id) {
    $capturedItemId = ($captureResult.data.id).ToString().Trim()
}

if ($capturedItemId) {
    $triageBody = @{ status = "triaged"; notes = "api-hammer triage" }
    if (Test-PutJson "$Base/api/source-items/$capturedItemId/status" 200 "PUT /api/source-items/:id/status (valid triage)" $Headers $triageBody) { $PassCount++ } else { $FailCount++ }

    # Invalid status
    $badTriage = @{ status = "invalid_status" }
    if (Test-PutJson "$Base/api/source-items/$capturedItemId/status" 400 "PUT /api/source-items/:id/status invalid status" $Headers $badTriage) { $PassCount++ } else { $FailCount++ }

    # Cross-project
    if ($OtherHeaders.Count -gt 0) {
        if (Test-PutJson "$Base/api/source-items/$capturedItemId/status" 404 "PUT /api/source-items/:id/status cross-project" $OtherHeaders $triageBody) { $PassCount++ } else { $FailCount++ }
    }
} else {
    Write-Host "Skipping source-items status tests: no captured item" -ForegroundColor DarkYellow
    $SkipCount++
}

Write-Host ""
Write-Host "=== DRAFT-REPLIES TESTS (X Reply Stubs) ===" -ForegroundColor Yellow

# Create an X-platform source item for draft-replies testing
$runId = (Get-Date).Ticks
$xCaptureBody = @{
    sourceType = "comment"
    url = "https://x.com/testuser/status/$runId"
    operatorIntent = "api-hammer draft-replies test"
    platform = "x"
}
$xCaptureResult = Test-PostJsonCapture "$Base/api/source-items/capture" 201 "POST capture X source item (for draft-replies)" $Headers $xCaptureBody
if ($xCaptureResult.ok) { $PassCount++ } else { $FailCount++ }

$xSourceId = $null
if ($xCaptureResult.ok -and $xCaptureResult.data -and $xCaptureResult.data.id) {
    $xSourceId = ($xCaptureResult.data.id).ToString().Trim()
}

if (-not $xSourceId) {
    Write-Host "Skipping draft-replies tests: no X source item captured" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    # POST draft-replies → 201 (defaults: count=1, style=short)
    $drUrl = "$Base/api/source-items/$xSourceId/draft-replies"
    $drResult = Test-PostJsonCapture "$drUrl" 201 "POST draft-replies (default count=1 style=short)" $Headers @{}
    if ($drResult.ok) { $PassCount++ } else { $FailCount++ }

    # POST draft-replies with count=3, style=medium → 201
    $drMulti = Test-PostJsonCapture "$drUrl`?count=3&style=medium" 201 "POST draft-replies count=3 style=medium" $Headers @{}
    if ($drMulti.ok) { $PassCount++ } else { $FailCount++ }

    # Verify count=3 returns 3 draftIds
    if ($drMulti.ok -and $drMulti.data -and $drMulti.data.draftIds -and $drMulti.data.draftIds.Count -eq 3) {
        Write-Host "Testing: POST draft-replies count=3 returns 3 draftIds  PASS" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host "Testing: POST draft-replies count=3 returns 3 draftIds  FAIL" -ForegroundColor Red
        $FailCount++
    }

    # POST draft-replies style=thread → 201
    if (Test-PostJson "$drUrl`?style=thread" 201 "POST draft-replies style=thread" $Headers @{}) { $PassCount++ } else { $FailCount++ }

    # POST draft-replies invalid count=0 → 400
    if (Test-PostJson "$drUrl`?count=0" 400 "POST draft-replies count=0 rejected" $Headers @{}) { $PassCount++ } else { $FailCount++ }

    # POST draft-replies invalid count=6 → 400
    if (Test-PostJson "$drUrl`?count=6" 400 "POST draft-replies count=6 rejected" $Headers @{}) { $PassCount++ } else { $FailCount++ }

    # POST draft-replies invalid style → 400
    if (Test-PostJson "$drUrl`?style=invalid" 400 "POST draft-replies invalid style rejected" $Headers @{}) { $PassCount++ } else { $FailCount++ }

    # POST draft-replies non-X source item → 400
    if ($capturedItemId) {
        if (Test-PostJson "$Base/api/source-items/$capturedItemId/draft-replies" 400 "POST draft-replies non-X platform rejected" $Headers @{}) { $PassCount++ } else { $FailCount++ }
    }

    # POST draft-replies cross-project → 404
    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$drUrl" 404 "POST draft-replies cross-project non-disclosure" $OtherHeaders @{}) { $PassCount++ } else { $FailCount++ }
    }

    # POST draft-replies invalid UUID → 400
    if (Test-PostJson "$Base/api/source-items/not-a-uuid/draft-replies" 400 "POST draft-replies invalid uuid" $Headers @{}) { $PassCount++ } else { $FailCount++ }

    # POST draft-replies non-existent source → 404
    if (Test-PostJson "$Base/api/source-items/00000000-0000-4000-a000-000000000009/draft-replies" 404 "POST draft-replies source not found" $Headers @{}) { $PassCount++ } else { $FailCount++ }

    # GET draft-replies → 200 (list)
    if (Test-Endpoint "GET" "$drUrl" 200 "GET draft-replies (list)" $Headers) { $PassCount++ } else { $FailCount++ }

    # GET draft-replies cross-project → 404
    if ($OtherHeaders.Count -gt 0) {
        if (Test-Endpoint "GET" "$drUrl" 404 "GET draft-replies cross-project non-disclosure" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
    }

    # GET draft-replies invalid UUID → 400
    if (Test-Endpoint "GET" "$Base/api/source-items/not-a-uuid/draft-replies" 400 "GET draft-replies invalid uuid" $Headers) { $PassCount++ } else { $FailCount++ }
}

Write-Host ""
Write-Host "=== VERIFY FRESHNESS TESTS (W2) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping verify-freshness tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    # Valid freshness verification
    if (Test-PostEmpty "$Base/api/entities/$entityId/verify-freshness" 200 "POST verify-freshness (valid)" $Headers) { $PassCount++ } else { $FailCount++ }

    # Invalid UUID
    if (Test-PostEmpty "$Base/api/entities/not-a-uuid/verify-freshness" 400 "POST verify-freshness invalid uuid" $Headers) { $PassCount++ } else { $FailCount++ }

    # Non-existent entity
    if (Test-PostEmpty "$Base/api/entities/00000000-0000-4000-a000-000000000099/verify-freshness" 404 "POST verify-freshness not found" $Headers) { $PassCount++ } else { $FailCount++ }

    # Cross-project
    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostEmpty "$Base/api/entities/$entityId/verify-freshness" 404 "POST verify-freshness cross-project" $OtherHeaders) { $PassCount++ } else { $FailCount++ }
    }
}

Write-Host ""
Write-Host "=== SEO KEYWORD RESEARCH TESTS (W4) ===" -ForegroundColor Yellow

# W4: confirm=false should return cost estimate, not call external API
$w4Body = @{
    keywords = @("test keyword", "another keyword")
    location = "United States"
    language = "en"
}
$w4Result = Test-PostJsonCapture "$Base/api/seo/keyword-research" 200 "POST keyword-research confirm=false (cost estimate)" $Headers $w4Body
if ($w4Result.ok) { $PassCount++ } else { $FailCount++ }

# Verify the response has action=confirm_required
if ($w4Result.ok -and $w4Result.data -and $w4Result.data.action -eq "confirm_required") {
    Write-Host "Testing: W4 cost estimate returns confirm_required  PASS" -ForegroundColor Green
    $PassCount++
} else {
    Write-Host "Testing: W4 cost estimate returns confirm_required  FAIL" -ForegroundColor Red
    $FailCount++
}

# Empty keywords
$w4Empty = @{ keywords = @() }
if (Test-PostJson "$Base/api/seo/keyword-research" 400 "POST keyword-research empty keywords" $Headers $w4Empty) { $PassCount++ } else { $FailCount++ }

# Too many keywords
$w4TooMany = @{ keywords = @(1..21 | ForEach-Object { "kw$_" }) }
if (Test-PostJson "$Base/api/seo/keyword-research" 400 "POST keyword-research >20 keywords" $Headers $w4TooMany) { $PassCount++ } else { $FailCount++ }

# Malformed JSON
if (Test-RawBody "POST" "$Base/api/seo/keyword-research" 400 "POST keyword-research malformed JSON" $Headers "not{json") { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== SEO SERP SNAPSHOT TESTS (W5) ===" -ForegroundColor Yellow

$w5Body = @{
    queries = @("test serp query")
    location = "United States"
    language = "en"
}
$w5Result = Test-PostJsonCapture "$Base/api/seo/serp-snapshot" 200 "POST serp-snapshot confirm=false (cost estimate)" $Headers $w5Body
if ($w5Result.ok) { $PassCount++ } else { $FailCount++ }

if ($w5Result.ok -and $w5Result.data -and $w5Result.data.action -eq "confirm_required") {
    Write-Host "Testing: W5 cost estimate returns confirm_required  PASS" -ForegroundColor Green
    $PassCount++
} else {
    Write-Host "Testing: W5 cost estimate returns confirm_required  FAIL" -ForegroundColor Red
    $FailCount++
}

# Too many queries (max 3)
$w5TooMany = @{ queries = @("q1","q2","q3","q4") }
if (Test-PostJson "$Base/api/seo/serp-snapshot" 400 "POST serp-snapshot >3 queries" $Headers $w5TooMany) { $PassCount++ } else { $FailCount++ }

# Empty queries
$w5Empty = @{ queries = @() }
if (Test-PostJson "$Base/api/seo/serp-snapshot" 400 "POST serp-snapshot empty queries" $Headers $w5Empty) { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== SEO CONTENT BRIEF TESTS (W6) ===" -ForegroundColor Yellow

if (-not $entityId) {
    Write-Host "Skipping content-brief tests: no entities found" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    # Valid brief generation (no W4/W5 artifacts, just entity graph)
    $w6Body = @{ entityId = $entityId }
    $w6Result = Test-PostJsonCapture "$Base/api/seo/content-brief" 201 "POST content-brief (valid, entity only)" $Headers $w6Body
    if ($w6Result.ok) { $PassCount++ } else { $FailCount++ }

    # Missing entityId
    $w6NoEntity = @{}
    if (Test-PostJson "$Base/api/seo/content-brief" 400 "POST content-brief missing entityId" $Headers $w6NoEntity) { $PassCount++ } else { $FailCount++ }

    # Invalid entityId
    $w6BadEntity = @{ entityId = "not-a-uuid" }
    if (Test-PostJson "$Base/api/seo/content-brief" 400 "POST content-brief invalid entityId" $Headers $w6BadEntity) { $PassCount++ } else { $FailCount++ }

    # Non-existent entity
    $w6Missing = @{ entityId = "00000000-0000-4000-a000-000000000099" }
    if (Test-PostJson "$Base/api/seo/content-brief" 404 "POST content-brief entity not found" $Headers $w6Missing) { $PassCount++ } else { $FailCount++ }

    # Cross-project
    if ($OtherHeaders.Count -gt 0) {
        if (Test-PostJson "$Base/api/seo/content-brief" 404 "POST content-brief cross-project" $OtherHeaders $w6Body) { $PassCount++ } else { $FailCount++ }
    }
}

Write-Host ""
Write-Host "=== SEO AI KEYWORD VOLUME TESTS (W7) ===" -ForegroundColor Yellow

# W7: confirm=false should return cost estimate
$w7Body = @{
    keywords = @("artificial intelligence", "machine learning")
    location = "United States"
    language = "en"
}
$w7Result = Test-PostJsonCapture "$Base/api/seo/ai-keyword-volume" 200 "POST ai-keyword-volume confirm=false (cost estimate)" $Headers $w7Body
if ($w7Result.ok) { $PassCount++ } else { $FailCount++ }

if ($w7Result.ok -and $w7Result.data -and $w7Result.data.action -eq "confirm_required") {
    Write-Host "Testing: W7 cost estimate returns confirm_required  PASS" -ForegroundColor Green
    $PassCount++
} else {
    Write-Host "Testing: W7 cost estimate returns confirm_required  FAIL" -ForegroundColor Red
    $FailCount++
}

# Neither keywords nor entityIds
$w7Neither = @{ location = "United States" }
if (Test-PostJson "$Base/api/seo/ai-keyword-volume" 400 "POST ai-keyword-volume no keywords or entityIds" $Headers $w7Neither) { $PassCount++ } else { $FailCount++ }

# entityIds with non-existent entity
if (-not $entityId) {
    Write-Host "Skipping W7 entityIds test: no entities" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    $w7EntityBody = @{
        entityIds = @($entityId)
        confirm = $false
    }
    $w7EntResult = Test-PostJsonCapture "$Base/api/seo/ai-keyword-volume" 200 "POST ai-keyword-volume with entityIds confirm=false" $Headers $w7EntityBody
    if ($w7EntResult.ok) { $PassCount++ } else { $FailCount++ }
}

# Malformed JSON
if (Test-RawBody "POST" "$Base/api/seo/ai-keyword-volume" 400 "POST ai-keyword-volume malformed JSON" $Headers "bad{{") { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) { exit 0 } else { exit 1 }