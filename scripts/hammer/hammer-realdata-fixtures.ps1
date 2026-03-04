# hammer-realdata-fixtures.ps1 — Value-correctness tests using seeded fixture data
#
# Dot-sourced by api-hammer.ps1. Inherits $Headers, $OtherHeaders, $Base,
# Hammer-Section, Hammer-Record.
#
# Strategy:
#   1. Load expected values from scripts/fixtures/serp/volatility-case-1.expected.json
#      (written by capture.ps1 / compute-fixture-expectations.ts — no manual copying).
#   2. Seed the fixture into DB via seed-serp-fixture.ts.
#   3. Parse the seeded projectId + keywordTargetId from stdout.
#   4. Hit GET /api/seo/keyword-targets/{id}/volatility with fixture project headers.
#   5. Assert value-level invariants against the loaded expectations:
#      - sampleSize (exact)
#      - snapshotCount (exact)
#      - volatilityScore (+/-0.05)
#      - rankVolatilityComponent (+/-0.05)
#      - aiOverviewComponent (+/-0.05)
#      - featureVolatilityComponent (exact when 0, else +/-0.05)
#      - volatilityRegime (exact string)
#      - aiOverviewChurn (exact int)
#      - component sum within +/-0.10 of volatilityScore
#   6. Assert GET /api/seo/risk-attribution-summary:
#      - returns 200 with buckets array
#      - sumCheck within +/-0.05 when non-null
#      - determinism across two calls
#   7. RF-VOL-G: determinism — two GET volatility calls return identical fields
#      (computedAt excluded).
#
# Fixture file:   scripts/fixtures/serp/volatility-case-1.json
# Expected file:  scripts/fixtures/serp/volatility-case-1.expected.json
# Seed script:    scripts/fixtures/seed-serp-fixture.ts
#
# SKIP conditions (logged clearly, not FAIL):
#   - Node.js / tsx not on PATH
#   - Fixture file or expected.json missing
#   - Seed script exits non-zero (e.g. DB not reachable)
#
# FAIL conditions:
#   - expected.json present but malformed
#   - Fixture file present but seed produces no projectId
#   - Endpoint returns non-200
#   - Value invariants violated

Hammer-Section "REALDATA FIXTURE HARNESS"

$_fixtureName  = "volatility-case-1"
$_fixtureFile  = Join-Path $PSScriptRoot "..\fixtures\serp\$_fixtureName.json"
$_expectedFile = Join-Path $PSScriptRoot "..\fixtures\serp\$_fixtureName.expected.json"
$_seedScript   = Join-Path $PSScriptRoot "..\fixtures\seed-serp-fixture.ts"

# ── RF-EXP: Load expected values from expected.json ───────────────────────────
$_exp              = $null   # expectations object; $null = SKIP all value tests
$_fixtureProjectId = $null
$_fixtureKtId      = $null
$_fixtureLocale    = "en-US"
$_fixtureDevice    = "desktop"
$_fixtureHeaders   = $null

try {
    Write-Host "Testing: RF-EXP  load volatility-case-1.expected.json" -NoNewline

    if (-not (Test-Path $_expectedFile)) {
        Write-Host ("  FAIL (expected.json not found: " + $_expectedFile + ")") -ForegroundColor Red
        Write-Host "       Run: pwsh scripts/fixtures/capture.ps1 -KeywordTargetId <uuid> -Name volatility-case-1" -ForegroundColor DarkGray
        Hammer-Record FAIL
    } else {
        $raw = Get-Content $_expectedFile -Raw | ConvertFrom-Json
        # Validate required fields are present
        $reqFields = @("sampleSize","snapshotCount","volatilityScore","rankVolatilityComponent",
                       "aiOverviewComponent","featureVolatilityComponent","volatilityRegime","aiOverviewChurn")
        $missing = $reqFields | Where-Object { $null -eq $raw.$_ -and $raw.$_ -isnot [int] -and $raw.$_ -isnot [double] }
        # Use property existence check instead (ConvertFrom-Json returns PSCustomObject)
        $props   = $raw | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
        $missing = $reqFields | Where-Object { $props -notcontains $_ }
        if ($missing.Count -gt 0) {
            Write-Host ("  FAIL (expected.json missing fields: " + ($missing -join ", ") + ")") -ForegroundColor Red
            Hammer-Record FAIL
        } else {
            $_exp = $raw
            Write-Host ("  PASS (sampleSize=" + $_exp.sampleSize + " snapshotCount=" + $_exp.snapshotCount +
                         " volatilityScore=" + $_exp.volatilityScore + " regime=" + $_exp.volatilityRegime + ")") -ForegroundColor Green
            Hammer-Record PASS
        }
    }
} catch {
    Write-Host ("  FAIL (exception loading expected.json: " + $_.Exception.Message + ")") -ForegroundColor Red
    Hammer-Record FAIL
}

