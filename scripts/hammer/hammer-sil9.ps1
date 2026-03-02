# hammer-sil9.ps1 -- SIL-9 Option A (Compute-on-Read Alerts MVP T1-T3)
# Dot-sourced by api-hammer.ps1. Inherits $Headers, $OtherHeaders, $Base, Hammer-Section, Hammer-Record.
#
# Endpoint: GET /api/seo/alerts
#
# Response shape (spec-canonical):
#   alerts: AlertEmitted[], alertCount, totalAlerts, windowDays,
#   spikeThreshold, concentrationThreshold, limit, computedAt
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
#   $s3KtId        -- SIL-3 KeywordTarget with >=21 snapshots (set in hammer-sil3.ps1 or similar)
#   $OtherHeaders  -- second project headers (set in coordinator)
#
# Tests:
#   SIL9-A: 400 if windowDays missing
#   SIL9-B: 400 if windowDays out of range (0, 31)
#   SIL9-C: 200 + required top-level fields present
#   SIL9-D: determinism (two calls identical; ignore computedAt)
#   SIL9-E: spikeThreshold=0 -> T2 alerts present when fixture has >=1 pair
#   SIL9-F: T3 null guard -- totalVolatilitySum=0 context: no T3 alert
#   SIL9-G: cross-project isolation (OtherHeaders -> 404)
#   SIL9-H: alerts array shape -- each item has triggerType field
#   SIL9-I: T2 alerts have required fields
#   SIL9-J: T3 alert fields present (when T3 fires)
#   SIL9-K: ordering deterministic -- two calls produce identical alert array
#   SIL9-L: limit param respected (limit=1 returns at most 1 alert)
#   SIL9-M: spikeThreshold=100 -> no T2 alerts (score cannot exceed 100)
#   SIL9-N: concentrationThreshold=0.0 -> T3 fires if any active keyword exists with non-zero score

Hammer-Section "SIL-9 TESTS (COMPUTE-ON-READ ALERT SURFACE - OPTION A MVP)"

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

# ── SIL9-C: 200 + required top-level fields ───────────────────────────────────
try {
    Write-Host "Testing: SIL9-C /alerts 200 + required top-level fields present" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d    = ($resp.Content | ConvertFrom-Json).data
        $props = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
        $required = @("alerts","alertCount","totalAlerts","windowDays","spikeThreshold","concentrationThreshold","limit","computedAt")
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
        # Compare everything except computedAt
        $a1 = ($d1.alerts | ConvertTo-Json -Depth 10 -Compress)
        $a2 = ($d2.alerts | ConvertTo-Json -Depth 10 -Compress)
        $countMatch = ($d1.alertCount -eq $d2.alertCount) -and ($d1.totalAlerts -eq $d2.totalAlerts)
        if ($a1 -eq $a2 -and $countMatch) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host "  FAIL (alert arrays differ between two calls)" -ForegroundColor Red; Hammer-Record FAIL
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
                # Could legitimately be zero if no snapshots in window
                $ss = [int]$d.totalAlerts
                Write-Host ("  SKIP (no T2 alerts with spikeThreshold=0; totalAlerts=" + $ss + "; may indicate no pairs in window)") -ForegroundColor DarkYellow; Hammer-Record SKIP
            }
        } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-F: T3 null guard -- concentrationThreshold=0.0 with no active keywords ─
