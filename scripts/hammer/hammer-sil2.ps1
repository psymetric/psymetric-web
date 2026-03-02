# hammer-sil2.ps1 — W4 (keyword-research wrapper) + SIL-2 (SERP deltas)
# Dot-sourced by api-hammer.ps1. Inherits all symbols from hammer-lib.ps1 + coordinator.

Hammer-Section "W4 TESTS (KEYWORD RESEARCH WRAPPER)"

$w4RunId   = (Get-Date).Ticks
$w4Keywords = @("best crm software $w4RunId", "  CRM  Comparison $w4RunId  ", "crm pricing $w4RunId")
$w4Locale  = "en-US"
$w4Device  = "desktop"

# W4-1: confirm=false -> 200 + confirm_required + normalized_keywords count
try {
    Write-Host "Testing: POST /api/seo/keyword-research confirm=false -> 200 + confirm_required" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers -Body (@{keywords=$w4Keywords;locale=$w4Locale;device=$w4Device;confirm=$false} | ConvertTo-Json -Depth 5 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d = ($resp.Content | ConvertFrom-Json).data
        $nkLen = if ($d.normalized_keywords) { $d.normalized_keywords.Count } else { -1 }
        if ($d -ne $null -and $d.confirm_required -eq $true -and $nkLen -eq $w4Keywords.Count) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
        else { Write-Host "  FAIL (missing confirm_required, normalized_keywords, or wrong count)" -ForegroundColor Red; Hammer-Record FAIL }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# W4-2: confirm=true -> 201 + created>=1 + targets sorted asc
try {
    Write-Host "Testing: POST /api/seo/keyword-research confirm=true -> 201 + created>=1 + ordered" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers -Body (@{keywords=$w4Keywords;locale=$w4Locale;device=$w4Device;confirm=$true} | ConvertTo-Json -Depth 5 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 201) {
        $d = ($resp.Content | ConvertFrom-Json).data
        $created = if ($null -ne $d.created) { [int]$d.created } else { -1 }
        $targets = $d.targets; $orderOk = $true
        if ($targets -and $targets.Count -gt 1) {
            for ($i=0; $i -lt ($targets.Count - 1); $i++) {
                if ([string]::Compare($targets[$i].query, $targets[$i+1].query, $true) -gt 0) { $orderOk=$false; break }
            }
        }
        if ($created -ge 1 -and $orderOk) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
        else { Write-Host ("  FAIL (created=" + $created + ", orderOk=" + $orderOk + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 201)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# W4-3: idempotent replay -> 201 + created=0 + skipped>=1
try {
    Write-Host "Testing: POST /api/seo/keyword-research idempotent replay -> 201 created=0 skipped>=1" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers -Body (@{keywords=$w4Keywords;locale=$w4Locale;device=$w4Device;confirm=$true} | ConvertTo-Json -Depth 5 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 201) {
        $d = ($resp.Content | ConvertFrom-Json).data
        $created = if ($null -ne $d.created) { [int]$d.created } else { -1 }
        $skipped = if ($null -ne $d.skipped) { [int]$d.skipped } else { -1 }
        if ($created -eq 0 -and $skipped -ge 1) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
        else { Write-Host ("  FAIL (created=" + $created + ", skipped=" + $skipped + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 201)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# W4-4: empty keywords -> 400
Test-PostJson "$Base/api/seo/keyword-research" 400 "POST keyword-research empty keywords -> 400" $Headers @{keywords=@();locale=$w4Locale;device=$w4Device;confirm=$false}

# W4-5: 20 keywords -> 400 (max 19)
try {
    Write-Host "Testing: POST /api/seo/keyword-research 20 keywords -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers -Body (@{keywords=(1..20|ForEach-Object{"keyword $_ run $w4RunId"});locale=$w4Locale;device=$w4Device;confirm=$false} | ConvertTo-Json -Depth 5 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# W4-6: malformed JSON -> 400
try {
    Write-Host "Testing: POST /api/seo/keyword-research malformed JSON -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers -Body "{not valid json{" -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# W4-7: cross-project -> 201 + created>=1
if ($OtherHeaders.Count -gt 0) {
    try {
        Write-Host "Testing: POST /api/seo/keyword-research cross-project -> 201 (isolated, created>=1)" -NoNewline
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $OtherHeaders -Body (@{keywords=$w4Keywords;locale=$w4Locale;device=$w4Device;confirm=$true} | ConvertTo-Json -Depth 5 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201) {
            $created = if ($null -ne ($resp.Content | ConvertFrom-Json).data.created) { [int]($resp.Content | ConvertFrom-Json).data.created } else { -1 }
            if ($created -ge 1) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS } else { Write-Host ("  FAIL (got 201 but created=" + $created + ")") -ForegroundColor Red; Hammer-Record FAIL }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 201)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
}

# ─────────────────────────────────────────────────────────────────────────────

Hammer-Section "SIL-2 TESTS (SERP DELTAS)"

$sdRunId  = (Get-Date).Ticks
$sdQuery  = "serp delta hammer $sdRunId"
$sdLocale = "en-US"
$sdDevice = "desktop"
$sdKtId   = $null

# Setup: KeywordTarget
try {
    Write-Host "Testing: SIL-2 setup: create KeywordTarget via keyword-research" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers -Body (@{keywords=@($sdQuery);locale=$sdLocale;device=$sdDevice;confirm=$true} | ConvertTo-Json -Depth 5 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 201) {
        $sdKtId = (($resp.Content | ConvertFrom-Json).data.targets | Where-Object { $_.query -eq $sdQuery } | Select-Object -First 1).id
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 201)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

if ([string]::IsNullOrWhiteSpace($sdKtId) -or $sdKtId -notmatch '^[0-9a-fA-F-]{36}$') { $sdKtId = $null }

$sdSnapshotId1 = $null
$sdSnapshotId2 = $null

if ($sdKtId) {
    # Snapshot 1 (from): page-a #1, page-b #2, page-c #3; absent
    try {
        Write-Host "Testing: SIL-2 setup: create snapshot 1 (from)" -NoNewline
        $body = @{
            query=$sdQuery; locale=$sdLocale; device=$sdDevice
            capturedAt=(Get-Date).AddMinutes(-10).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            rawPayload=@{results=@(
                @{url="https://example.com/page-a";rank=1;title="Page A"}
                @{url="https://example.com/page-b";rank=2;title="Page B"}
                @{url="https://example.com/page-c";rank=3;title="Page C"}
            )}
            source="dataforseo"; aiOverviewStatus="absent"
        }
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method POST -Headers $Headers -Body ($body | ConvertTo-Json -Depth 10 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) { $sdSnapshotId1 = ($resp.Content | ConvertFrom-Json).data.id; Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
        else { Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # Snapshot 2 (to): page-b #1, page-a #2, page-d #3; page-c exited; present
    try {
        Write-Host "Testing: SIL-2 setup: create snapshot 2 (to)" -NoNewline
        $body = @{
            query=$sdQuery; locale=$sdLocale; device=$sdDevice
            capturedAt=(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            rawPayload=@{results=@(
                @{url="https://example.com/page-b";rank=1;title="Page B"}
                @{url="https://example.com/page-a";rank=2;title="Page A"}
                @{url="https://example.com/page-d";rank=3;title="Page D"}
            )}
            source="dataforseo"; aiOverviewStatus="present"
        }
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method POST -Headers $Headers -Body ($body | ConvertTo-Json -Depth 10 -Compress) -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) { $sdSnapshotId2 = ($resp.Content | ConvertFrom-Json).data.id; Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
        else { Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
}

# SD-1: missing keywordTargetId -> 400
Test-Endpoint "GET" (Build-Url "/api/seo/serp-deltas" @{})                                                              400 "GET serp-deltas missing keywordTargetId -> 400" $Headers
# SD-2: invalid UUID -> 400
Test-Endpoint "GET" (Build-Url "/api/seo/serp-deltas" @{keywordTargetId="not-a-uuid"})                                  400 "GET serp-deltas invalid UUID -> 400"            $Headers
# SD-3: nonexistent -> 404
Test-Endpoint "GET" (Build-Url "/api/seo/serp-deltas" @{keywordTargetId="00000000-0000-4000-a000-000000000099"})        404 "GET serp-deltas not found -> 404"              $Headers

if ($sdKtId) {
    # SD-4: auto-select -> 200 + delta + AI overview changed
    try {
        Write-Host "Testing: GET serp-deltas auto-select -> 200 + delta + ai_overview changed" -NoNewline
        $resp = Invoke-WebRequest -Uri (Build-Url "/api/seo/serp-deltas" @{keywordTargetId=$sdKtId}) -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $d = ($resp.Content | ConvertFrom-Json).data
            $deltaOk = ($d.delta -ne $null -and $null -ne $d.delta.summary)
            $metaOk  = ($d.metadata -ne $null -and $d.metadata.insufficient_snapshots -eq $false)
            $aioChg  = ($d.delta -ne $null -and $d.delta.ai_overview.changed -eq $true)
            if ($deltaOk -and $metaOk -and $aioChg) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
            else { Write-Host ("  FAIL (deltaOk=" + $deltaOk + " metaOk=" + $metaOk + " aioChanged=" + $aioChg + ")") -ForegroundColor Red; Hammer-Record FAIL }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # SD-5: entered=1, exited=1, moved=2
    try {
        Write-Host "Testing: GET serp-deltas entered/exited/moved counts correct" -NoNewline
        $resp = Invoke-WebRequest -Uri (Build-Url "/api/seo/serp-deltas" @{keywordTargetId=$sdKtId}) -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $s = ($resp.Content | ConvertFrom-Json).data.delta.summary
            if ($s.entered_count -eq 1 -and $s.exited_count -eq 1 -and $s.moved_count -eq 2) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
            else { Write-Host ("  FAIL (entered=" + $s.entered_count + " exited=" + $s.exited_count + " moved=" + $s.moved_count + ", expected 1/1/2)") -ForegroundColor Red; Hammer-Record FAIL }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # SD-6: only fromSnapshotId without toSnapshotId -> 400
    if ($sdSnapshotId1) {
        Test-Endpoint "GET" (Build-Url "/api/seo/serp-deltas" @{keywordTargetId=$sdKtId;fromSnapshotId=$sdSnapshotId1}) 400 "GET serp-deltas only fromSnapshotId -> 400" $Headers
    }

    # SD-7: explicit pair -> 200 + delta present
    if ($sdSnapshotId1 -and $sdSnapshotId2) {
        try {
            Write-Host "Testing: GET serp-deltas explicit snapshot pair -> 200" -NoNewline
            $resp = Invoke-WebRequest -Uri (Build-Url "/api/seo/serp-deltas" @{keywordTargetId=$sdKtId;fromSnapshotId=$sdSnapshotId1;toSnapshotId=$sdSnapshotId2}) -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            if ($resp.StatusCode -eq 200) {
                $delta = ($resp.Content | ConvertFrom-Json).data.delta
                if ($delta -ne $null -and $null -ne $delta.summary) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
                else { Write-Host "  FAIL (missing delta or summary)" -ForegroundColor Red; Hammer-Record FAIL }
            } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
        } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
    }

    # SD-8: cross-project -> 404
    if ($OtherHeaders.Count -gt 0) {
        Test-Endpoint "GET" (Build-Url "/api/seo/serp-deltas" @{keywordTargetId=$sdKtId}) 404 "GET serp-deltas cross-project -> 404" $OtherHeaders
    }
} else {
    Write-Host "Skipping SD-4 through SD-8: KeywordTarget creation failed" -ForegroundColor DarkYellow
    Hammer-Record SKIP; Hammer-Record SKIP; Hammer-Record SKIP; Hammer-Record SKIP; Hammer-Record SKIP
}
