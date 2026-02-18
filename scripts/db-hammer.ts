/**
 * PsyMetric DB Hammer
 *
 * Deterministic seed + invariant verification + cleanup for multi-project isolation.
 *
 * Safety goals:
 * - Never run against production by accident.
 * - All writes bounded to explicit test Project IDs.
 * - Deterministic IDs and content when using --seed.
 *
 * Usage examples:
 *   # Full run (create projects, seed, checks, cleanup)
 *   npx tsx scripts/db-hammer.ts --seed 12345 --all --cleanup
 *
 *   # Explicit project IDs
 *   npx tsx scripts/db-hammer.ts --projectA <uuid> --projectB <uuid> --all --cleanup
 *
 * Flags:
 *   --base <url>               (ignored; kept for parity with api-hammer)
 *   --seed <number>            Deterministic seed (default: 12345)
 *   --projectA <uuid>          Explicit Project A ID
 *   --projectB <uuid>          Explicit Project B ID
 *   --create-projects          Create projects (if they don't exist)
 *   --seed-data                Seed baseline graph
 *   --run-checks               Run isolation + uniqueness + event invariants checks
 *   --cleanup                  Delete seeded projects + all dependent rows
 *   --all                      Equivalent to --create-projects --seed-data --run-checks
 *   --remote-ok                Allow non-local DATABASE_URL (still blocks obvious prod signals)
 *   --i-understand             Extra safety acknowledgement required for remote DB
 */

import {
  PrismaClient,
  Prisma,
  ContentEntityType,
  EntityType,
  RelationType,
  EventType,
  ActorType,
  Platform,
  SourceType,
  SourceItemStatus,
  CapturedBy,
  MetricType,
  ClaimType,
} from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

type Args = {
  seed: number;
  projectA?: string;
  projectB?: string;
  createProjects: boolean;
  seedData: boolean;
  runChecks: boolean;
  cleanup: boolean;
  remoteOk: boolean;
  iUnderstand: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seed: 12345,
    createProjects: false,
    seedData: false,
    runChecks: false,
    cleanup: false,
    remoteOk: false,
    iUnderstand: false,
  };

  const next = (i: number) => {
    const v = argv[i + 1];
    if (!v) throw new Error(`Missing value for ${argv[i]}`);
    return v;
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--seed": {
        const v = Number(next(i));
        if (!Number.isFinite(v) || !Number.isInteger(v)) {
          throw new Error("--seed must be an integer");
        }
        args.seed = v;
        i++;
        break;
      }
      case "--projectA":
        args.projectA = next(i);
        i++;
        break;
      case "--projectB":
        args.projectB = next(i);
        i++;
        break;
      case "--create-projects":
        args.createProjects = true;
        break;
      case "--seed-data":
        args.seedData = true;
        break;
      case "--run-checks":
        args.runChecks = true;
        break;
      case "--cleanup":
        args.cleanup = true;
        break;
      case "--all":
        args.createProjects = true;
        args.seedData = true;
        args.runChecks = true;
        break;
      case "--remote-ok":
        args.remoteOk = true;
        break;
      case "--i-understand":
        args.iUnderstand = true;
        break;
      case "--base":
        // ignored for now
        i++;
        break;
      default:
        throw new Error(`Unknown arg: ${a}`);
    }
  }

  return args;
}

function deterministicUuid(seed: number, label: string): string {
  // Deterministic UUID v4-ish derived from sha256(seed|label)
  const h = crypto
    .createHash("sha256")
    .update(`${seed}|${label}`)
    .digest();

  const bytes = Buffer.from(h.slice(0, 16));

  // Set version to 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant to RFC 4122
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}

function assertUuid(name: string, value: string | undefined): string {
  if (!value || !UUID_RE.test(value)) {
    throw new Error(`${name} must be a valid UUID`);
  }
  return value;
}

function isRemoteDatabaseUrl(url: string): boolean {
  // crude: anything not localhost/127.0.0.1 is treated as remote.
  return !/localhost|127\.0\.0\.1/i.test(url);
}

function looksLikeProductionEnv(): boolean {
  // Hard block obvious production indicators
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.VERCEL_ENV === "production") return true;
  return false;
}

function getPrismaKnownErrorCode(e: unknown): string | undefined {
  if (!e || typeof e !== "object") return undefined;
  const maybe = e as { code?: unknown };
  return typeof maybe.code === "string" ? maybe.code : undefined;
}

function safetyCheck(args: Args): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  if (looksLikeProductionEnv()) {
    throw new Error(
      "Refusing to run db-hammer in production environment (NODE_ENV or VERCEL_ENV indicates production)."
    );
  }

  const remote = isRemoteDatabaseUrl(dbUrl);
  if (remote && !args.remoteOk) {
    throw new Error(
      "DATABASE_URL appears to be remote. Re-run with --remote-ok (and also --i-understand) if you intended to run against staging/dev remote DB."
    );
  }
  if (remote && !args.iUnderstand) {
    throw new Error(
      "Remote DB requires explicit acknowledgement. Re-run with --i-understand to proceed."
    );
  }

  // Require explicit bounded project IDs OR deterministic seed-based IDs.
  // If user provides only one, reject.
  if ((args.projectA && !args.projectB) || (!args.projectA && args.projectB)) {
    throw new Error(
      "Provide both --projectA and --projectB, or neither (use --seed)."
    );
  }

  if (args.projectA && !UUID_RE.test(args.projectA)) {
    throw new Error("--projectA must be a valid UUID");
  }
  if (args.projectB && !UUID_RE.test(args.projectB)) {
    throw new Error("--projectB must be a valid UUID");
  }
}

function deterministicSeoDateRange(seed: number): { dateStart: Date; dateEnd: Date } {
  // Stable-ish but deterministic date window.
  // Note: This is used only for reproducible uniqueness probes.
  const base = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  const offsetDays = Math.abs(seed) % 28;
  const dateStart = new Date(base.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const dateEnd = new Date(dateStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { dateStart, dateEnd };
}

async function ensureProjects(
  projectAId: string,
  projectBId: string,
  seed: number
) {
  const nameA = `Test Project A (${seed})`;
  const nameB = `Test Project B (${seed})`;
  const slugA = `test-a-${seed}`;
  const slugB = `test-b-${seed}`;

  await prisma.$transaction(async (tx) => {
    await tx.project.upsert({
      where: { id: projectAId },
      create: { id: projectAId, name: nameA, slug: slugA },
      update: { name: nameA, slug: slugA },
    });

    await tx.project.upsert({
      where: { id: projectBId },
      create: { id: projectBId, name: nameB, slug: slugB },
      update: { name: nameB, slug: slugB },
    });
  });

  return { slugA, slugB };
}

async function seedBaseline(projectId: string, projectSlug: string, seed: number) {
  const now = new Date();

  const entityGuideId = deterministicUuid(seed, `${projectId}|entity|guide`);
  const entityConceptId = deterministicUuid(seed, `${projectId}|entity|concept`);
  const entityProjectId = deterministicUuid(seed, `${projectId}|entity|project`);

  const slugShared = `shared-slug-${seed}`; // used across projects to prove project-scoped uniqueness

  const urlUnique = `https://example.com/${projectSlug}/source/${seed}`;
  const contentHash = crypto
    .createHash("sha256")
    .update(urlUnique)
    .digest("hex");

  const sourceItemId = deterministicUuid(seed, `${projectId}|sourceItem`);

  const relationId = deterministicUuid(seed, `${projectId}|relation|guide->concept`);

  const distributionId = deterministicUuid(seed, `${projectId}|distributionEvent`);
  const metricId = deterministicUuid(seed, `${projectId}|metricSnapshot`);

  await prisma.$transaction(async (tx) => {
    // SourceItem
    await tx.sourceItem.upsert({
      where: { id: sourceItemId },
      create: {
        id: sourceItemId,
        projectId,
        sourceType: SourceType.webpage,
        platform: Platform.website,
        url: urlUnique,
        capturedAt: now,
        capturedBy: CapturedBy.system,
        contentHash,
        operatorIntent: "db-hammer seed",
        status: SourceItemStatus.ingested,
      },
      update: {
        projectId,
        operatorIntent: "db-hammer seed",
      },
    });

    // Entities
    await tx.entity.upsert({
      where: {
        projectId_entityType_slug: {
          projectId,
          entityType: ContentEntityType.guide,
          slug: slugShared,
        },
      },
      create: {
        id: entityGuideId,
        projectId,
        entityType: ContentEntityType.guide,
        title: `Guide ${projectSlug} ${seed}`,
        slug: slugShared,
        status: "draft",
      },
      update: {
        title: `Guide ${projectSlug} ${seed}`,
      },
    });

    await tx.entity.upsert({
      where: {
        projectId_entityType_slug: {
          projectId,
          entityType: ContentEntityType.concept,
          slug: `concept-${seed}`,
        },
      },
      create: {
        id: entityConceptId,
        projectId,
        entityType: ContentEntityType.concept,
        title: `Concept ${projectSlug} ${seed}`,
        slug: `concept-${seed}`,
        conceptKind: "standard",
        status: "draft",
      },
      update: {
        title: `Concept ${projectSlug} ${seed}`,
      },
    });

    await tx.entity.upsert({
      where: {
        projectId_entityType_slug: {
          projectId,
          entityType: ContentEntityType.project,
          slug: `project-${seed}`,
        },
      },
      create: {
        id: entityProjectId,
        projectId,
        entityType: ContentEntityType.project,
        title: `Project ${projectSlug} ${seed}`,
        slug: `project-${seed}`,
        repoUrl: `https://github.com/example/${projectSlug}-${seed}`,
        status: "draft",
      },
      update: {
        title: `Project ${projectSlug} ${seed}`,
      },
    });

    // Relationship: GUIDE_USES_CONCEPT
    await tx.entityRelation.upsert({
      where: {
        projectId_fromEntityType_fromEntityId_relationType_toEntityType_toEntityId: {
          projectId,
          fromEntityType: EntityType.guide,
          fromEntityId: entityGuideId,
          relationType: RelationType.GUIDE_USES_CONCEPT,
          toEntityType: EntityType.concept,
          toEntityId: entityConceptId,
        },
      },
      create: {
        id: relationId,
        projectId,
        fromEntityType: EntityType.guide,
        fromEntityId: entityGuideId,
        relationType: RelationType.GUIDE_USES_CONCEPT,
        toEntityType: EntityType.concept,
        toEntityId: entityConceptId,
        notes: "db-hammer seed",
      },
      update: { notes: "db-hammer seed" },
    });

    // DistributionEvent (published)
    await tx.distributionEvent.upsert({
      where: { id: distributionId },
      create: {
        id: distributionId,
        projectId,
        platform: Platform.x,
        externalUrl: `https://x.com/${projectSlug}/status/${seed}`,
        status: "published",
        publishedAt: now,
        primaryEntityType: ContentEntityType.guide,
        primaryEntityId: entityGuideId,
      },
      update: { status: "published" },
    });

    // MetricSnapshot (int)
    await tx.metricSnapshot.upsert({
      where: { id: metricId },
      create: {
        id: metricId,
        projectId,
        metricType: MetricType.x_impressions,
        value: 123,
        platform: Platform.x,
        capturedAt: now,
        entityType: ContentEntityType.guide,
        entityId: entityGuideId,
        notes: "db-hammer seed",
      },
      update: { value: 123 },
    });

    // Event invariants: write a small set of logs that should exist.
    // These logs are not meant to mimic all app routes; they are invariant probes.
    const details: Prisma.InputJsonObject = { seed, tool: "db-hammer" };

    const logs: Array<Prisma.EventLogCreateArgs["data"]> = [
      {
        eventType: EventType.ENTITY_CREATED,
        entityType: EntityType.guide,
        entityId: entityGuideId,
        actor: ActorType.system,
        projectId,
        details,
      },
      {
        eventType: EventType.RELATION_CREATED,
        entityType: EntityType.guide,
        entityId: entityGuideId,
        actor: ActorType.system,
        projectId,
        details: {
          ...details,
          relationType: RelationType.GUIDE_USES_CONCEPT,
          toEntityId: entityConceptId,
        },
      },
      {
        eventType: EventType.DISTRIBUTION_PUBLISHED,
        entityType: EntityType.distributionEvent,
        entityId: distributionId,
        actor: ActorType.system,
        projectId,
        details,
      },
      {
        eventType: EventType.METRIC_SNAPSHOT_RECORDED,
        entityType: EntityType.metricSnapshot,
        entityId: metricId,
        actor: ActorType.system,
        projectId,
        details,
      },
    ];

    // Insert logs idempotently: event log table has no natural unique, so we insert once per run.
    // We scope by (projectId, eventType, entityType, entityId) and skip if already present.
    for (const l of logs) {
      const existing = await tx.eventLog.findFirst({
        where: {
          projectId,
          eventType: l.eventType,
          entityType: l.entityType,
          entityId: l.entityId,
        },
        select: { id: true },
      });
      if (!existing) {
        await tx.eventLog.create({ data: l });
      }
    }
  });

  return {
    entityGuideId,
    entityConceptId,
    entityProjectId,
    slugShared,
    sourceItemId,
    distributionId,
    metricId,
  };
}

async function seedSeoBaseline(params: {
  projectId: string;
  seed: number;
  guideEntityId: string;
}) {
  const { projectId, seed, guideEntityId } = params;

  const { dateStart, dateEnd } = deterministicSeoDateRange(seed);

  // Use values that are intentionally identical across projects for project-scoped uniqueness proof.
  const query = `db-hammer shared query ${seed}`;
  const pageUrl = `https://example.com/news/shared-seo-${seed}`;

  const searchPerformanceId = deterministicUuid(seed, `${projectId}|searchPerformance|seed`);
  const quotableBlockId = deterministicUuid(seed, `${projectId}|quotableBlock|seed`);

  await prisma.$transaction(async (tx) => {
    // SearchPerformance: upsert by composite unique (projectId, query, pageUrl, dateStart, dateEnd)
    await tx.searchPerformance.upsert({
      where: {
        projectId_query_pageUrl_dateStart_dateEnd: {
          projectId,
          query,
          pageUrl,
          dateStart,
          dateEnd,
        },
      },
      create: {
        id: searchPerformanceId,
        projectId,
        entityId: guideEntityId,
        pageUrl,
        query,
        impressions: 100,
        clicks: 10,
        ctr: 0.1,
        avgPosition: 3.7,
        dateStart,
        dateEnd,
      },
      update: {
        // Keep deterministic values stable across reruns.
        impressions: 100,
        clicks: 10,
        ctr: 0.1,
        avgPosition: 3.7,
      },
    });

    // QuotableBlock: create/upsert by deterministic id
    await tx.quotableBlock.upsert({
      where: { id: quotableBlockId },
      create: {
        id: quotableBlockId,
        projectId,
        entityId: guideEntityId,
        text: `db-hammer quotable ${seed}`,
        claimType: ClaimType.statistic,
        sourceCitation: "db-hammer",
        topicTag: "db-hammer",
      },
      update: {
        text: `db-hammer quotable ${seed}`,
        claimType: ClaimType.statistic,
      },
    });

    const details: Prisma.InputJsonObject = {
      seed,
      tool: "db-hammer",
      model: "seo",
    };

    // Event: QUOTABLE_BLOCK_CREATED (canonical)
    const qbEvent = {
      eventType: EventType.QUOTABLE_BLOCK_CREATED,
      entityType: EntityType.quotableBlock,
      entityId: quotableBlockId,
      actor: ActorType.system,
      projectId,
      details: {
        ...details,
        entityId: guideEntityId,
      },
    } satisfies Prisma.EventLogCreateArgs["data"];

    // Event: SearchPerformance ingestion summary
    // NOTE: EventType does not currently have a SearchPerformance-specific value.
    // We log an ENTITY_UPDATED against the Project with details.model="searchPerformance" per SEO-RECORDING-SPEC.
    const spEvent = {
      eventType: EventType.ENTITY_UPDATED,
      entityType: EntityType.project,
      entityId: projectId,
      actor: ActorType.system,
      projectId,
      details: {
        ...details,
        model: "searchPerformance",
        query,
        pageUrl,
        dateStart: dateStart.toISOString(),
        dateEnd: dateEnd.toISOString(),
      },
    } satisfies Prisma.EventLogCreateArgs["data"];

    for (const l of [qbEvent, spEvent]) {
      const existing = await tx.eventLog.findFirst({
        where: {
          projectId,
          eventType: l.eventType,
          entityType: l.entityType,
          entityId: l.entityId,
        },
        select: { id: true },
      });
      if (!existing) {
        await tx.eventLog.create({ data: l });
      }
    }
  });

  return { query, pageUrl, dateStart, dateEnd };
}

async function cleanupAtomicityProbeArtifacts(projectId: string, seed: number) {
  const entityId = deterministicUuid(seed, `${projectId}|atomicity|entity`);
  const slug = `atomicity-${seed}`;

  await prisma.$transaction(async (tx) => {
    await tx.eventLog.deleteMany({
      where: {
        projectId,
        entityType: EntityType.guide,
        entityId,
        eventType: EventType.ENTITY_CREATED,
      },
    });

    // Delete by deterministic id and also by deterministic slug in case prior failures persisted.
    await tx.entity.deleteMany({
      where: {
        projectId,
        OR: [
          { id: entityId },
          {
            entityType: ContentEntityType.guide,
            slug,
          },
        ],
      },
    });
  });

  return { entityId, slug };
}

async function runAtomicityProbe(projectId: string, seed: number) {
  // Proves that a partial write inside prisma.$transaction() rolls back fully.
  const { entityId, slug } = await cleanupAtomicityProbeArtifacts(projectId, seed);

  const details: Prisma.InputJsonObject = {
    seed,
    tool: "db-hammer",
    probe: "atomicity",
  };

  let sawIntentionalRollback = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.entity.create({
        data: {
          id: entityId,
          projectId,
          entityType: ContentEntityType.guide,
          title: `Atomicity Probe ${seed}`,
          slug,
          status: "draft",
        },
      });

      await tx.eventLog.create({
        data: {
          eventType: EventType.ENTITY_CREATED,
          entityType: EntityType.guide,
          entityId,
          actor: ActorType.system,
          projectId,
          details,
        },
      });

      throw new Error("INTENTIONAL_ROLLBACK");
    });

    throw new Error("Atomicity probe failed: transaction did not roll back");
  } catch (e) {
    if (e instanceof Error && e.message === "INTENTIONAL_ROLLBACK") {
      sawIntentionalRollback = true;
    } else {
      throw e;
    }
  }

  if (!sawIntentionalRollback) {
    throw new Error("Atomicity probe failed: did not observe rollback error");
  }

  const [entity, eventCount] = await Promise.all([
    prisma.entity.findUnique({ where: { id: entityId }, select: { id: true } }),
    prisma.eventLog.count({
      where: {
        projectId,
        entityType: EntityType.guide,
        entityId,
        eventType: EventType.ENTITY_CREATED,
      },
    }),
  ]);

  if (entity) {
    throw new Error("Atomicity probe failed: entity persisted after rollback");
  }
  if (eventCount !== 0) {
    throw new Error("Atomicity probe failed: eventLog persisted after rollback");
  }
}

