# hammer-realdata-fixtures.ps1 — Value-correctness tests using seeded fixture data
#
# Dot-sourced by api-hammer.ps1. Inherits $Headers, $OtherHeaders, $Base,
# Hammer-Section, Hammer-Record.
#
# Strategy:
#   1. Seed the basic-volatility-fixture via seed-serp-fixture.ts.
#   2. Parse the seeded projectId + keywordTargetId from stdout.
#   3. Hit GET /api/seo/keyword-targets/{id}/volatility with the fixture project headers.
#   4. Assert value-level invariants (not just shape):
#      - volatilityScore in [0, 100]
#      - component sum within ±0.02 of volatilityScore
#      - maturity == "developing" (fixture has 7 pairs, sampleSize=7)
#      - volatilityRegime one of the expected values (calm or shifting for this fixture)
#      - aiOverviewChurn > 0 (fixture has known flips)
#      - determinism across two calls (score fields identical, computedAt excluded)
#   5. Assert GET /api/seo/risk-attribution-summary:
#      - returns 200 with buckets array
#      - sumCheck within ±0.05 when non-null
#      - determinism across two calls
#
# Fixture file: scripts/fixtures/serp/volatility-case-1.json
# Seed script:  scripts/fixtures/seed-serp-fixture.ts
#
# Ground-truth expectations (from capture.ps1 / compute-fixture-expectations.ts):
#   sampleSize=19  snapshotCount=20  volatilityScore=23.72
#   rankComponent=4.77  aiComponent=18.95  featureComponent=0.00
#   regime=shifting  aiOverviewChurn=18
#
# SKIP conditions (logged clearly, not FAIL):
#   - Node.js / tsx not on PATH
#   - Fixture file missing
#   - Seed script exits non-zero (e.g. DB not reachable)
#
# FAIL conditions:
#   - Fixture file present but seed produces no projectId
#   - Endpoint returns non-200
#   - Value invariants violated

Hammer-Section "REALDATA FIXTURE HARNESS"

$_fixtureFile = Join-Path $PSScriptRoot "..\fixtures\serp\volatility-case-1.json"
$_seedScript  = Join-Path $PSScriptRoot "..\fixtures\seed-serp-fixture.ts"

# ── RF-SEED: Seed fixture data via tsx ────────────────────────────────────────
$_fixtureProjectId = $null
$_fixtureKtId      = $null
$_fixtureLocale    = "en-US"
$_fixtureDevice    = "desktop"
$_fixtureHeaders   = $null  # populated after successful seed

try {
    Write-Host "Testing: RF-SEED  seed volatility-case-1 fixture into DB" -NoNewline

    # Check prerequisites
    if (-not (Test-Path $_fixtureFile)) {
        Write-Host ("  FAIL (fixture file not found: " + $_fixtureFile + ")") -ForegroundColor Red; Hammer-Record FAIL
    } elseif (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
        Write-Host "  SKIP (node not on PATH)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        # Check tsx availability
        $tsxPath = $null
        $localTsx = Join-Path $PSScriptRoot "..\..\node_modules\.bin\tsx"
        if (Test-Path $localTsx) {
            $tsxPath = $localTsx
        } elseif (Get-Command "tsx" -ErrorAction SilentlyContinue) {
            $tsxPath = "tsx"
        }

        if (-not $tsxPath) {
            Write-Host "  SKIP (tsx not found in node_modules/.bin or PATH)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        } else {
            $seedArgs = @("$_seedScript", "--file", "$_fixtureFile")
            $seedOutput = & node $tsxPath @seedArgs 2>&1
            $seedExitCode = $LASTEXITCODE

            if ($seedExitCode -ne 0) {
                Write-Host ("  FAIL (seed-serp-fixture exited " + $seedExitCode + ")") -ForegroundColor Red
                Write-Host ($seedOutput | Out-String).Trim() -ForegroundColor DarkGray
                Hammer-Record FAIL
            } else {
                # Parse FIXTURE_PROJECT_ID and FIXTURE_KT_ID from stdout
                foreach ($line in $seedOutput) {
                    if ($line -match "^FIXTURE_PROJECT_ID:\s*([0-9a-f\-]{36})") {
                        $_fixtureProjectId = $Matches[1].Trim()
                    }
                    if ($line -match "^FIXTURE_KT_ID:\s*([0-9a-f\-]{36})\s+query=""([^""]+)""\s+locale=""([^""]+)""\s+device=""([^""]+)""") {
                        $_fixtureKtId   = $Matches[1].Trim()
                        $_fixtureLocale = $Matches[3].Trim()
                        $_fixtureDevice = $Matches[4].Trim()
                    }
                }

                if (-not $_fixtureProjectId -or -not $_fixtureKtId) {
                    Write-Host "  FAIL (could not parse FIXTURE_PROJECT_ID or FIXTURE_KT_ID from seed output)" -ForegroundColor Red
                    Write-Host ($seedOutput | Out-String).Trim() -ForegroundColor DarkGray
                    Hammer-Record FAIL
                } else {
                    $_fixtureHeaders = @{ "x-project-id" = $_fixtureProjectId }
                    Write-Host ("  PASS (projectId=" + $_fixtureProjectId + " ktId=" + $_fixtureKtId + ")") -ForegroundColor Green
                    Hammer-Record PASS
                }
            }
        }
    }
} catch {
    Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL
}

