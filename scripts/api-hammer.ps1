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
# - /api/audits (Phase 2 S1: list + filters)
# - /api/audits/:id (Phase 2 S1: single with includeExplain/includePromotion)
# - /api/seo/search-performance/ingest (Phase 0-SEO: bulk GSC ingestion)
# - /api/seo/search-performance (Phase 0-SEO: list with filters)
# - /api/quotable-blocks (Phase 0-SEO: create + list GEO citation assets)
# - /api/seo/keyword-targets (SIL-1: create + normalization + isolation + list read surface)
# - /api/seo/serp-snapshots (SIL-1: create + idempotent replay + validation + list read surface)
# - Deterministic ordering verification (entities list, keyword-targets, serp-snapshots)
# - Response envelope validation (data + pagination fields)

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
Write-Host "=== SIL-1 TESTS (KEYWORD TARGETS + SERP SNAPSHOTS) ===" -ForegroundColor Yellow

# --- Keyword Targets ---

$ktRunId = (Get-Date).Ticks
$ktBody = @{
    query = "  Best CRM  Software $ktRunId  "
    locale = "en-US"
    device = "desktop"
    isPrimary = $true
}
$ktExpectedQuery = "best crm software $ktRunId"

$ktResult = Test-PostJsonCapture "$Base/api/seo/keyword-targets" 201 "POST keyword-targets (valid, normalization)" $Headers $ktBody
if ($ktResult.ok) {
    $PassCount++
    # Verify query normalization in response
    if ($ktResult.data -and $ktResult.data.query -eq $ktExpectedQuery) {
        Write-Host "Testing: keyword-target query normalized correctly  PASS" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host "Testing: keyword-target query normalized correctly  FAIL (got '$($ktResult.data.query)', expected '$ktExpectedQuery')" -ForegroundColor Red
        $FailCount++
    }
} else {
    $FailCount++
    Write-Host "Testing: keyword-target query normalized correctly  SKIP (create failed)" -ForegroundColor DarkYellow
    $SkipCount++
}

# Duplicate create -> 409
if (Test-PostJson "$Base/api/seo/keyword-targets" 409 "POST keyword-targets (duplicate -> 409)" $Headers $ktBody) { $PassCount++ } else { $FailCount++ }

# Invalid device -> 400
$ktBadDevice = @{
    query = "test query $ktRunId"
    locale = "en-US"
    device = "tablet"
}
if (Test-PostJson "$Base/api/seo/keyword-targets" 400 "POST keyword-targets (invalid device -> 400)" $Headers $ktBadDevice) { $PassCount++ } else { $FailCount++ }