async function cleanupCrossProjectProbeArtifacts(seed: number) {
  const relationId = deterministicUuid(seed, "cross-project|relation");
  await prisma.entityRelation.deleteMany({ where: { id: relationId } });
  return { relationId };
}

async function runCrossProjectViolationProbe(
  projectAId: string,
  projectBId: string,
  seed: number
) {
  // This probe proves graph isolation at the relationship layer.
  // If EntityRelation can connect an entity from project A to an entity from project B,
  // we have a critical invariants breach.

  const { relationId } = await cleanupCrossProjectProbeArtifacts(seed);

  const fromGuide = await prisma.entity.findFirst({
    where: {
      projectId: projectAId,
      entityType: ContentEntityType.guide,
      slug: `shared-slug-${seed}`,
    },
    select: { id: true },
  });

  const toConceptOtherProject = await prisma.entity.findFirst({
    where: {
      projectId: projectBId,
      entityType: ContentEntityType.concept,
      slug: `concept-${seed}`,
    },
    select: { id: true },
  });

  if (!fromGuide || !toConceptOtherProject) {
    throw new Error(
      "Cross-project probe prerequisites missing (seed may not have run)"
    );
  }

  try {
    // Attempt to create a relation row under Project A that points to an entity from Project B.
    // This MUST fail in a properly enforced system. If it succeeds, we delete it and throw.
    await prisma.entityRelation.create({
      data: {
        id: relationId,
        projectId: projectAId,
        fromEntityType: EntityType.guide,
        fromEntityId: fromGuide.id,
        relationType: RelationType.GUIDE_USES_CONCEPT,
        toEntityType: EntityType.concept,
        toEntityId: toConceptOtherProject.id,
        notes: "db-hammer cross-project violation probe",
      },
    });

    // If we got here, the invariant was violated.
    await prisma.entityRelation.delete({ where: { id: relationId } });

    throw new Error(
      "Cross-project violation probe failed: was able to create relationship across projects"
    );
  } catch (e) {
    // Any failure is acceptable (app or DB enforcement). We specifically do NOT require a given Prisma code,
    // because enforcement can happen at different layers.
    const code = getPrismaKnownErrorCode(e);

    // If the error is our intentional failure message above, surface it.
    if (e instanceof Error && e.message.includes("Cross-project violation probe failed")) {
      throw e;
    }

    // If it failed for any other reason, that's a pass.
    // Optionally log the error code for debugging.
    if (code) {
      console.log(`Cross-project probe blocked as expected (Prisma code: ${code}).`);
    } else {
      console.log("Cross-project probe blocked as expected.");
    }
  }
}