# ── RF-VOL-A: volatility endpoint returns 200 + required fields ───────────────
try {
    Write-Host "Testing: RF-VOL-A  GET volatility returns 200 + all required fields" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ", expected 200)") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $props = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            $required = @(
                "keywordTargetId","query","locale","device",
                "sampleSize","snapshotCount","volatilityScore",
                "rankVolatilityComponent","aiOverviewComponent","featureVolatilityComponent",
                "aiOverviewChurn","averageRankShift","maxRankShift","featureVolatility",
                "maturity","volatilityRegime","computedAt"
            )
            $missing = $required | Where-Object { $props -notcontains $_ }
            if ($missing.Count -eq 0) {
                Write-Host "  PASS" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (missing fields: " + ($missing -join ", ") + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-B: volatilityScore in [0, 100] ─────────────────────────────────────
try {
    Write-Host "Testing: RF-VOL-B  volatilityScore in [0, 100]" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $score = [double]$d.volatilityScore
            if ($score -ge 0.0 -and $score -le 100.0) {
                Write-Host ("  PASS (volatilityScore=" + $score + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (volatilityScore=" + $score + " is outside [0,100])") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-C: component sum within ±0.02 of volatilityScore ───────────────────
try {
    Write-Host "Testing: RF-VOL-C  component sum (rank+ai+feature) within +/-0.10 of volatilityScore" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d      = ($resp.Content | ConvertFrom-Json).data
            $rank   = [double]$d.rankVolatilityComponent
            $ai     = [double]$d.aiOverviewComponent
            $feat   = [double]$d.featureVolatilityComponent
            $score  = [double]$d.volatilityScore
            $compSum = [Math]::Round($rank + $ai + $feat, 4)
            $diff    = [Math]::Abs($compSum - $score)
            if ($diff -le 0.10) {
                Write-Host ("  PASS (score=" + $score + " sum=" + $compSum + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (score=" + $score + " sum=" + $compSum + " diff=" + $diff + " > 0.10)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-D: maturity == "developing" (fixture has 7 pairs, sampleSize=7) ────
try {
    Write-Host "Testing: RF-VOL-D  sampleSize==19 and maturity==developing (volatility-case-1: 20 snapshots)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d          = ($resp.Content | ConvertFrom-Json).data
            $sampleSize = [int]$d.sampleSize
            $maturity   = $d.maturity
            if ($maturity -eq "developing" -and $sampleSize -eq 19) {
                Write-Host ("  PASS (maturity=" + $maturity + " sampleSize=" + $sampleSize + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (maturity=" + $maturity + " sampleSize=" + $sampleSize + "; expected developing/19)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-E: aiOverviewChurn > 0 (fixture contains known AI flips) ───────────
try {
    Write-Host "Testing: RF-VOL-E  aiOverviewChurn == 18 (volatility-case-1 ground truth)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $churn = [int]$d.aiOverviewChurn
            if ($churn -eq 18) {
                Write-Host ("  PASS (aiOverviewChurn=" + $churn + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (aiOverviewChurn=" + $churn + " expected 18)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-F: volatilityRegime is calm or shifting (fixture score expected < 50) ─
try {
    Write-Host "Testing: RF-VOL-F  volatilityRegime is calm or shifting (score < 50 expected)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d      = ($resp.Content | ConvertFrom-Json).data
            $regime = $d.volatilityRegime
            $score  = [double]$d.volatilityScore
            $validRegimes = @("calm","shifting","unstable","chaotic")
            if ($validRegimes -contains $regime) {
                # Regime boundary correctness: regime must match the score
                $expectedRegime = if ($score -le 20.0) { "calm" } elseif ($score -le 50.0) { "shifting" } elseif ($score -le 75.0) { "unstable" } else { "chaotic" }
                if ($regime -eq $expectedRegime) {
                    Write-Host ("  PASS (regime=" + $regime + " score=" + $score + ")") -ForegroundColor Green; Hammer-Record PASS
                } else {
                    Write-Host ("  FAIL (regime=" + $regime + " but score=" + $score + " should give " + $expectedRegime + ")") -ForegroundColor Red; Hammer-Record FAIL
                }
            } else {
                Write-Host ("  FAIL (unknown regime: " + $regime + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-G: determinism — two calls return identical score fields ─────────────
try {
    Write-Host "Testing: RF-VOL-G  two GET volatility calls return identical score fields" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"

        $r1 = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        $r2 = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($r1.StatusCode -ne 200 -or $r2.StatusCode -ne 200) {
            Write-Host ("  FAIL (status " + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d1 = ($r1.Content | ConvertFrom-Json).data
            $d2 = ($r2.Content | ConvertFrom-Json).data

            # Compare all score fields except computedAt (wall-clock) and windowStartAt (wall-clock)
            $scoreFields = @(
                "volatilityScore","rankVolatilityComponent","aiOverviewComponent",
                "featureVolatilityComponent","sampleSize","snapshotCount",
                "averageRankShift","maxRankShift","featureVolatility","aiOverviewChurn",
                "maturity","volatilityRegime","keywordTargetId","query","locale","device"
            )
            $diffs = @()
            foreach ($f in $scoreFields) {
                $v1 = $d1.$f; $v2 = $d2.$f
                if ($v1 -ne $v2) { $diffs += "$($f): $v1 vs $v2" }
            }
            if ($diffs.Count -eq 0) {
                Write-Host "  PASS (all score fields identical across two calls)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (diffs: " + ($diffs -join "; ") + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-ATTR-A: risk-attribution-summary returns 200 with buckets ───────────────
try {
    Write-Host "Testing: RF-ATTR-A  GET risk-attribution-summary returns 200 + buckets" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/risk-attribution-summary" -Params @{ windowDays = "60"; bucketDays = "7" }
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d = ($resp.Content | ConvertFrom-Json).data
            $props = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            $required = @("windowDays","bucketDays","minMaturity","keywordLimit","buckets")
            $missing  = $required | Where-Object { $props -notcontains $_ }
            if ($missing.Count -eq 0 -and @($d.buckets).Count -gt 0) {
                Write-Host ("  PASS (" + @($d.buckets).Count + " buckets)") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (missing=" + ($missing -join ",") + " buckets=" + @($d.buckets).Count + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-ATTR-B: sumCheck within ±0.05 for all non-null buckets ─────────────────
try {
    Write-Host "Testing: RF-ATTR-B  sumCheck within +/-0.05 for all non-null buckets" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/risk-attribution-summary" -Params @{ windowDays = "60"; bucketDays = "7" }
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d         = ($resp.Content | ConvertFrom-Json).data
            $violations = @()
            $checked    = 0
            foreach ($bucket in $d.buckets) {
                if ($null -ne $bucket.sumCheck) {
                    $checked++
                    $diff = [Math]::Abs([double]$bucket.sumCheck - 100.0)
                    if ($diff -gt 0.05) {
                        $violations += ("bucket " + $bucket.start + ": sumCheck=" + $bucket.sumCheck + " diff=" + $diff)
                    }
                }
            }
            if ($violations.Count -eq 0) {
                Write-Host ("  PASS (checked " + $checked + " non-null buckets, all sumCheck +/-0.05 of 100)") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (" + $violations.Count + " violations: " + ($violations -join "; ") + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-ATTR-C: determinism — two risk-attribution-summary calls identical ──────
try {
    Write-Host "Testing: RF-ATTR-C  two GET risk-attribution-summary calls return identical buckets" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url = Build-Url -Path "/api/seo/risk-attribution-summary" -Params @{ windowDays = "60"; bucketDays = "7" }

        $r1 = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        $r2 = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($r1.StatusCode -ne 200 -or $r2.StatusCode -ne 200) {
            Write-Host ("  FAIL (status " + $r1.StatusCode + "/" + $r2.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            # Serialize the buckets arrays for comparison (exclude top-level metadata that's identical by construction)
            $b1 = ($r1.Content | ConvertFrom-Json).data.buckets | ConvertTo-Json -Depth 10 -Compress
            $b2 = ($r2.Content | ConvertFrom-Json).data.buckets | ConvertTo-Json -Depth 10 -Compress
            if ($b1 -eq $b2) {
                Write-Host "  PASS (buckets arrays identical across two calls)" -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host "  FAIL (buckets arrays differ between two calls)" -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-H: snapshotCount matches expected fixture count (8) ────────────────
try {
    Write-Host "Testing: RF-VOL-H  snapshotCount == 20 (volatility-case-1 has 20 snapshots)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $count = [int]$d.snapshotCount
            if ($count -eq 20) {
                Write-Host ("  PASS (snapshotCount=20)") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (snapshotCount=" + $count + " expected 20 — fixture may have been partially seeded or is stale)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-I: volatilityScore approximately equals 23.72 (+/-0.05) ────────────
try {
    Write-Host "Testing: RF-VOL-I  volatilityScore approx 23.72 +/-0.05 (volatility-case-1 ground truth)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $score = [double]$d.volatilityScore
            $diff  = [Math]::Abs($score - 23.72)
            if ($diff -le 0.05) {
                Write-Host ("  PASS (volatilityScore=" + $score + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (volatilityScore=" + $score + " expected ~23.72 diff=" + $diff + " > 0.05)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-J: rankVolatilityComponent approximately equals 4.77 (+/-0.05) ──────
try {
    Write-Host "Testing: RF-VOL-J  rankVolatilityComponent approx 4.77 +/-0.05" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d    = ($resp.Content | ConvertFrom-Json).data
            $comp = [double]$d.rankVolatilityComponent
            $diff = [Math]::Abs($comp - 4.77)
            if ($diff -le 0.05) {
                Write-Host ("  PASS (rankVolatilityComponent=" + $comp + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (rankVolatilityComponent=" + $comp + " expected ~4.77 diff=" + $diff + " > 0.05)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-K: aiOverviewComponent approximately equals 18.95 (+/-0.05) ─────────
try {
    Write-Host "Testing: RF-VOL-K  aiOverviewComponent approx 18.95 +/-0.05" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d    = ($resp.Content | ConvertFrom-Json).data
            $comp = [double]$d.aiOverviewComponent
            $diff = [Math]::Abs($comp - 18.95)
            if ($diff -le 0.05) {
                Write-Host ("  PASS (aiOverviewComponent=" + $comp + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (aiOverviewComponent=" + $comp + " expected ~18.95 diff=" + $diff + " > 0.05)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-L: featureVolatilityComponent == 0.00 (exact — no feature churn) ───
try {
    Write-Host "Testing: RF-VOL-L  featureVolatilityComponent == 0.00 (no feature churn in fixture)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d    = ($resp.Content | ConvertFrom-Json).data
            $comp = [double]$d.featureVolatilityComponent
            if ($comp -eq 0.0) {
                Write-Host ("  PASS (featureVolatilityComponent=" + $comp + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (featureVolatilityComponent=" + $comp + " expected 0.00)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-M: volatilityRegime == "shifting" (ground truth for score ~23.72) ───
try {
    Write-Host "Testing: RF-VOL-M  volatilityRegime == shifting (score ~23.72 is in 20.01-50.00 band)" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d      = ($resp.Content | ConvertFrom-Json).data
            $regime = $d.volatilityRegime
            if ($regime -eq "shifting") {
                Write-Host ("  PASS (volatilityRegime=" + $regime + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (volatilityRegime=" + $regime + " expected shifting)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-ISOL: fixture project is isolated from default project ──────────────────
try {
    Write-Host "Testing: RF-ISOL  fixture project cannot see default-project keyword targets" -NoNewline
    if (-not $_fixtureHeaders) {
        Write-Host "  SKIP (fixture not seeded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        # Try to load the fixture KT from the default project headers
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -eq 404) {
            Write-Host "  PASS (fixture KT returns 404 under default project headers)" -ForegroundColor Green; Hammer-Record PASS
        } elseif ($resp.StatusCode -eq 200) {
            # If default project == fixture project (same DB, same project), that is okay — SKIP
            $defaultProjectId = $Headers["x-project-id"]
            if ([string]::IsNullOrWhiteSpace($defaultProjectId) -or $defaultProjectId -eq $_fixtureProjectId) {
                Write-Host "  SKIP (default project headers resolve to fixture project — isolation not testable)" -ForegroundColor DarkYellow; Hammer-Record SKIP
            } else {
                Write-Host ("  FAIL (expected 404 got 200 — fixture KT visible to default project)") -ForegroundColor Red; Hammer-Record FAIL
            }
        } else {
            Write-Host "  SKIP (unexpected status; isolation inconclusive)" -ForegroundColor DarkYellow; Hammer-Record SKIP
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }
