/**
 * compute-fixture-expectations.ts — Compute expected volatility values from a fixture file.
 *
 * Usage:
 *   npx tsx scripts/fixtures/compute-fixture-expectations.ts \
 *     --file scripts/fixtures/serp/<name>.json
 *
 * Input:  fixture JSON produced by export-serp-fixture.ts
 * Output: printed assertion values for hammer tests (no DB access, no writes)
 *
 * Uses the canonical computeVolatility() and classifyRegime() from
 * src/lib/seo/volatility-service.ts — the same functions used by the live
 * volatility endpoint. Output is therefore identical to what the API returns.
 *
 * Printed format:
 *   Expected assertions:
 *   sampleSize=7 snapshotCount=8 volatilityScore=43.25 rankComponent=22.10 \
 *   aiComponent=18.40 featureComponent=2.75 regime=shifting aiOverviewChurn=2
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeVolatility,
  classifyRegime,
  type SnapshotForVolatility,
} from "../../src/lib/seo/volatility-service.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixture shape (flat — matches export-serp-fixture.ts output)
// ─────────────────────────────────────────────────────────────────────────────

interface FixtureSnapshot {
  capturedAt: string;
  rawPayload: unknown;
  aiOverviewStatus: string;
  aiOverviewText: string | null;
  source?: string;
}

interface FixtureFile {
  query: string;
  locale: string;
  device: string;
  snapshots: FixtureSnapshot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

type Args = { file: string };

function parseArgs(argv: string[]): Args {
  let file: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) throw new Error("--file requires a value");
      file = v;
      i++;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (!file) throw new Error("--file is required");
  return { file };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv);

  const absFile = path.resolve(args.file);
  if (!fs.existsSync(absFile)) {
    throw new Error(`Fixture file not found: ${absFile}`);
  }

  let fixture: FixtureFile;
  try {
    fixture = JSON.parse(fs.readFileSync(absFile, "utf-8")) as FixtureFile;
  } catch (e) {
    throw new Error(
      `Failed to parse fixture JSON: ${e instanceof Error ? e.message : e}`
    );
  }

  if (!Array.isArray(fixture.snapshots) || fixture.snapshots.length === 0) {
    throw new Error("Fixture has no snapshots");
  }

  // Build SnapshotForVolatility array — supply a stable synthetic id derived
  // from capturedAt since the fixture JSON does not store DB ids.
  const snapshotsForVolatility: SnapshotForVolatility[] = fixture.snapshots.map(
    (s, idx) => ({
      id: `fixture-snap-${idx}`,
      capturedAt: new Date(s.capturedAt),
      aiOverviewStatus: s.aiOverviewStatus,
      rawPayload: s.rawPayload,
    })
  );

  // Enforce deterministic ordering (fixture should already be sorted, but verify)
  snapshotsForVolatility.sort((a, b) => {
    const t = a.capturedAt.getTime() - b.capturedAt.getTime();
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });

  const profile = computeVolatility(snapshotsForVolatility);
  const regime = classifyRegime(profile.volatilityScore);
  const snapshotCount = fixture.snapshots.length;

  console.log("Expected assertions:");
  console.log(
    `sampleSize=${profile.sampleSize}` +
      ` snapshotCount=${snapshotCount}` +
      ` volatilityScore=${profile.volatilityScore}` +
      ` rankComponent=${profile.rankVolatilityComponent}` +
      ` aiComponent=${profile.aiOverviewComponent}` +
      ` featureComponent=${profile.featureVolatilityComponent}` +
      ` regime=${regime}` +
      ` aiOverviewChurn=${profile.aiOverviewChurn}`
  );
}

try {
  main();
} catch (err) {
  console.error(
    "compute-fixture-expectations failed:",
    err instanceof Error ? err.message : err
  );
  process.exit(1);
}