async function runCrossProjectSeoViolationProbes(
  projectAId: string,
  projectBId: string,
  seed: number
) {
  // Probes project integrity constraints on SEO tables.
  // If these writes can cross-link entities across projects, we have a DB-layer isolation gap.

  const guideA = await prisma.entity.findFirst({
    where: {
      projectId: projectAId,
      entityType: ContentEntityType.guide,
      slug: `shared-slug-${seed}`,
    },
    select: { id: true },
  });

  const guideB = await prisma.entity.findFirst({
    where: {
      projectId: projectBId,
      entityType: ContentEntityType.guide,
      slug: `shared-slug-${seed}`,
    },
    select: { id: true },
  });

  if (!guideA || !guideB) {
    throw new Error("SEO cross-project probes missing seeded guides");
  }

  // QuotableBlock probe
  const qbProbeId = deterministicUuid(seed, "cross-project|quotableBlock");
  await prisma.quotableBlock.deleteMany({ where: { id: qbProbeId } });

  try {
    await prisma.quotableBlock.create({
      data: {
        id: qbProbeId,
        projectId: projectAId,
        entityId: guideB.id,
        text: "db-hammer cross-project quotable block probe",
        claimType: ClaimType.statistic,
        sourceCitation: "db-hammer",
        topicTag: "db-hammer",
      },
    });

    // If we got here, the invariant was violated.
    await prisma.quotableBlock.delete({ where: { id: qbProbeId } });
    throw new Error(
      "Cross-project SEO probe failed: was able to create QuotableBlock pointing to an entity in another project"
    );
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes("Cross-project SEO probe failed")
    ) {
      throw e;
    }
    const code = getPrismaKnownErrorCode(e);
    if (code) {
      console.log(
        `Cross-project QuotableBlock probe blocked as expected (Prisma code: ${code}).`
      );
    } else {
      console.log("Cross-project QuotableBlock probe blocked as expected.");
    }
  }

  // SearchPerformance probe
  const spProbeId = deterministicUuid(seed, "cross-project|searchPerformance");
  await prisma.searchPerformance.deleteMany({ where: { id: spProbeId } });

  const { dateStart, dateEnd } = deterministicSeoDateRange(seed + 1);
  const query = `db-hammer cross-project query ${seed}`;
  const pageUrl = `https://example.com/news/cross-project-seo-${seed}`;

  try {
    await prisma.searchPerformance.create({
      data: {
        id: spProbeId,
        projectId: projectAId,
        entityId: guideB.id,
        pageUrl,
        query,
        impressions: 1,
        clicks: 0,
        ctr: 0,
        avgPosition: 10,
        dateStart,
        dateEnd,
      },
    });

    await prisma.searchPerformance.delete({ where: { id: spProbeId } });
    throw new Error(
      "Cross-project SEO probe failed: was able to create SearchPerformance pointing to an entity in another project"
    );
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes("Cross-project SEO probe failed")
    ) {
      throw e;
    }
    const code = getPrismaKnownErrorCode(e);
    if (code) {
      console.log(
        `Cross-project SearchPerformance probe blocked as expected (Prisma code: ${code}).`
      );
    } else {
      console.log("Cross-project SearchPerformance probe blocked as expected.");
    }
  }
}

