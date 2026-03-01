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
# - /api/seo/keyword-targets (SIL-1: create + normalization + isolation)
# - /api/seo/serp-snapshots (SIL-1: create + idempotent replay + validation)
# - Deterministic ordering verification (entities list)
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
Write-Host "=== SUMMARY ===" -ForegroundColor Yellow
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red
Write-Host ("SKIP: " + $SkipCount) -ForegroundColor DarkYellow

if ($FailCount -eq 0) { exit 0 } else { exit 1 }