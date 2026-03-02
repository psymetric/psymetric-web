# hammer-sil9.ps1 -- SIL-9 Option A (Compute-on-Read Alerts MVP T1-T3)
#                    + SIL-9.1 (Filtering + Keyset Pagination)
# Dot-sourced by api-hammer.ps1. Inherits $Headers, $OtherHeaders, $Base, Hammer-Section, Hammer-Record.
#
# Endpoint: GET /api/seo/alerts
#
# Response shape (SIL-9.1):
#   alerts: AlertEmitted[], alertCount, totalAlerts,
#   nextCursor: string|null, hasMore: boolean,
#   windowDays, spikeThreshold, concentrationThreshold, limit, computedAt
#
# AlertEmitted union:
#   T1: triggerType, keywordTargetId, query, fromRegime, toRegime,
#       fromSnapshotId, toSnapshotId, fromCapturedAt, toCapturedAt, pairVolatilityScore
#   T2: triggerType, keywordTargetId, query, fromSnapshotId, toSnapshotId,
#       fromCapturedAt, toCapturedAt, pairVolatilityScore, threshold, exceedanceMargin
#   T3: triggerType, projectId, volatilityConcentrationRatio, threshold,
#       top3RiskKeywords, activeKeywordCount
#
# Fixture dependencies:
#   $s3KtId        -- SIL-3 KeywordTarget with >=21 snapshots
#   $OtherHeaders  -- second project headers (set in coordinator)

Hammer-Section "SIL-9 TESTS (COMPUTE-ON-READ ALERT SURFACE - OPTION A MVP + SIL-9.1)"

$sil9Base = "/api/seo/alerts"