async function runChecks(projectAId: string, projectBId: string, seed: number) {
  // 1) Isolation: shared slug exists in both projects, but counts are project-scoped.
  const slugShared = `shared-slug-${seed}`;

  const [aCount, bCount] = await Promise.all([
    prisma.entity.count({
      where: {
        projectId: projectAId,
        entityType: ContentEntityType.guide,
        slug: slugShared,
      },
    }),
    prisma.entity.count({
      where: {
        projectId: projectBId,
        entityType: ContentEntityType.guide,
        slug: slugShared,
      },
    }),
  ]);

  if (aCount !== 1 || bCount !== 1) {
    throw new Error(
      `Isolation check failed: expected shared guide slug to exist in both projects (1 each). got A=${aCount} B=${bCount}`
    );
  }

  // 2) Uniqueness: duplicate (projectId, entityType, slug) within same project must fail
  try {
    await prisma.entity.create({
      data: {
        projectId: projectAId,
        entityType: ContentEntityType.guide,
        title: "Duplicate",
        slug: slugShared,
        status: "draft",
      },
    });
    throw new Error(
      "Uniqueness check failed: duplicate entity slug should have thrown"
    );
  } catch (e) {
    const code = getPrismaKnownErrorCode(e);
    if (code !== "P2002") {
      throw new Error(
        `Expected Prisma P2002 for duplicate entity slug, got: ${code ?? "unknown"}`
      );
    }
  }

  // 3) Relationship uniqueness within project
  const aGuide = await prisma.entity.findFirst({
    where: {
      projectId: projectAId,
      entityType: ContentEntityType.guide,
      slug: slugShared,
    },
    select: { id: true },
  });
  const aConcept = await prisma.entity.findFirst({
    where: {
      projectId: projectAId,
      entityType: ContentEntityType.concept,
      slug: `concept-${seed}`,
    },
    select: { id: true },
  });
  if (!aGuide || !aConcept) {
    throw new Error("Seed prerequisite missing for relationship uniqueness check");
  }

  try {
    await prisma.entityRelation.create({
      data: {
        projectId: projectAId,
        fromEntityType: EntityType.guide,
        fromEntityId: aGuide.id,
        relationType: RelationType.GUIDE_USES_CONCEPT,
        toEntityType: EntityType.concept,
        toEntityId: aConcept.id,
        notes: "duplicate",
      },
    });
    throw new Error("Uniqueness check failed: duplicate relation should have thrown");
  } catch (e) {
    const code = getPrismaKnownErrorCode(e);
    if (code !== "P2002") {
      throw new Error(
        `Expected Prisma P2002 for duplicate relation, got: ${code ?? "unknown"}`
      );
    }
  }

  // 4) SEO uniqueness: duplicate SearchPerformance unique within same project must fail.
  const { dateStart, dateEnd } = deterministicSeoDateRange(seed);
  const query = `db-hammer shared query ${seed}`;
  const pageUrl = `https://example.com/news/shared-seo-${seed}`;

  try {
    await prisma.searchPerformance.create({
      data: {
        id: deterministicUuid(seed, `duplicate|searchPerformance|${projectAId}`),
        projectId: projectAId,
        entityId: aGuide.id,
        pageUrl,
        query,
        impressions: 1,
        clicks: 0,
        ctr: 0,
        avgPosition: 10,
        dateStart,
        dateEnd,
      },
    });
    throw new Error(
      "SEO uniqueness check failed: duplicate SearchPerformance should have thrown"
    );
  } catch (e) {
    const code = getPrismaKnownErrorCode(e);
    if (code !== "P2002") {
      throw new Error(
        `Expected Prisma P2002 for duplicate SearchPerformance, got: ${code ?? "unknown"}`
      );
    }
  }

  // 5) Isolation: same SearchPerformance unique key is allowed across projects.
  const bSpCount = await prisma.searchPerformance.count({
    where: {
      projectId: projectBId,
      query,
      pageUrl,
      dateStart,
      dateEnd,
    },
  });
  if (bSpCount !== 1) {
    throw new Error(
      `SEO isolation check failed: expected project B to have 1 SearchPerformance for shared key; got ${bSpCount}`
    );
  }

  // 6) Event invariant probe: ensure at least one of each expected event type exists per project
  const expected: EventType[] = [
    EventType.ENTITY_CREATED,
    EventType.RELATION_CREATED,
    EventType.DISTRIBUTION_PUBLISHED,
    EventType.METRIC_SNAPSHOT_RECORDED,
    EventType.QUOTABLE_BLOCK_CREATED,
    EventType.ENTITY_UPDATED,
  ];

  for (const pid of [projectAId, projectBId]) {
    for (const et of expected) {
      const c = await prisma.eventLog.count({
        where: { projectId: pid, eventType: et },
      });
      if (c < 1) {
        throw new Error(
          `Event invariant failed: project ${pid} missing eventType ${et}`
        );
      }
    }
  }

  // 7) Atomicity probe: a thrown error inside $transaction must roll back state + events.
  await runAtomicityProbe(projectAId, seed);
  await runAtomicityProbe(projectBId, seed);

  // 8) Cross-project violation probe: relationships must not be able to connect across projects.
  await runCrossProjectViolationProbe(projectAId, projectBId, seed);

  // 9) Cross-project violation probes: SEO tables must not be able to cross-link entities across projects.
  await runCrossProjectSeoViolationProbes(projectAId, projectBId, seed);

  // 10) MetricSnapshot Float sanity: ensure float values persist.
  const floatMetricId = deterministicUuid(seed, `float-metric|${projectAId}`);
  await prisma.metricSnapshot.deleteMany({ where: { id: floatMetricId } });

  await prisma.metricSnapshot.create({
    data: {
      id: floatMetricId,
      projectId: projectAId,
      metricType: MetricType.yt_ctr,
      value: 0.05,
      platform: Platform.youtube,
      capturedAt: new Date(),
      entityType: ContentEntityType.guide,
      entityId: aGuide.id,
      notes: "db-hammer float probe",
    },
  });

  const floatMetric = await prisma.metricSnapshot.findUnique({
    where: { id: floatMetricId },
    select: { value: true },
  });

  if (!floatMetric || floatMetric.value !== 0.05) {
    throw new Error(
      `MetricSnapshot float probe failed: expected 0.05, got ${floatMetric?.value ?? "null"}`
    );
  }
}

