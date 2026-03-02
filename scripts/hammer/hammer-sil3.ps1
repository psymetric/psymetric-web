# hammer-sil3.ps1 — SIL-3 (Keyword Volatility Aggregation)
# Dot-sourced by api-hammer.ps1. Inherits all symbols from hammer-lib.ps1 + coordinator.

Hammer-Section "SIL-3 TESTS (KEYWORD VOLATILITY)"

# ── Setup: create a fresh KeywordTarget + 3 snapshots with known delta data ────
$s3RunId  = (Get-Date).Ticks
$s3Query  = "volatility hammer $s3RunId"
$s3Locale = "en-US"
$s3Device = "desktop"
$s3KtId   = $null

try {
    Write-Host "Testing: SIL-3 setup: create KeywordTarget" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-research" -Method POST -Headers $Headers `
        -Body (@{keywords=@($s3Query);locale=$s3Locale;device=$s3Device;confirm=$true} | ConvertTo-Json -Depth 5 -Compress) `
        -ContentType "application/json" -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 201) {
        $s3KtId = (($resp.Content | ConvertFrom-Json).data.targets |
            Where-Object { $_.query -eq $s3Query } | Select-Object -First 1).id
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 201)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

if ([string]::IsNullOrWhiteSpace($s3KtId) -or $s3KtId -notmatch '^[0-9a-fA-F-]{36}$') { $s3KtId = $null }

# ── VL-A: invalid UUID → 400 ──────────────────────────────────────────────────
Test-Endpoint "GET" "$Base/api/seo/keyword-targets/not-a-uuid/volatility" 400 `
    "GET volatility invalid UUID -> 400" $Headers

# ── VL-B: nonexistent UUID → 404 ─────────────────────────────────────────────
Test-Endpoint "GET" "$Base/api/seo/keyword-targets/00000000-0000-4000-a000-000000000099/volatility" 404 `
    "GET volatility not found -> 404" $Headers

if (-not $s3KtId) {
    Write-Host "Skipping VL-C through VL-I: KeywordTarget creation failed" -ForegroundColor DarkYellow
    for ($i=0; $i -lt 7; $i++) { Hammer-Record SKIP }
} else {
    # ── VL-C: <2 snapshots → sampleSize=0, all metrics 0, 200 ─────────────────
    try {
        Write-Host "Testing: GET volatility <2 snapshots -> sampleSize=0" -NoNewline
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets/$s3KtId/volatility" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $d = ($resp.Content | ConvertFrom-Json).data
            if ($d.sampleSize -eq 0 -and $d.volatilityScore -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (sampleSize=" + $d.sampleSize + " score=" + $d.volatilityScore + ", expected 0/0)") -ForegroundColor Red
                Hammer-Record FAIL
            }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── Add snapshot 1: page-a #1, page-b #2; aiOverviewStatus=absent ─────────
    $s3Ss1Id = $null
    try {
        Write-Host "Testing: SIL-3 setup: create snapshot 1" -NoNewline
        $body = @{
            query=$s3Query; locale=$s3Locale; device=$s3Device
            capturedAt=(Get-Date).AddMinutes(-20).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            rawPayload=@{results=@(
                @{url="https://example.com/alpha";rank=1;title="Alpha"}
                @{url="https://example.com/beta"; rank=2;title="Beta"}
                @{url="https://example.com/gamma";rank=3;title="Gamma"}
            )}
            source="dataforseo"; aiOverviewStatus="absent"
        }
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method POST -Headers $Headers `
            -Body ($body | ConvertTo-Json -Depth 10 -Compress) -ContentType "application/json" `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) {
            $s3Ss1Id = ($resp.Content | ConvertFrom-Json).data.id
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── Still <2 snapshots for *this run* check already done (VL-C above) ─────

    # ── Add snapshot 2: beta rises to #1, alpha drops to #3, delta enters ─────
    $s3Ss2Id = $null
    try {
        Write-Host "Testing: SIL-3 setup: create snapshot 2" -NoNewline
        $body = @{
            query=$s3Query; locale=$s3Locale; device=$s3Device
            capturedAt=(Get-Date).AddMinutes(-10).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            rawPayload=@{results=@(
                @{url="https://example.com/beta"; rank=1;title="Beta"}
                @{url="https://example.com/gamma";rank=2;title="Gamma"}
                @{url="https://example.com/alpha";rank=3;title="Alpha"}
                # gamma: no change, alpha: +2, beta: -1
            )}
            source="dataforseo"; aiOverviewStatus="present"
        }
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method POST -Headers $Headers `
            -Body ($body | ConvertTo-Json -Depth 10 -Compress) -ContentType "application/json" `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) {
            $s3Ss2Id = ($resp.Content | ConvertFrom-Json).data.id
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── VL-D: 2 snapshots → sampleSize=1, metrics computed, score > 0 ─────────
    try {
        Write-Host "Testing: GET volatility 2 snapshots -> sampleSize=1, score>0" -NoNewline
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets/$s3KtId/volatility" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $d = ($resp.Content | ConvertFrom-Json).data
            $hasMetrics = ($d.sampleSize -eq 1 -and $d.volatilityScore -gt 0 -and $d.aiOverviewChurn -ge 1)
            if ($hasMetrics) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (sampleSize=" + $d.sampleSize + " score=" + $d.volatilityScore + " aioChurn=" + $d.aiOverviewChurn + ")") -ForegroundColor Red
                Hammer-Record FAIL
            }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── Add snapshot 3: another change so we can verify aggregation ────────────
    try {
        Write-Host "Testing: SIL-3 setup: create snapshot 3" -NoNewline
        $body = @{
            query=$s3Query; locale=$s3Locale; device=$s3Device
            capturedAt=(Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            rawPayload=@{results=@(
                @{url="https://example.com/alpha";rank=1;title="Alpha"}
                @{url="https://example.com/gamma";rank=2;title="Gamma"}
                @{url="https://example.com/beta"; rank=3;title="Beta"}
            )}
            source="dataforseo"; aiOverviewStatus="absent"
        }
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/serp-snapshots" -Method POST -Headers $Headers `
            -Body ($body | ConvertTo-Json -Depth 10 -Compress) -ContentType "application/json" `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 201 -or $resp.StatusCode -eq 200) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── VL-E: 3 snapshots → sampleSize=2, aiOverviewChurn >= 2 ──────────────
    # ss1→ss2: absent→present (flip). ss2→ss3: present→absent (flip). Total churn=2.
    try {
        Write-Host "Testing: GET volatility 3 snapshots -> sampleSize=2, aiOverviewChurn=2" -NoNewline
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets/$s3KtId/volatility" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $d = ($resp.Content | ConvertFrom-Json).data
            if ($d.sampleSize -eq 2 -and $d.aiOverviewChurn -eq 2) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (sampleSize=" + $d.sampleSize + " aiChurn=" + $d.aiOverviewChurn + ", expected 2/2)") -ForegroundColor Red
                Hammer-Record FAIL
            }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── VL-F: Determinism — two identical calls produce identical output ───────
    try {
        Write-Host "Testing: GET volatility deterministic (two sequential calls match)" -NoNewline
        $url = "$Base/api/seo/keyword-targets/$s3KtId/volatility"
        $r1 = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        $r2 = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($r1.StatusCode -eq 200 -and $r2.StatusCode -eq 200) {
            $d1 = ($r1.Content | ConvertFrom-Json).data
            $d2 = ($r2.Content | ConvertFrom-Json).data
            $match = (
                $d1.volatilityScore  -eq $d2.volatilityScore  -and
                $d1.averageRankShift -eq $d2.averageRankShift -and
                $d1.maxRankShift     -eq $d2.maxRankShift     -and
                $d1.aiOverviewChurn  -eq $d2.aiOverviewChurn  -and
                $d1.featureVolatility -eq $d2.featureVolatility -and
                $d1.sampleSize       -eq $d2.sampleSize
            )
            if ($match) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
            else {
                Write-Host ("  FAIL (score1=" + $d1.volatilityScore + " score2=" + $d2.volatilityScore + ")") -ForegroundColor Red
                Hammer-Record FAIL
            }
        } else { Write-Host ("  FAIL (status1=" + $r1.StatusCode + " status2=" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── VL-G: Cross-project non-disclosure → 404 ─────────────────────────────
    if ($OtherHeaders.Count -gt 0) {
        Test-Endpoint "GET" "$Base/api/seo/keyword-targets/$s3KtId/volatility" 404 `
            "GET volatility cross-project -> 404" $OtherHeaders
    } else {
        Write-Host "Testing: GET volatility cross-project -> 404  SKIP (no OtherHeaders)" -ForegroundColor DarkYellow
        Hammer-Record SKIP
    }

    # ── VL-H: Response envelope validation ───────────────────────────────────
    try {
        Write-Host "Testing: GET volatility response envelope has all required fields" -NoNewline
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets/$s3KtId/volatility" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $d = ($resp.Content | ConvertFrom-Json).data
            $props = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            $required = @("keywordTargetId","sampleSize","averageRankShift","maxRankShift",
                          "featureVolatility","aiOverviewChurn","volatilityScore","computedAt")
            $missing = $required | Where-Object { $props -notcontains $_ }
            if ($missing.Count -eq 0) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
            else { Write-Host ("  FAIL (missing: " + ($missing -join ", ") + ")") -ForegroundColor Red; Hammer-Record FAIL }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

    # ── VL-I: volatilityScore in [0, 100] ────────────────────────────────────
    try {
        Write-Host "Testing: GET volatility score in range [0, 100]" -NoNewline
        $resp = Invoke-WebRequest -Uri "$Base/api/seo/keyword-targets/$s3KtId/volatility" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $score = ($resp.Content | ConvertFrom-Json).data.volatilityScore
            if ($score -ge 0 -and $score -le 100) { Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS }
            else { Write-Host ("  FAIL (score=" + $score + " out of range [0,100])") -ForegroundColor Red; Hammer-Record FAIL }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    } catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
}