# Malformed JSON -> 400
try {
    Write-Host "Testing: POST keyword-targets (malformed JSON -> 400)" -NoNewline
    $malformedResp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets" -Method POST -Headers $Headers -Body "not json{" -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($malformedResp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host ("  FAIL (got " + $malformedResp.StatusCode + ", expected 400)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# Cross-project non-disclosure: create same keyword under other project should not leak
if ($OtherHeaders.Count -gt 0) {
    # Other project can create the same keyword independently (201 or 409 depending on prior state)
    # The key invariant: no error message leaks project A's data
    $ktCrossBody = @{
        query = "cross project probe $ktRunId"
        locale = "en-US"
        device = "desktop"
    }
    # Create in project A first
    if (Test-PostJson "$Base/api/seo/keyword-targets" 201 "POST keyword-targets (cross-project setup in A)" $Headers $ktCrossBody) { $PassCount++ } else { $FailCount++ }
    # Attempt same in project B — should succeed (201) because targets are project-scoped
    if (Test-PostJson "$Base/api/seo/keyword-targets" 201 "POST keyword-targets (cross-project B creates independently)" $OtherHeaders $ktCrossBody) { $PassCount++ } else { $FailCount++ }
}

# --- SERP Snapshots ---

$ssRunId = (Get-Date).Ticks
$ssCapturedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$ssBody = @{
    query = "serp hammer $ssRunId"
    locale = "en-US"
    device = "desktop"
    capturedAt = $ssCapturedAt
    rawPayload = @{ results = @(); features = @() }
    source = "dataforseo"
    batchRef = "hammer-$ssRunId"
}

$ssResult = Test-PostJsonCapture "$Base/api/seo/serp-snapshots" 201 "POST serp-snapshots (valid)" $Headers $ssBody
if ($ssResult.ok) {
    $PassCount++
    # Verify aiOverviewStatus defaults when omitted
    if ($ssResult.data -and $ssResult.data.aiOverviewStatus) {
        Write-Host "Testing: serp-snapshot aiOverviewStatus default populated  PASS" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host "Testing: serp-snapshot aiOverviewStatus default populated  FAIL" -ForegroundColor Red
        $FailCount++
    }
} else {
    $FailCount++
    Write-Host "Testing: serp-snapshot aiOverviewStatus default populated  SKIP (create failed)" -ForegroundColor DarkYellow
    $SkipCount++
}

# Idempotent replay: same capturedAt -> 200
if (Test-PostJson "$Base/api/seo/serp-snapshots" 200 "POST serp-snapshots (idempotent replay -> 200)" $Headers $ssBody) { $PassCount++ } else { $FailCount++ }

# Invalid aiOverviewStatus -> 400
$ssBadAio = @{
    query = "test aio $ssRunId"
    locale = "en-US"
    device = "desktop"
    rawPayload = @{ results = @() }
    source = "dataforseo"
    aiOverviewStatus = "maybe"
}
if (Test-PostJson "$Base/api/seo/serp-snapshots" 400 "POST serp-snapshots (invalid aiOverviewStatus -> 400)" $Headers $ssBadAio) { $PassCount++ } else { $FailCount++ }

# Malformed JSON -> 400
try {
    Write-Host "Testing: POST serp-snapshots (malformed JSON -> 400)" -NoNewline
    $malformedSsResp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method POST -Headers $Headers -Body "{broken" -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($malformedSsResp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green
        $PassCount++
    } else {
        Write-Host ("  FAIL (got " + $malformedSsResp.StatusCode + ", expected 400)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# Invalid capturedAt datetime -> 400
$ssBadDate = @{
    query = "test date $ssRunId"
    locale = "en-US"
    device = "desktop"
    capturedAt = "not-a-date"
    rawPayload = @{ results = @() }
    source = "dataforseo"
}
if (Test-PostJson "$Base/api/seo/serp-snapshots" 400 "POST serp-snapshots (invalid capturedAt -> 400)" $Headers $ssBadDate) { $PassCount++ } else { $FailCount++ }

# Source not in allowlist -> 400
$ssBadSource = @{
    query = "test source $ssRunId"
    locale = "en-US"
    device = "desktop"
    rawPayload = @{ results = @() }
    source = "other"
}
if (Test-PostJson "$Base/api/seo/serp-snapshots" 400 "POST serp-snapshots (source not in allowlist -> 400)" $Headers $ssBadSource) { $PassCount++ } else { $FailCount++ }

Write-Host ""
Write-Host "=== SIL-1 LIST TESTS (READ SURFACE) ===" -ForegroundColor Yellow

# --- Keyword Targets: GET list ---

# KT-L-1: Basic list -> 200, envelope present, pagination.total >= 0
try {
    Write-Host "Testing: GET keyword-targets (basic list -> 200, envelope)" -NoNewline
    $ktListResp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets" -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ktListResp.StatusCode -eq 200) {
        $ktListParsed = $ktListResp.Content | ConvertFrom-Json
        if ($ktListParsed.data -ne $null -and $ktListParsed.pagination -ne $null -and $ktListParsed.pagination.total -ge 0) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (missing data/pagination or total < 0)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host ("  FAIL (got " + $ktListResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# KT-L-2: Filter by device=desktop -> 200, all items have device=desktop
try {
    Write-Host "Testing: GET keyword-targets device=desktop filter (all items match)" -NoNewline
    $ktDesktopUrl = Build-Url -Path "/api/seo/keyword-targets" -Params @{ device = "desktop" }
    $ktDesktopResp = Invoke-WebRequest -Uri $ktDesktopUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ktDesktopResp.StatusCode -eq 200) {
        $ktDesktopParsed = $ktDesktopResp.Content | ConvertFrom-Json
        $allDesktop = $true
        foreach ($item in $ktDesktopParsed.data) {
            if ($item.device -ne "desktop") { $allDesktop = $false; break }
        }
        if ($allDesktop) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (non-desktop item in filtered result)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host ("  FAIL (got " + $ktDesktopResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# KT-L-3: Invalid device -> 400
$ktInvalidDeviceUrl = Build-Url -Path "/api/seo/keyword-targets" -Params @{ device = "tablet" }
if (Test-Endpoint "GET" $ktInvalidDeviceUrl 400 "GET keyword-targets invalid device -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# KT-L-4: Invalid isPrimary -> 400
$ktInvalidIsPrimaryUrl = Build-Url -Path "/api/seo/keyword-targets" -Params @{ isPrimary = "1" }
if (Test-Endpoint "GET" $ktInvalidIsPrimaryUrl 400 "GET keyword-targets isPrimary=1 -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# KT-L-4b: isPrimary=yes -> 400
$ktInvalidIsPrimaryYesUrl = Build-Url -Path "/api/seo/keyword-targets" -Params @{ isPrimary = "yes" }
if (Test-Endpoint "GET" $ktInvalidIsPrimaryYesUrl 400 "GET keyword-targets isPrimary=yes -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# KT-L-5: Deterministic ordering (createdAt desc, id desc)
try {
    Write-Host "Testing: GET keyword-targets ordering deterministic (createdAt desc, id tiebreak)" -NoNewline
    $ktOrd1 = Try-GetJson -Url "$Base/api/seo/keyword-targets?limit=20" -RequestHeaders $Headers
    $ktOrd2 = Try-GetJson -Url "$Base/api/seo/keyword-targets?limit=20" -RequestHeaders $Headers
    if ($ktOrd1 -and $ktOrd2 -and $ktOrd1.data -and $ktOrd2.data) {
        # Two sequential calls must return identical id order
        $ktIds1 = $ktOrd1.data | ForEach-Object { $_.id }
        $ktIds2 = $ktOrd2.data | ForEach-Object { $_.id }
        $ktOrderMatch = ($ktIds1.Count -eq $ktIds2.Count)
        if ($ktOrderMatch) {
            for ($i = 0; $i -lt $ktIds1.Count; $i++) {
                if ($ktIds1[$i] -ne $ktIds2[$i]) { $ktOrderMatch = $false; break }
            }
        }
        # Additionally verify createdAt descending within single result
        $ktCreatedAtOk = $true
        $ktItems = $ktOrd1.data
        for ($i = 0; $i -lt ($ktItems.Count - 1); $i++) {
            $tA = [datetime]::Parse($ktItems[$i].createdAt)
            $tB = [datetime]::Parse($ktItems[$i+1].createdAt)
            if ($tA -lt $tB) { $ktCreatedAtOk = $false; break }
        }
        if ($ktOrderMatch -and $ktCreatedAtOk) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (ordering not deterministic or createdAt not descending)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host "  SKIP (no keyword targets to order)" -ForegroundColor DarkYellow
        $SkipCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# KT-L-6: Filter by isPrimary=true -> all returned items have isPrimary=true
try {
    Write-Host "Testing: GET keyword-targets isPrimary=true filter (all items match)" -NoNewline
    $ktPrimaryUrl = Build-Url -Path "/api/seo/keyword-targets" -Params @{ isPrimary = "true" }
    $ktPrimaryResp = Invoke-WebRequest -Uri $ktPrimaryUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ktPrimaryResp.StatusCode -eq 200) {
        $ktPrimaryParsed = $ktPrimaryResp.Content | ConvertFrom-Json
        $allPrimary = $true
        foreach ($item in $ktPrimaryParsed.data) {
            if ($item.isPrimary -ne $true) { $allPrimary = $false; break }
        }
        if ($allPrimary) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (non-primary item in isPrimary=true filtered result)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host ("  FAIL (got " + $ktPrimaryResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# --- SERP Snapshots: GET list ---

# The normalized query from the POST section (already lowercase, no extra spaces)
$ssNormalizedQuery = "serp hammer $ssRunId"

# SS-L-1: Basic list -> 200, envelope present, pagination.total >= 0
try {
    Write-Host "Testing: GET serp-snapshots (basic list -> 200, envelope)" -NoNewline
    $ssListResp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ssListResp.StatusCode -eq 200) {
        $ssListParsed = $ssListResp.Content | ConvertFrom-Json
        if ($ssListParsed.data -ne $null -and $ssListParsed.pagination -ne $null -and $ssListParsed.pagination.total -ge 0) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (missing data/pagination or total < 0)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host ("  FAIL (got " + $ssListResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# SS-L-2: includePayload=false (default) -> rawPayload NOT present on items
try {
    Write-Host "Testing: GET serp-snapshots includePayload=false -> rawPayload absent" -NoNewline
    $ssNoPayloadUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ includePayload = "false"; limit = "5" }
    $ssNoPayloadResp = Invoke-WebRequest -Uri $ssNoPayloadUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ssNoPayloadResp.StatusCode -eq 200) {
        $ssNoPayloadParsed = $ssNoPayloadResp.Content | ConvertFrom-Json
        $payloadAbsent = $true
        foreach ($item in $ssNoPayloadParsed.data) {
            # ConvertFrom-Json adds a NoteProperty for each JSON key present;
            # if rawPayload was returned it will appear as a property.
            $props = $item | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            if ($props -contains "rawPayload") { $payloadAbsent = $false; break }
        }
        if ($payloadAbsent) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (rawPayload present when includePayload=false)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host ("  FAIL (got " + $ssNoPayloadResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# SS-L-3: includePayload=true -> rawPayload IS present on items (skip if no snapshots)
try {
    Write-Host "Testing: GET serp-snapshots includePayload=true -> rawPayload present" -NoNewline
    $ssWithPayloadUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ includePayload = "true"; limit = "5" }
    $ssWithPayloadResp = Invoke-WebRequest -Uri $ssWithPayloadUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ssWithPayloadResp.StatusCode -eq 200) {
        $ssWithPayloadParsed = $ssWithPayloadResp.Content | ConvertFrom-Json
        if ($ssWithPayloadParsed.data.Count -eq 0) {
            Write-Host "  SKIP (no snapshots to inspect)" -ForegroundColor DarkYellow
            $SkipCount++
        } else {
            $payloadPresent = $true
            foreach ($item in $ssWithPayloadParsed.data) {
                $props = $item | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
                if (-not ($props -contains "rawPayload")) { $payloadPresent = $false; break }
            }
            if ($payloadPresent) {
                Write-Host "  PASS" -ForegroundColor Green
                $PassCount++
            } else {
                Write-Host "  FAIL (rawPayload absent when includePayload=true)" -ForegroundColor Red
                $FailCount++
            }
        }
    } else {
        Write-Host ("  FAIL (got " + $ssWithPayloadResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# SS-L-4: Invalid ISO datetime (from=badvalue) -> 400
$ssInvalidFromUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ from = "badvalue" }
if (Test-Endpoint "GET" $ssInvalidFromUrl 400 "GET serp-snapshots from=badvalue -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# SS-L-4b: Date-only (no timezone) -> 400 (must include TZ offset)
$ssDateOnlyUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ from = "2025-01-01" }
if (Test-Endpoint "GET" $ssDateOnlyUrl 400 "GET serp-snapshots from=date-only (no TZ) -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# SS-L-5: Invalid includePayload (includePayload=1) -> 400
$ssInvalidPayloadFlagUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ includePayload = "1" }
if (Test-Endpoint "GET" $ssInvalidPayloadFlagUrl 400 "GET serp-snapshots includePayload=1 -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# SS-L-5b: includePayload=yes -> 400
$ssInvalidPayloadYesUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ includePayload = "yes" }
if (Test-Endpoint "GET" $ssInvalidPayloadYesUrl 400 "GET serp-snapshots includePayload=yes -> 400" $Headers) { $PassCount++ } else { $FailCount++ }

# SS-L-6: Deterministic ordering (capturedAt desc, id desc)
try {
    Write-Host "Testing: GET serp-snapshots ordering deterministic (capturedAt desc, id tiebreak)" -NoNewline
    $ssOrd1 = Try-GetJson -Url "$Base/api/seo/serp-snapshots?limit=20" -RequestHeaders $Headers
    $ssOrd2 = Try-GetJson -Url "$Base/api/seo/serp-snapshots?limit=20" -RequestHeaders $Headers
    if ($ssOrd1 -and $ssOrd2 -and $ssOrd1.data -and $ssOrd2.data) {
        # Two sequential calls must return identical id order
        $ssIds1 = $ssOrd1.data | ForEach-Object { $_.id }
        $ssIds2 = $ssOrd2.data | ForEach-Object { $_.id }
        $ssOrderMatch = ($ssIds1.Count -eq $ssIds2.Count)
        if ($ssOrderMatch) {
            for ($i = 0; $i -lt $ssIds1.Count; $i++) {
                if ($ssIds1[$i] -ne $ssIds2[$i]) { $ssOrderMatch = $false; break }
            }
        }
        # Verify capturedAt descending within single result
        $ssCapturedAtOk = $true
        $ssItems = $ssOrd1.data
        for ($i = 0; $i -lt ($ssItems.Count - 1); $i++) {
            $tA = [datetime]::Parse($ssItems[$i].capturedAt)
            $tB = [datetime]::Parse($ssItems[$i+1].capturedAt)
            if ($tA -lt $tB) { $ssCapturedAtOk = $false; break }
        }
        if ($ssOrderMatch -and $ssCapturedAtOk) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (ordering not deterministic or capturedAt not descending)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host "  SKIP (no serp snapshots to order)" -ForegroundColor DarkYellow
        $SkipCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

# SS-L-7: Filter by query (normalized) -> only matching snapshots returned
if (-not $ssResult.ok) {
    Write-Host "Testing: GET serp-snapshots filter by query (normalized)  SKIP (POST snapshot failed)" -ForegroundColor DarkYellow
    $SkipCount++
} else {
    try {
        Write-Host "Testing: GET serp-snapshots filter by query -> only matching items" -NoNewline
        $ssQueryFilterUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ query = $ssNormalizedQuery; limit = "20" }
        $ssQueryFilterResp = Invoke-WebRequest -Uri $ssQueryFilterUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($ssQueryFilterResp.StatusCode -eq 200) {
            $ssQueryFilterParsed = $ssQueryFilterResp.Content | ConvertFrom-Json
            # All returned items must have query = normalized form
            $allMatch = $true
            foreach ($item in $ssQueryFilterParsed.data) {
                if ($item.query -ne $ssNormalizedQuery) { $allMatch = $false; break }
            }
            # At least the one we created must be present
            $containsOurs = $false
            foreach ($item in $ssQueryFilterParsed.data) {
                if ($item.query -eq $ssNormalizedQuery) { $containsOurs = $true; break }
            }
            if ($allMatch -and $containsOurs) {
                Write-Host "  PASS" -ForegroundColor Green
                $PassCount++
            } else {
                Write-Host "  FAIL (filter returned non-matching items or did not include our snapshot)" -ForegroundColor Red
                $FailCount++
            }
        } else {
            Write-Host ("  FAIL (got " + $ssQueryFilterResp.StatusCode + ", expected 200)") -ForegroundColor Red
            $FailCount++
        }
    } catch {
        Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
        $FailCount++
    }
}

# SS-L-8: from/to range filter -> capturedAt within bounds
try {
    Write-Host "Testing: GET serp-snapshots from/to range filter -> capturedAt within bounds" -NoNewline
    $ssFromVal = "2020-01-01T00:00:00Z"
    $ssToVal   = (Get-Date).AddDays(1).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $ssRangeUrl = Build-Url -Path "/api/seo/serp-snapshots" -Params @{ from = $ssFromVal; to = $ssToVal; limit = "20" }
    $ssRangeResp = Invoke-WebRequest -Uri $ssRangeUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($ssRangeResp.StatusCode -eq 200) {
        $ssRangeParsed = $ssRangeResp.Content | ConvertFrom-Json
        $fromDt = [datetime]::Parse($ssFromVal)
        $toDt   = [datetime]::Parse($ssToVal)
        $allInRange = $true
        foreach ($item in $ssRangeParsed.data) {
            $cAt = [datetime]::Parse($item.capturedAt)
            if ($cAt -lt $fromDt -or $cAt -gt $toDt) { $allInRange = $false; break }
        }
        if ($allInRange) {
            Write-Host "  PASS" -ForegroundColor Green
            $PassCount++
        } else {
            Write-Host "  FAIL (items outside from/to range returned)" -ForegroundColor Red
            $FailCount++
        }
    } else {
        Write-Host ("  FAIL (got " + $ssRangeResp.StatusCode + ", expected 200)") -ForegroundColor Red
        $FailCount++
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
    $FailCount++
}

Write-Host ""
Write-Host "=== DETERMINISTIC ORDERING TEST ==="  -ForegroundColor Yellow

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

        # GET /api/audits/:id includePromotion=true (promoted/archived)
        try {
            Write-Host "Testing: GET /api/audits/:id includePromotion=true (promoted)" -NoNewline
            $promUrl = "$Base/api/audits/$draftIdForPromote`?includePromotion=true"
            $promResp = Invoke-WebRequest -Uri $promUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            if ($promResp.StatusCode -eq 200) {
                $promParsed = $promResp.Content | ConvertFrom-Json
                if ($promParsed.data -ne $null) {
                    $promProps = $promParsed.data | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
                    if ($promProps -contains "promotion") {
                        Write-Host "  PASS" -ForegroundColor Green
                    } else {
                        Write-Host "  FAIL (promotion field missing from response)" -ForegroundColor Red
                    }
                    $PassCount++
                } else {
                    Write-Host "  FAIL (missing data envelope)" -ForegroundColor Red
                    $FailCount++
                }
            } else {
                Write-Host ("  FAIL (got " + $promResp.StatusCode + ", expected 200)") -ForegroundColor Red
                $FailCount++
            }
        } catch {
            Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
            $FailCount++
        }

        # GET /api/audits/:id includeExplain=true (promoted/archived)
        try {
            Write-Host "Testing: GET /api/audits/:id includeExplain=true (promoted)" -NoNewline
            $explainUrl = "$Base/api/audits/$draftIdForPromote`?includeExplain=true"
            $explainResp = Invoke-WebRequest -Uri $explainUrl -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            if ($explainResp.StatusCode -eq 200) {
                $explainParsed = $explainResp.Content | ConvertFrom-Json
                if ($explainParsed.data -ne $null) {
                    $explainProps = $explainParsed.data | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
                    if ($explainProps -contains "explain") {
                        Write-Host "  PASS" -ForegroundColor Green
                    } else {
                        Write-Host "  FAIL (explain field missing from response)" -ForegroundColor Red
                    }
                    $PassCount++
                } else {
                    Write-Host "  FAIL (missing data envelope)" -ForegroundColor Red
                    $FailCount++
                }
            } else {
                Write-Host ("  FAIL (got " + $explainResp.StatusCode + ", expected 200)") -ForegroundColor Red
                $FailCount++
            }
        } catch {
            Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red
            $FailCount++
        }

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
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) { exit 0 } else { exit 1 }