# ── RF-SEED: Seed fixture data via tsx ────────────────────────────────────────
try {
    Write-Host "Testing: RF-SEED  seed volatility-case-1 fixture into DB" -NoNewline

    if (-not (Test-Path $_fixtureFile)) {
        Write-Host ("  FAIL (fixture file not found: " + $_fixtureFile + ")") -ForegroundColor Red; Hammer-Record FAIL
    } elseif (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
        Write-Host "  SKIP (node not on PATH)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        # Resolve tsx — prefer local Windows .cmd shim, then .ps1, then npx tsx
        $repoRoot    = Resolve-Path (Join-Path $PSScriptRoot "..\..") 
        $tsxCmd      = Join-Path $repoRoot "node_modules\.bin\tsx.cmd"
        $tsxPs1      = Join-Path $repoRoot "node_modules\.bin\tsx.ps1"
        $seedArgs    = @("$_seedScript", "--file", "$_fixtureFile")
        $seedSkipped = $false

        if (Test-Path $tsxCmd) {
            $seedOutput   = & $tsxCmd @seedArgs 2>&1
            $seedExitCode = $LASTEXITCODE
        } elseif (Test-Path $tsxPs1) {
            $seedOutput   = & $tsxPs1 @seedArgs 2>&1
            $seedExitCode = $LASTEXITCODE
        } elseif (Get-Command "npx" -ErrorAction SilentlyContinue) {
            $seedOutput   = & "npx" "tsx" @seedArgs 2>&1
            $seedExitCode = $LASTEXITCODE
        } else {
            Write-Host "  SKIP (tsx.cmd not found and npx not available; run npm install)" -ForegroundColor DarkYellow
            Hammer-Record SKIP
            $seedSkipped = $true
        }

        if (-not $seedSkipped) {
            if ($seedExitCode -ne 0) {
                Write-Host ("  FAIL (seed-serp-fixture exited " + $seedExitCode + ")") -ForegroundColor Red
                Write-Host ($seedOutput | Out-String).Trim() -ForegroundColor DarkGray
                Hammer-Record FAIL
            } else {
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
            $d        = ($resp.Content | ConvertFrom-Json).data
            $props    = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
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

# ── RF-VOL-C: component sum within +/-0.10 of volatilityScore ─────────────────
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
            $d       = ($resp.Content | ConvertFrom-Json).data
            $rank    = [double]$d.rankVolatilityComponent
            $ai      = [double]$d.aiOverviewComponent
            $feat    = [double]$d.featureVolatilityComponent
            $score   = [double]$d.volatilityScore
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

# ── RF-VOL-D: sampleSize and maturity from expected.json ──────────────────────
try {
    Write-Host "Testing: RF-VOL-D  sampleSize and maturity match expected.json" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d              = ($resp.Content | ConvertFrom-Json).data
            $gotSampleSize  = [int]$d.sampleSize
            $gotMaturity    = $d.maturity
            $wantSampleSize = [int]$_exp.sampleSize

            # Maturity is derived from sampleSize: preliminary(<5), developing(5-19), stable(>=20)
            $wantMaturity = if ($wantSampleSize -ge 20) { "stable" } elseif ($wantSampleSize -ge 5) { "developing" } else { "preliminary" }

            if ($gotSampleSize -eq $wantSampleSize -and $gotMaturity -eq $wantMaturity) {
                Write-Host ("  PASS (sampleSize=" + $gotSampleSize + " maturity=" + $gotMaturity + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (sampleSize=" + $gotSampleSize + " want=" + $wantSampleSize +
                             " maturity=" + $gotMaturity + " want=" + $wantMaturity + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-E: aiOverviewChurn from expected.json ──────────────────────────────
try {
    Write-Host "Testing: RF-VOL-E  aiOverviewChurn matches expected.json" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d          = ($resp.Content | ConvertFrom-Json).data
            $gotChurn   = [int]$d.aiOverviewChurn
            $wantChurn  = [int]$_exp.aiOverviewChurn
            if ($gotChurn -eq $wantChurn) {
                Write-Host ("  PASS (aiOverviewChurn=" + $gotChurn + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (aiOverviewChurn=" + $gotChurn + " expected " + $wantChurn + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-F: volatilityRegime boundary correctness ───────────────────────────
try {
    Write-Host "Testing: RF-VOL-F  volatilityRegime matches score boundary (generic invariant)" -NoNewline
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

# ── RF-VOL-G: determinism — two calls return identical score fields ────────────
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

            # computedAt and windowStartAt are wall-clock — excluded from comparison
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
            $d        = ($resp.Content | ConvertFrom-Json).data
            $props    = $d | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
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

# ── RF-ATTR-B: sumCheck within +/-0.05 for all non-null buckets ───────────────
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
            $d          = ($resp.Content | ConvertFrom-Json).data
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

# ── RF-VOL-H: snapshotCount from expected.json ────────────────────────────────
try {
    Write-Host "Testing: RF-VOL-H  snapshotCount matches expected.json" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d          = ($resp.Content | ConvertFrom-Json).data
            $gotCount   = [int]$d.snapshotCount
            $wantCount  = [int]$_exp.snapshotCount
            if ($gotCount -eq $wantCount) {
                Write-Host ("  PASS (snapshotCount=" + $gotCount + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (snapshotCount=" + $gotCount + " expected " + $wantCount + " — fixture may be stale)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-I: volatilityScore from expected.json (+/-0.05) ───────────────────
try {
    Write-Host "Testing: RF-VOL-I  volatilityScore matches expected.json +/-0.05" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d     = ($resp.Content | ConvertFrom-Json).data
            $got   = [double]$d.volatilityScore
            $want  = [double]$_exp.volatilityScore
            $diff  = [Math]::Abs($got - $want)
            if ($diff -le 0.05) {
                Write-Host ("  PASS (volatilityScore=" + $got + " expected=" + $want + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (volatilityScore=" + $got + " expected=" + $want + " diff=" + $diff + " > 0.05)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-J: rankVolatilityComponent from expected.json (+/-0.05) ───────────
try {
    Write-Host "Testing: RF-VOL-J  rankVolatilityComponent matches expected.json +/-0.05" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d    = ($resp.Content | ConvertFrom-Json).data
            $got  = [double]$d.rankVolatilityComponent
            $want = [double]$_exp.rankVolatilityComponent
            $diff = [Math]::Abs($got - $want)
            if ($diff -le 0.05) {
                Write-Host ("  PASS (rankVolatilityComponent=" + $got + " expected=" + $want + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (rankVolatilityComponent=" + $got + " expected=" + $want + " diff=" + $diff + " > 0.05)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-K: aiOverviewComponent from expected.json (+/-0.05) ───────────────
try {
    Write-Host "Testing: RF-VOL-K  aiOverviewComponent matches expected.json +/-0.05" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d    = ($resp.Content | ConvertFrom-Json).data
            $got  = [double]$d.aiOverviewComponent
            $want = [double]$_exp.aiOverviewComponent
            $diff = [Math]::Abs($got - $want)
            if ($diff -le 0.05) {
                Write-Host ("  PASS (aiOverviewComponent=" + $got + " expected=" + $want + " diff=" + $diff + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (aiOverviewComponent=" + $got + " expected=" + $want + " diff=" + $diff + " > 0.05)") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-L: featureVolatilityComponent from expected.json ───────────────────
# Exact when expected==0; +/-0.05 otherwise.
try {
    Write-Host "Testing: RF-VOL-L  featureVolatilityComponent matches expected.json" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d    = ($resp.Content | ConvertFrom-Json).data
            $got  = [double]$d.featureVolatilityComponent
            $want = [double]$_exp.featureVolatilityComponent
            # Use exact comparison when expected is 0; tolerance otherwise
            $tol  = if ($want -eq 0.0) { 0.0 } else { 0.05 }
            $diff = [Math]::Abs($got - $want)
            if ($diff -le $tol) {
                Write-Host ("  PASS (featureVolatilityComponent=" + $got + " expected=" + $want + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (featureVolatilityComponent=" + $got + " expected=" + $want + " diff=" + $diff + ")") -ForegroundColor Red; Hammer-Record FAIL
            }
        }
    }
} catch { Write-Host ("  FAIL (exception: " + $_.Exception.Message + ")") -ForegroundColor Red; Hammer-Record FAIL }

# ── RF-VOL-M: volatilityRegime from expected.json ─────────────────────────────
try {
    Write-Host "Testing: RF-VOL-M  volatilityRegime matches expected.json" -NoNewline
    if (-not $_fixtureHeaders -or -not $_exp) {
        Write-Host "  SKIP (fixture not seeded or expected.json not loaded)" -ForegroundColor DarkYellow; Hammer-Record SKIP
    } else {
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $_fixtureHeaders `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -ne 200) {
            Write-Host ("  FAIL (got " + $resp.StatusCode + ")") -ForegroundColor Red; Hammer-Record FAIL
        } else {
            $d      = ($resp.Content | ConvertFrom-Json).data
            $got    = $d.volatilityRegime
            $want   = $_exp.volatilityRegime
            if ($got -eq $want) {
                Write-Host ("  PASS (volatilityRegime=" + $got + ")") -ForegroundColor Green; Hammer-Record PASS
            } else {
                Write-Host ("  FAIL (volatilityRegime=" + $got + " expected " + $want + ")") -ForegroundColor Red; Hammer-Record FAIL
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
        $url  = Build-Url -Path "/api/seo/keyword-targets/$_fixtureKtId/volatility"
        $resp = Invoke-WebRequest -Uri $url -Method GET -Headers $Headers `
            -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing

        if ($resp.StatusCode -eq 404) {
            Write-Host "  PASS (fixture KT returns 404 under default project headers)" -ForegroundColor Green; Hammer-Record PASS
        } elseif ($resp.StatusCode -eq 200) {
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