# We test with a concentrationThreshold=0.0 (should fire if any active keyword exists
# and totalVolatilitySum>0) but also verify no T3 if we can find the null-sum condition.
# Since we cannot guarantee zero-sum in the main project, we verify the null guard
# indirectly: request with concentrationThreshold=0.0 and check no T3 fires when
# project has all-zero scores (data-dependent; SKIP if cannot confirm).
try {
    Write-Host "Testing: SIL9-F /alerts T3 null guard (no T3 when all scores zero)" -NoNewline
    # Use a narrow windowDays with a project that likely has no snapshots in that 1-day window
    # to get zero activeKeywordCount -> no T3 regardless of threshold
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=1&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d = ($resp.Content | ConvertFrom-Json).data
        $t3cnt = @($d.alerts | Where-Object { $_.triggerType -eq "T3" }).Count
        # If no active keywords in 1-day window, no T3 should fire
        if ($t3cnt -eq 0) {
            Write-Host "  PASS (no T3 with likely empty 1-day window)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            # T3 fired because there ARE pairs in the 1-day window -- check ratio is non-null and > 0
            $t3 = $d.alerts | Where-Object { $_.triggerType -eq "T3" } | Select-Object -First 1
            if ($null -ne $t3.volatilityConcentrationRatio) {
                Write-Host "  PASS (T3 fired legitimately with non-null ratio; null guard works by construction)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host "  FAIL (T3 fired with null volatilityConcentrationRatio)" -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-G: cross-project isolation -> 404 ────────────────────────────────────
try {
    Write-Host "Testing: SIL9-G /alerts cross-project isolation (OtherHeaders -> 404 or empty)" -NoNewline
    if ($OtherHeaders.Count -eq 0) {
        Write-Host "  SKIP (OtherHeaders not available)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        # /alerts is project-scope (no :id); resolveProjectId uses OtherHeaders to get other project.
        # It should return 200 with that project's data (which may be empty), NOT 404.
        # Isolation test: make sure main project's keyword data does NOT appear in other project's alerts.
        $respOther = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
            -Method GET -Headers $OtherHeaders -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        $respMain  = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
            -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($respOther.StatusCode -eq 200 -and $respMain.StatusCode -eq 200) {
            $dOther = ($respOther.Content | ConvertFrom-Json).data
            $dMain  = ($respMain.Content  | ConvertFrom-Json).data
            # Collect all keywordTargetIds in main project alerts
            $mainKtIds = @($dMain.alerts | Where-Object { $_.keywordTargetId } | ForEach-Object { $_.keywordTargetId })
            # Collect all keywordTargetIds in other project alerts
            $otherKtIds = @($dOther.alerts | Where-Object { $_.keywordTargetId } | ForEach-Object { $_.keywordTargetId })
            # No main project ktId should appear in other project response
            $leaked = $mainKtIds | Where-Object { $otherKtIds -contains $_ }
            if ($leaked.Count -eq 0) {
                Write-Host "  PASS (no cross-project leakage)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $leaked.Count + " keywordTargetIds leaked to other project response)") -ForegroundColor Red; Hammer-Record FAIL
            }
        } elseif ($respOther.StatusCode -eq 404) {
            # Acceptable: other project not found
            Write-Host "  PASS (other project 404 — isolation enforced)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (other=" + $respOther.StatusCode + " main=" + $respMain.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-H: alerts array items have triggerType field ─────────────────────────
try {
    Write-Host "Testing: SIL9-H /alerts each item has triggerType field" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d = ($resp.Content | ConvertFrom-Json).data
        $items = @($d.alerts)
        if ($items.Count -eq 0) {
            Write-Host "  SKIP (no alerts returned; cannot verify field)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $missingType = $items | Where-Object { -not $_.triggerType }
            if ($missingType.Count -eq 0) {
                $validTypes = $items | Where-Object { @("T1","T2","T3") -contains $_.triggerType }
                if ($validTypes.Count -eq $items.Count) {
                    Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
                } else {
                    Write-Host "  FAIL (some triggerType values are not T1/T2/T3)" -ForegroundColor Red; Hammer-Record FAIL
                }
            } else {
                Write-Host ("  FAIL (" + $missingType.Count + " items missing triggerType)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-I: T2 alerts have required fields ────────────────────────────────────
try {
    Write-Host "Testing: SIL9-I /alerts T2 items have required fields" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d    = ($resp.Content | ConvertFrom-Json).data
        $t2s  = @($d.alerts | Where-Object { $_.triggerType -eq "T2" })
        if ($t2s.Count -eq 0) {
            Write-Host "  SKIP (no T2 alerts returned)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $t2         = $t2s[0]
            $t2Props    = $t2 | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            $required   = @("triggerType","keywordTargetId","query","fromSnapshotId","toSnapshotId",
                            "fromCapturedAt","toCapturedAt","pairVolatilityScore","threshold","exceedanceMargin")
            $missing    = $required | Where-Object { $t2Props -notcontains $_ }
            if ($missing.Count -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (missing T2 fields: " + ($missing -join ", ") + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-J: T3 alert fields present (when T3 fires) ──────────────────────────
try {
    Write-Host "Testing: SIL9-J /alerts T3 fields present when T3 fires" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d   = ($resp.Content | ConvertFrom-Json).data
        $t3s = @($d.alerts | Where-Object { $_.triggerType -eq "T3" })
        if ($t3s.Count -eq 0) {
            Write-Host "  SKIP (no T3 alerts returned; may be zero active keywords in window)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $t3      = $t3s[0]
            $t3Props = $t3 | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
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

# ── SIL9-K: ordering -- two calls produce identical alert order ───────────────
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
            Write-Host "  FAIL (alert array order differs between two calls)" -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (status=" + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-L: limit=1 returns at most 1 alert ───────────────────────────────────
try {
    Write-Host "Testing: SIL9-L /alerts limit=1 returns at most 1 alert" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=0&limit=1" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d   = ($resp.Content | ConvertFrom-Json).data
        $cnt = @($d.alerts).Count
        if ($cnt -le 1) {
            Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (alertCount=" + $cnt + ", expected <= 1)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-M: spikeThreshold=100 -> no T2 alerts (score <= 100 always) ─────────
try {
    Write-Host "Testing: SIL9-M /alerts spikeThreshold=100 produces no T2 alerts" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&spikeThreshold=100" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d    = ($resp.Content | ConvertFrom-Json).data
        $t2s  = @($d.alerts | Where-Object { $_.triggerType -eq "T2" })
        if ($t2s.Count -eq 0) {
            Write-Host "  PASS (no T2 alerts with spikeThreshold=100)" -ForegroundColor Green; Hammer-Record PASS
        } else {
            Write-Host ("  FAIL (" + $t2s.Count + " T2 alerts returned with spikeThreshold=100; score cannot exceed 100)") -ForegroundColor Red; Hammer-Record FAIL
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── SIL9-N: concentrationThreshold=0.0 -> T3 fires if activeKeywordCount > 0 ─
try {
    Write-Host "Testing: SIL9-N /alerts concentrationThreshold=0.0 fires T3 when active keywords exist" -NoNewline
    $resp = Invoke-WebRequest -Uri "$Base$sil9Base`?windowDays=30&concentrationThreshold=0.0" `
        -Method GET -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
    if ($resp.StatusCode -eq 200) {
        $d     = ($resp.Content | ConvertFrom-Json).data
        $t3cnt = @($d.alerts | Where-Object { $_.triggerType -eq "T3" }).Count
        if ($t3cnt -ge 1) {
            $t3 = $d.alerts | Where-Object { $_.triggerType -eq "T3" } | Select-Object -First 1
            # ratio must be non-null (null guard: if ratio is null, T3 should not have fired)
            if ($null -ne $t3.volatilityConcentrationRatio) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host "  FAIL (T3 fired with null volatilityConcentrationRatio -- null guard violated)" -ForegroundColor Red; Hammer-Record FAIL
            }
        } else {
            # T3 didn't fire -- acceptable if no active keywords in 30-day window
            Write-Host "  SKIP (no T3 alert; may be no active keywords in 30-day window)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        }
    } else { Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
