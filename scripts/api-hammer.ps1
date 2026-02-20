# API Hammer Script
# Deterministic smoke + isolation testing for PsyMetric APIs (multi-project aware)
#
# Extended: Promotion idempotency hardening
# - promote once -> 200
# - promote again -> 400
# - snapshot delta = +3 exactly

param(
    [Parameter(Mandatory=$false)]
    [string]$Base = "http://localhost:3000",

    [Parameter(Mandatory=$false)]
    [string]$ProjectId,

    [Parameter(Mandatory=$false)]
    [string]$ProjectSlug
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

function Test-PostEmpty {
    param([string]$Url,[int]$ExpectedStatus,[string]$Description)
    try {
        Write-Host ("Testing: " + $Description) -NoNewline
        $response = Invoke-WebRequest -Uri $Url -Method POST -Headers $Headers -SkipHttpErrorCheck -TimeoutSec 30 -UseBasicParsing
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

function Get-SnapshotCount {
    param([string]$EntityId)
    try {
        $resp = Invoke-RestMethod -Uri "$Base/api/metric-snapshots?entityId=$EntityId&limit=100" -Headers $Headers -TimeoutSec 30
        if ($resp -and $resp.data) {
            return $resp.data.Count
        }
        return 0
    } catch {
        return -1
    }
}

function Create-DraftArtifact {
    param([string]$EntityId)

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
            createdAt = $nowIso
        }
    }

    try {
        $json = $body | ConvertTo-Json -Depth 10 -Compress
        $resp = Invoke-RestMethod -Uri "$Base/api/draft-artifacts" -Method POST -Headers $Headers -Body $json -ContentType "application/json" -TimeoutSec 30
        return $resp.data.id
    } catch {
        return $null
    }
}

Write-Host "=== PROMOTION IDEMPOTENCY TEST ===" -ForegroundColor Yellow

# Get one entity
try {
    $entities = Invoke-RestMethod -Uri "$Base/api/entities?limit=1" -Headers $Headers -TimeoutSec 30
    if (-not $entities.data -or $entities.data.Count -eq 0) {
        Write-Host "No entities found. Skipping." -ForegroundColor DarkYellow
        exit 0
    }
    $entityId = $entities.data[0].id
} catch {
    Write-Host "Failed to fetch entity." -ForegroundColor Red
    exit 1
}

$draftId = Create-DraftArtifact -EntityId $entityId
if (-not $draftId) {
    Write-Host "Failed to create draft." -ForegroundColor Red
    exit 1
}

$before = Get-SnapshotCount -EntityId $entityId

if (Test-PostEmpty "$Base/api/draft-artifacts/$draftId/promote" 200 "Promote once") { $PassCount++ } else { $FailCount++ }
if (Test-PostEmpty "$Base/api/draft-artifacts/$draftId/promote" 400 "Promote again") { $PassCount++ } else { $FailCount++ }

$after = Get-SnapshotCount -EntityId $entityId

if ($before -ge 0 -and $after -ge 0 -and ($after - $before) -eq 3) {
    Write-Host "Testing: Snapshot delta == +3  PASS" -ForegroundColor Green
    $PassCount++
} else {
    Write-Host ("Testing: Snapshot delta == +3  FAIL (delta=" + ($after - $before) + ")") -ForegroundColor Red
    $FailCount++
}

Write-Host ""
Write-Host ("PASS: " + $PassCount) -ForegroundColor Green
Write-Host ("FAIL: " + $FailCount) -ForegroundColor Red

if ($FailCount -eq 0) { exit 0 } else { exit 1 }