async function cleanupProjects(projectIds: string[]) {
  // Delete in FK-safe order, strictly bounded by projectId.
  await prisma.$transaction(async (tx) => {
    await tx.eventLog.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.searchPerformance.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.quotableBlock.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.metricSnapshot.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.distributionEvent.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.video.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.entityRelation.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.draftArtifact.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await tx.sourceItem.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.sourceFeed.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.entity.deleteMany({ where: { projectId: { in: projectIds } } });
    await tx.project.deleteMany({ where: { id: { in: projectIds } } });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  safetyCheck(args);

  const projectAId = args.projectA ?? deterministicUuid(args.seed, "projectA");
  const projectBId = args.projectB ?? deterministicUuid(args.seed, "projectB");

  assertUuid("projectA", projectAId);
  assertUuid("projectB", projectBId);

  console.log("DB Hammer starting...");
  console.log(
    `DATABASE_URL remote: ${isRemoteDatabaseUrl(process.env.DATABASE_URL ?? "")}`
  );
  console.log(`Project A: ${projectAId}`);
  console.log(`Project B: ${projectBId}`);
  console.log(
    `Actions: createProjects=${args.createProjects} seedData=${args.seedData} runChecks=${args.runChecks} cleanup=${args.cleanup}`
  );

  let slugA = "";
  let slugB = "";

  try {
    if (args.createProjects) {
      const slugs = await ensureProjects(projectAId, projectBId, args.seed);
      slugA = slugs.slugA;
      slugB = slugs.slugB;
      console.log("Created/updated test projects.");
    } else {
      const projects = await prisma.project.findMany({
        where: { id: { in: [projectAId, projectBId] } },
        select: { id: true, slug: true },
      });
      const a = projects.find((p) => p.id === projectAId);
      const b = projects.find((p) => p.id === projectBId);
      slugA = a?.slug ?? `test-a-${args.seed}`;
      slugB = b?.slug ?? `test-b-${args.seed}`;
    }

    if (args.seedData) {
      const seededA = await seedBaseline(projectAId, slugA, args.seed);
      const seededB = await seedBaseline(projectBId, slugB, args.seed);

      await seedSeoBaseline({
        projectId: projectAId,
        seed: args.seed,
        guideEntityId: seededA.entityGuideId,
      });

      await seedSeoBaseline({
        projectId: projectBId,
        seed: args.seed,
        guideEntityId: seededB.entityGuideId,
      });

      console.log("Seeded baseline graph + SEO records for both projects.");
    }

    if (args.runChecks) {
      await runChecks(projectAId, projectBId, args.seed);
      console.log("All invariant checks passed.");
    }

    if (args.cleanup) {
      await cleanupProjects([projectAId, projectBId]);
      console.log("Cleanup complete.");
    }

    console.log("DB Hammer finished successfully.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error("DB Hammer failed:");
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