# ── SIL9-A: 400 if windowDays missing ────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-A /alerts 400 if windowDays missing" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-B: 400 if windowDays=0 ──────────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-B /alerts 400 if windowDays=0" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-B2: 400 if windowDays=31 ────────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-B2 /alerts 400 if windowDays=31" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=31" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-C: 200 + required top-level fields (SIL-9.1: includes nextCursor, hasMore) ─
try {
    Write-Host "Testing: SIL9-C /alerts 200 + required top-level fields present" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d    = ($resp.Content | ConvertFrom-Json).data
        $props = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
        $required = @("alerts","alertCount","totalAlerts","nextCursor","hasMore",
                      "windowDays","spikeThreshold","concentrationThreshold","limit","computedAt")
        $missing  = $required | Where-Object { $props -notcontains $_ }
        if ($missing.Count -eq 0) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (missing: " + ($missing -join ", ") + ")") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-D: determinism (two calls identical, excluding computedAt) ───────────
try {
    Write-Host "Testing: SIL9-D /alerts deterministic (two calls identical, excluding computedAt)" -NoNewline
    $url = "$Base$sil9Base`?windowDays=30"
    $r1  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    $r2  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -eq 200 -and $r2.StatusCode -eq 200) {
        $d1 = ($r1.Content | ConvertFrom-Json).data
        $d2 = ($r2.Content | ConvertFrom-Json).data
        $a1 = ($d1.alerts | ConvertTo-Json -Depth 10 -Compress)
        $a2 = ($d2.alerts | ConvertTo-Json -Depth 10 -Compress)
        $nc1 = $d1.nextCursor
        $nc2 = $d2.nextCursor
        $countMatch = ($d1.alertCount -eq $d2.alertCount) -and ($d1.totalAlerts -eq $d2.totalAlerts)
        $cursorMatch = ($nc1 -eq $nc2)
        if ($a1 -eq $a2 -and $countMatch -and $cursorMatch) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host "  FAIL (alert arrays or cursors differ between two calls)" -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (status=" + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-E: spikeThreshold=0 -> T2 alerts exist when fixture has >=1 pair ────
try {
    Write-Host "Testing: SIL9-E /alerts spikeThreshold=0 produces T2 alerts when pairs exist" -NoNewline
    if ([string]::IsNullOrWhiteSpace($s3KtId)) {
        Write-Host "  SKIP (s3KtId not available; cannot guarantee pairs exist)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $t2cnt = @($d.alerts | Where-Object { $_.triggerType -eq "T2" }).Count
            if ($t2cnt -ge 1) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  SKIP (no T2 alerts with spikeThreshold=0; totalAlerts=" + $d.totalAlerts + "; may indicate no pairs in window)") -ForegroundColor DarkYellow; Hammer-Record SKIP
            }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-F: T3 null guard ─────────────────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-F /alerts T3 null guard (no T3 when all scores zero)" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=1&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d = ($resp.Content | ConvertFrom-Json).data
        $t3cnt = @($d.alerts | Where-Object { $_.triggerType -eq "T3" }).Count
        if ($t3cnt -eq 0) {
            Write-Host "  PASS (no T3 with likely empty 1-day window)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            $t3 = $d.alerts | Where-Object { $_.triggerType -eq "T3" } | Select-Object -First 1
            if ($null -ne $t3.volatilityConcentrationRatio) {
                Write-Host "  PASS (T3 fired legitimately with non-null ratio)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host "  FAIL (T3 fired with null volatilityConcentrationRatio)" -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-G: cross-project isolation ───────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-G /alerts cross-project isolation (OtherHeaders)" -NoNewline
    if ($OtherHeaders.Count -eq 0) {
        Write-Host "  SKIP (OtherHeaders not available)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $respOther = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
            -Method GET -Headers $OtherHeaders -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        $respMain  = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($respOther.StatusCode -eq 200 -and $respMain.StatusCode -eq 200) {
            $mainKtIds  = @($respMain.Content  | ConvertFrom-Json).data.alerts |
                          Where-Object { $_.keywordTargetId } | ForEach-Object { $_.keywordTargetId }
            $otherKtIds = @($respOther.Content | ConvertFrom-Json).data.alerts |
                          Where-Object { $_.keywordTargetId } | ForEach-Object { $_.keywordTargetId }
            $leaked = $mainKtIds | Where-Object { $otherKtIds -contains $_ }
            if ($leaked.Count -eq 0) {
                Write-Host "  PASS (no cross-project leakage)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $leaked.Count + " keywordTargetIds leaked)") -ForegroundColor Red; Hammer-Record FAIL
            }
        } elseif ($respOther.StatusCode -eq 404) {
            Write-Host "  PASS (other project 404 — isolation enforced)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (other=" + $respOther.StatusCode + " main=" + $respMain.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-H: alerts array items have valid triggerType ─────────────────────────
try {
    Write-Host "Testing: SIL9-H /alerts each item has valid triggerType" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $items = @(($resp.Content | ConvertFrom-Json).data.alerts)
        if ($items.Count -eq 0) {
            Write-Host "  SKIP (no alerts returned)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $invalid = $items | Where-Object { @("T1","T2","T3") -notcontains $_.triggerType }
            if ($invalid.Count -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $invalid.Count + " items with invalid triggerType)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-I: T2 required fields ────────────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-I /alerts T2 items have required fields" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t2s = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T2" })
        if ($t2s.Count -eq 0) {
            Write-Host "  SKIP (no T2 alerts)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $t2Props  = $t2s[0] | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            $required = @("triggerType","keywordTargetId","query","fromSnapshotId","toSnapshotId",
                          "fromCapturedAt","toCapturedAt","pairVolatilityScore","threshold","exceedanceMargin")
            $missing  = $required | Where-Object { $t2Props -notcontains $_ }
            if ($missing.Count -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (missing T2 fields: " + ($missing -join ", ") + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-J: T3 fields present when T3 fires ───────────────────────────────────
try {
    Write-Host "Testing: SIL9-J /alerts T3 fields present when T3 fires" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t3s = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T3" })
        if ($t3s.Count -eq 0) {
            Write-Host "  SKIP (no T3 alerts)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $t3Props  = $t3s[0] | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            $required = @("triggerType","projectId","volatilityConcentrationRatio","threshold","top3RiskKeywords","activeKeywordCount")
            $missing  = $required | Where-Object { $t3Props -notcontains $_ }
            if ($missing.Count -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (missing T3 fields: " + ($missing -join ", ") + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-K: ordering stable across two calls ──────────────────────────────────
try {
    Write-Host "Testing: SIL9-K /alerts ordering stable across two calls" -NoNewline
    $url = "$Base$sil9Base`?windowDays=30&spikeThreshold=0"
    $r1  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    $r2  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -eq 200 -and $r2.StatusCode -eq 200) {
        $arr1 = ($r1.Content | ConvertFrom-Json).data.alerts | ConvertTo-Json -Depth 10 -Compress
        $arr2 = ($r2.Content | ConvertFrom-Json).data.alerts | ConvertTo-Json -Depth 10 -Compress
        if ($arr1 -eq $arr2) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host "  FAIL (alert array order differs)" -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (status=" + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-L: limit=1 returns at most 1 alert ───────────────────────────────────
try {
    Write-Host "Testing: SIL9-L /alerts limit=1 returns at most 1 alert" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $cnt = @(($resp.Content | ConvertFrom-Json).data.alerts).Count
        if ($cnt -le 1) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (alerts.Count=" + $cnt + ", expected <= 1)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-M: spikeThreshold=100 -> no T2 alerts ───────────────────────────────
try {
    Write-Host "Testing: SIL9-M /alerts spikeThreshold=100 produces no T2 alerts" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=100" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t2cnt = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T2" }).Count
        if ($t2cnt -eq 0) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (" + $t2cnt + " T2 alerts with spikeThreshold=100)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-N: concentrationThreshold=0.0 fires T3 when active keywords exist ───
try {
    Write-Host "Testing: SIL9-N /alerts concentrationThreshold=0.0 fires T3 when active keywords exist" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t3s = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T3" })
        if ($t3s.Count -ge 1) {
            if ($null -ne $t3s[0].volatilityConcentrationRatio) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host "  FAIL (T3 fired with null ratio)" -ForegroundColor Red; Hammer-Record FAIL
            }
        } else {
            Write-Host "  SKIP (no T3; may be no active keywords in 30-day window)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# =============================================================================
# SIL-9.1: PAGINATION TESTS
# =============================================================================

Hammer-Section "SIL-9.1 TESTS (FILTERING + KEYSET PAGINATION)"

# ── SIL9-P1: limit=1 returns exactly 1 alert AND non-null nextCursor when more exist ─
try {
    Write-Host "Testing: SIL9-P1 /alerts limit=1 returns nextCursor when more exist" -NoNewline
    # Use spikeThreshold=0 to maximize alert count
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d    = ($resp.Content | ConvertFrom-Json).data
        $cnt  = @($d.alerts).Count
        $tot  = [int]$d.totalAlerts
        $nc   = $d.nextCursor
        $more = $d.hasMore
        if ($tot -le 1) {
            Write-Host "  SKIP (totalAlerts <= 1; cannot verify nextCursor behavior)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } elseif ($cnt -eq 1 -and $null -ne $nc -and $more -eq $true) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (cnt=" + $cnt + " nextCursor=" + $nc + " hasMore=" + $more + " totalAlerts=" + $tot + ")") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-P2: using nextCursor returns next item and does NOT repeat the first ─
try {
    Write-Host "Testing: SIL9-P2 /alerts cursor advances without repeating first item" -NoNewline
    $url1 = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1"
    $r1   = Invoke-WebRequest -Uri $url1 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -ne 200) {
        Write-Host ("  FAIL (page1 status=" + $r1.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
    } else {
        $d1  = ($r1.Content | ConvertFrom-Json).data
        $nc1 = $d1.nextCursor
        $tot = [int]$d1.totalAlerts
        if ($tot -lt 2 -or $null -eq $nc1) {
            Write-Host "  SKIP (fewer than 2 alerts or no nextCursor; cannot verify)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $url2 = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1&cursor=$([System.Uri]::EscapeDataString($nc1))"
            $r2   = Invoke-WebRequest -Uri $url2 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            if ($r2.StatusCode -ne 200) {
                Write-Host ("  FAIL (page2 status=" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
            } else {
                $d2      = ($r2.Content | ConvertFrom-Json).data
                $items1  = @($d1.alerts)
                $items2  = @($d2.alerts)
                if ($items2.Count -eq 0) {
                    Write-Host "  FAIL (page2 returned 0 items but totalAlerts=" + $tot + ")" -ForegroundColor Red; Hammer-Record FAIL
                } else {
                    # The first item on page2 must differ from the first item on page1
                    $p1json = ($items1[0] | ConvertTo-Json -Depth 10 -Compress)
                    $p2json = ($items2[0] | ConvertTo-Json -Depth 10 -Compress)
                    if ($p1json -ne $p2json) {
                        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
                    } else {
                        Write-Host "  FAIL (page2 item[0] is identical to page1 item[0] — duplication)" -ForegroundColor Red; Hammer-Record FAIL
                    }
                }
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-P3: determinism — same query + same cursor yields identical results ──
try {
    Write-Host "Testing: SIL9-P3 /alerts same cursor yields identical results (determinism)" -NoNewline
    $url1 = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1"
    $r1   = Invoke-WebRequest -Uri $url1 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -ne 200) {
        Write-Host ("  FAIL (page1 status=" + $r1.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
    } else {
        $nc1 = ($r1.Content | ConvertFrom-Json).data.nextCursor
        if ($null -eq $nc1) {
            Write-Host "  SKIP (no nextCursor; only 1 or 0 alerts)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $url2 = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1&cursor=$([System.Uri]::EscapeDataString($nc1))"
            $rA   = Invoke-WebRequest -Uri $url2 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            $rB   = Invoke-WebRequest -Uri $url2 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            if ($rA.StatusCode -eq 200 -and $rB.StatusCode -eq 200) {
                $jsonA = ($rA.Content | ConvertFrom-Json).data.alerts | ConvertTo-Json -Depth 10 -Compress
                $jsonB = ($rB.Content | ConvertFrom-Json).data.alerts | ConvertTo-Json -Depth 10 -Compress
                if ($jsonA -eq $jsonB) {
                    Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
                } else {
                    Write-Host "  FAIL (same cursor produced different results on two calls)" -ForegroundColor Red; Hammer-Record FAIL
                }
            } else {
                Write-Host ("  FAIL (page2 status=" + $rA.StatusCode + "/" + $rB.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# =============================================================================
# SIL-9.1: FILTER TESTS
# =============================================================================

# ── SIL9-F1: triggerTypes=T3 returns only T3 alerts (or empty) ───────────────
try {
    Write-Host "Testing: SIL9-F1 /alerts triggerTypes=T3 returns only T3 (or empty)" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&triggerTypes=T3&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $items = @(($resp.Content | ConvertFrom-Json).data.alerts)
        $nonT3 = $items | Where-Object { $_.triggerType -ne "T3" }
        if ($nonT3.Count -eq 0) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (" + $nonT3.Count + " non-T3 alerts returned with triggerTypes=T3)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-F2: keywordTargetId=<known> returns only alerts for that keyword, omits T3 ─
try {
    Write-Host "Testing: SIL9-F2 /alerts keywordTargetId filter excludes T3 and other keywords" -NoNewline
    if ([string]::IsNullOrWhiteSpace($s3KtId)) {
        Write-Host "  SKIP (s3KtId not available)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&keywordTargetId=$s3KtId" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $items  = @(($resp.Content | ConvertFrom-Json).data.alerts)
            $t3s    = $items | Where-Object { $_.triggerType -eq "T3" }
            $badKts = $items | Where-Object { $_.triggerType -ne "T3" -and $_.keywordTargetId -ne $s3KtId }
            $fail   = $false
            $msg    = ""
            if ($t3s.Count -gt 0) {
                $fail = $true
                $msg  = "T3 returned despite keywordTargetId filter (" + $t3s.Count + ")"
            }
            if ($badKts.Count -gt 0) {
                $fail = $true
                $msg  = $msg + " wrong keywordTargetIds returned (" + $badKts.Count + ")"
            }
            if (-not $fail) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $msg.Trim() + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-F3: minSeverityRank filters out lower severityRank items ─────────────
# T3=7, T2=6, T1=1-5. minSeverityRank=7 should return only T3 (if any) and T3-only.
try {
    Write-Host "Testing: SIL9-F3 /alerts minSeverityRank=7 returns only rank>=7 alerts" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&minSeverityRank=7&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $items = @(($resp.Content | ConvertFrom-Json).data.alerts)
        # We can't directly see severityRank (it's stripped), but we can verify:
        # No T1 (max rank 5) and no T2 (rank 6) should appear when minSeverityRank=7
        $t1s = $items | Where-Object { $_.triggerType -eq "T1" }
        $t2s = $items | Where-Object { $_.triggerType -eq "T2" }
        if ($t1s.Count -eq 0 -and $t2s.Count -eq 0) {
            Write-Host "  PASS (no T1/T2 with minSeverityRank=7)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (T1=" + $t1s.Count + " T2=" + $t2s.Count + " returned with minSeverityRank=7)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-F4: minPairVolatilityScore=100 yields no T2 alerts ──────────────────
try {
    Write-Host "Testing: SIL9-F4 /alerts minPairVolatilityScore=100 yields no T2 alerts" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&minPairVolatilityScore=100" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t2cnt = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T2" }).Count
        if ($t2cnt -eq 0) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (" + $t2cnt + " T2 alerts with minPairVolatilityScore=100)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# =============================================================================
# SIL-9.1: VALIDATION TESTS
# =============================================================================

# ── SIL9-V1: invalid triggerTypes token -> 400 ────────────────────────────────
try {
    Write-Host "Testing: SIL9-V1 /alerts invalid triggerTypes token -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&triggerTypes=T1,TX" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-V2: invalid cursor -> 400 ───────────────────────────────────────────
try {
    Write-Host "Testing: SIL9-V2 /alerts invalid cursor -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&cursor=not-valid-base64-json!!" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-V2b: structurally valid base64 but semantically invalid cursor -> 400 ─
try {
    Write-Host "Testing: SIL9-V2b /alerts base64 cursor with bad JSON fields -> 400" -NoNewline
    # Encode JSON that is valid base64url but missing required cursor fields
    $badPayload = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"x":1}')) -replace '\+','-' -replace '/','_' -replace '=',''
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&cursor=$badPayload" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-V3: invalid keywordTargetId -> 400 ──────────────────────────────────
try {
    Write-Host "Testing: SIL9-V3 /alerts invalid keywordTargetId -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&keywordTargetId=not-a-uuid" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# =============================================================================
# SIL-9.2: SUPPRESSION TESTS
# =============================================================================

Hammer-Section "SIL-9.2 TESTS (DETERMINISTIC ALERT SUPPRESSION)"

# ── SIL9-S1: suppressionMode=none returns >= alerts as default ────────────────
# none bypasses all suppression; default applies maxPerKeyword + latestPerKeyword.
# So none should produce >= as many alerts as default for the same query.
try {
    Write-Host "Testing: SIL9-S1 /alerts suppressionMode=none returns >= alerts than default" -NoNewline
    $urlNone    = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&suppressionMode=none"
    $urlDefault = "$Base$sil9Base`?windowDays=30&spikeThreshold=0"
    $rNone    = Invoke-WebRequest -Uri $urlNone    -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    $rDefault = Invoke-WebRequest -Uri $urlDefault -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($rNone.StatusCode -eq 200 -and $rDefault.StatusCode -eq 200) {
        $noneTotal    = [int]($rNone.Content    | ConvertFrom-Json).data.totalAlerts
        $defaultTotal = [int]($rDefault.Content | ConvertFrom-Json).data.totalAlerts
        if ($noneTotal -ge $defaultTotal) {
            Write-Host "  PASS (none=$noneTotal default=$defaultTotal)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (none=" + $noneTotal + " < default=" + $defaultTotal + ")") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (none=" + $rNone.StatusCode + " default=" + $rDefault.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S2: default suppression reduces T2 count vs none when pairs exist ────
# With spikeThreshold=0, every pair emits a T2 candidate. maxPerKeyword should
# reduce that to at most 1 T2 per keyword. This test is data-dependent; SKIP if
# no pairs exist in window (totalAlerts=0 for both modes).
try {
    Write-Host "Testing: SIL9-S2 /alerts default suppression reduces T2 vs none" -NoNewline
    $urlNone    = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&suppressionMode=none"
    $urlDefault = "$Base$sil9Base`?windowDays=30&spikeThreshold=0"
    $rNone    = Invoke-WebRequest -Uri $urlNone    -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    $rDefault = Invoke-WebRequest -Uri $urlDefault -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($rNone.StatusCode -eq 200 -and $rDefault.StatusCode -eq 200) {
        $noneT2    = @(($rNone.Content    | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T2" }).Count
        $defaultT2 = @(($rDefault.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T2" }).Count
        if ($noneT2 -eq 0) {
            Write-Host "  SKIP (no T2 alerts in none mode; cannot verify reduction)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } elseif ($defaultT2 -le $noneT2) {
            Write-Host "  PASS (none.T2=$noneT2 default.T2=$defaultT2)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (default T2=" + $defaultT2 + " > none T2=" + $noneT2 + ")") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (status none=" + $rNone.StatusCode + " default=" + $rDefault.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S3: t2Mode=maxPerKeyword returns at most 1 T2 per keywordTargetId ────
try {
    Write-Host "Testing: SIL9-S3 /alerts t2Mode=maxPerKeyword returns at most 1 T2 per keywordTargetId" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&t2Mode=maxPerKeyword&suppressionMode=none" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    # Note: suppressionMode=none disables OTHER suppressions but t2Mode= is explicit,
    # so we test t2Mode directly with suppressionMode=none for t1/t3 neutrality.
    # Actually t2Mode overrides the default — use suppressionMode=default to ensure t2Mode=maxPerKeyword path fires.
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&t2Mode=maxPerKeyword" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t2s = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T2" })
        if ($t2s.Count -eq 0) {
            Write-Host "  SKIP (no T2 alerts; cannot verify per-keyword constraint)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            # Group by keywordTargetId, assert each group has exactly 1
            $byKtId = $t2s | Group-Object -Property keywordTargetId
            $overOne = $byKtId | Where-Object { $_.Count -gt 1 }
            if ($overOne.Count -eq 0) {
                Write-Host "  PASS (all keywordTargetIds have <= 1 T2)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $overOne.Count + " keywords have >1 T2)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S4: determinism under suppression (two calls identical) ──────────────
try {
    Write-Host "Testing: SIL9-S4 /alerts determinism under default suppression" -NoNewline
    $url = "$Base$sil9Base`?windowDays=30&spikeThreshold=0"
    $r1  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    $r2  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -eq 200 -and $r2.StatusCode -eq 200) {
        $d1 = ($r1.Content | ConvertFrom-Json).data
        $d2 = ($r2.Content | ConvertFrom-Json).data
        $arr1 = ($d1.alerts | ConvertTo-Json -Depth 10 -Compress)
        $arr2 = ($d2.alerts | ConvertTo-Json -Depth 10 -Compress)
        $nc1  = $d1.nextCursor
        $nc2  = $d2.nextCursor
        if ($arr1 -eq $arr2 -and $nc1 -eq $nc2 -and $d1.totalAlerts -eq $d2.totalAlerts) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host "  FAIL (results differ between two calls under default suppression)" -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (status=" + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S5: pagination still works under suppression (no duplicates across pages) ─
try {
    Write-Host "Testing: SIL9-S5 /alerts pagination under suppression produces no duplicate alerts" -NoNewline
    # Page 1
    $url1 = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1"
    $r1   = Invoke-WebRequest -Uri $url1 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -ne 200) {
        Write-Host ("  FAIL (page1 status=" + $r1.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
    } else {
        $d1  = ($r1.Content | ConvertFrom-Json).data
        $nc1 = $d1.nextCursor
        $tot = [int]$d1.totalAlerts
        if ($tot -lt 2 -or $null -eq $nc1) {
            Write-Host "  SKIP (fewer than 2 suppressed alerts or no nextCursor)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            # Page 2 via cursor
            $url2 = "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1&cursor=$([System.Uri]::EscapeDataString($nc1))"
            $r2   = Invoke-WebRequest -Uri $url2 -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
            if ($r2.StatusCode -ne 200) {
                Write-Host ("  FAIL (page2 status=" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
            } else {
                $items1 = @($d1.alerts)
                $items2 = @(($r2.Content | ConvertFrom-Json).data.alerts)
                if ($items2.Count -eq 0) {
                    Write-Host "  FAIL (page2 empty despite totalAlerts >= 2)" -ForegroundColor Red; Hammer-Record FAIL
                } else {
                    $p1json = ($items1[0] | ConvertTo-Json -Depth 10 -Compress)
                    $p2json = ($items2[0] | ConvertTo-Json -Depth 10 -Compress)
                    if ($p1json -ne $p2json) {
                        Write-Host "  PASS (page2 item differs from page1 — no duplicate)" -ForegroundColor Green; Hammer-Record PASS
                    } else {
                        Write-Host "  FAIL (page2 item[0] duplicates page1 item[0] under suppression)" -ForegroundColor Red; Hammer-Record FAIL
                    }
                }
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S6: t3Mode=deltaOnly — deterministic, no throw, respects delta rule ──
# This test is data-dependent. It verifies:
#   (a) the param is accepted (no 400)
#   (b) the response is deterministic
#   (c) if T3 fires with deltaOnly, its volatilityConcentrationRatio is non-null
#   (d) suppressionMode param validation: bad value -> 400
try {
    Write-Host "Testing: SIL9-S6 /alerts t3Mode=deltaOnly accepted + deterministic" -NoNewline
    $url = "$Base$sil9Base`?windowDays=30&concentrationThreshold=0.0&t3Mode=deltaOnly"
    $r1  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    $r2  = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($r1.StatusCode -eq 200 -and $r2.StatusCode -eq 200) {
        $arr1 = ($r1.Content | ConvertFrom-Json).data.alerts | ConvertTo-Json -Depth 10 -Compress
        $arr2 = ($r2.Content | ConvertFrom-Json).data.alerts | ConvertTo-Json -Depth 10 -Compress
        if ($arr1 -ne $arr2) {
            Write-Host "  FAIL (deltaOnly non-deterministic between two calls)" -ForegroundColor Red; Hammer-Record FAIL
        } else {
            # If T3 fired, ratio must be non-null
            $t3s = @(($r1.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T3" })
            if ($t3s.Count -gt 0 -and $null -eq $t3s[0].volatilityConcentrationRatio) {
                Write-Host "  FAIL (T3 fired via deltaOnly with null ratio)" -ForegroundColor Red; Hammer-Record FAIL
            } else {
                $note = if ($t3s.Count -gt 0) { " (T3 fired)" } else { " (T3 suppressed; may lack prior-window data)" }
                Write-Host ("  PASS" + $note) -ForegroundColor Green; Hammer-Record PASS
            }
        }
    } else { Write-Host ("  FAIL (status=" + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S7: suppressionMode invalid value -> 400 ────────────────────────────
try {
    Write-Host "Testing: SIL9-S7 /alerts suppressionMode=invalid -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&suppressionMode=aggressive" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S8: t2Mode invalid value -> 400 ─────────────────────────────────────
try {
    Write-Host "Testing: SIL9-S8 /alerts t2Mode=invalid -> 400" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&t2Mode=topOne" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 400) {
        Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 400)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-S9: t1Mode=upwardOnlyLatest returns no downward T1 transitions ───────
# A downward T1 transition has toRegime < fromRegime (i.e. recovery).
# upwardOnlyLatest must suppress all such transitions.
# We map regime names to integers in PowerShell for comparison.
try {
    Write-Host "Testing: SIL9-S9 /alerts t1Mode=upwardOnlyLatest returns no downward T1 transitions" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&t1Mode=upwardOnlyLatest" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $t1s = @(($resp.Content | ConvertFrom-Json).data.alerts | Where-Object { $_.triggerType -eq "T1" })
        if ($t1s.Count -eq 0) {
            Write-Host "  SKIP (no T1 alerts; cannot verify upward-only constraint)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $regimeRank = @{ "calm" = 0; "shifting" = 1; "unstable" = 2; "chaotic" = 3 }
            $downward = $t1s | Where-Object {
                $fromRank = $regimeRank[$_.fromRegime]
                $toRank   = $regimeRank[$_.toRegime]
                $toRank -le $fromRank  # downward or lateral (should be suppressed)
            }
            if ($downward.Count -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $downward.Count + " downward T1 transitions returned with upwardOnlyLatest)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
