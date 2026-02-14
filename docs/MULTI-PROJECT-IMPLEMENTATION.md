# Multi-Project Scoping — Implementation Guide

**Status:** Schema applied, API wiring pending  
**Last updated:** February 14, 2026

---

## Files Delivered

| File | Location | Purpose |
|------|----------|---------|
| `schema.prisma` | `prisma/schema.prisma` | Updated schema with Project model |
| `migration.sql` | `prisma/migrations/20260214120000_add_project_scoping/` | Migration SQL |
| `project.ts` | `src/lib/project.ts` | Project resolution helper |

## Migration Steps

```bash
# 1. Apply migration to local DB
npx prisma migrate dev --name add_project_scoping

# 2. Generate client
npx prisma generate

# 3. Verify default project exists
# The migration inserts a default "psymetric" project automatically
```

If Prisma complains about drift (because the migration was created manually), use:
```bash
npx prisma migrate resolve --applied 20260214120000_add_project_scoping
npx prisma generate
```

For Vercel deployment, the existing build command handles it:
```
npx prisma migrate deploy && npx prisma generate && next build
```

---

## How to Wire Into Existing Routes

The pattern is the same everywhere. Two lines at the top of each handler:

### For mutating endpoints (POST/PATCH/PUT/DELETE):

```typescript
import { resolveProjectId } from "@/lib/project";

export async function POST(request: NextRequest) {
  // Resolve project scope
  const { projectId, error: projectError } = await resolveProjectId(request);
  if (projectError) return badRequest(projectError);

  // ... existing logic ...

  // Add projectId to every create call:
  const entity = await prisma.$transaction(async (tx) => {
    const newEntity = await tx.entity.create({
      data: {
        ...existingData,
        projectId,        // ← add this
      },
    });
    await tx.eventLog.create({
      data: {
        ...existingEventData,
        projectId,        // ← add this
      },
    });
    return newEntity;
  });
}
```

### For read endpoints (GET):

```typescript
import { resolveProjectId } from "@/lib/project";

export async function GET(request: NextRequest) {
  const { projectId, error: projectError } = await resolveProjectId(request);
  if (projectError) return badRequest(projectError);

  // Add projectId to every where clause:
  const where = {
    projectId,            // ← add this
    ...existingFilters,
  };
}
```

### For entity-scoped routes (e.g. PATCH /api/entities/[id]):

Derive projectId from the entity being modified — don't trust the header:

```typescript
export async function PATCH(request, context) {
  const entity = await prisma.entity.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!entity) return notFound("Entity not found");

  // Use entity's projectId for the event log
  await tx.eventLog.create({
    data: {
      ...eventData,
      projectId: entity.projectId,   // ← derive from parent
    },
  });
}
```

### For relationship creation (cross-project guard):

```typescript
import { assertSameProject } from "@/lib/project";

// After loading both entities:
const crossProjectError = assertSameProject(
  fromEntity.projectId,
  toEntity.projectId,
  "relationship"
);
if (crossProjectError) return badRequest(crossProjectError);
```

---

## Routes That Need Updates

### Priority 1 — Create endpoints (must set projectId):

| Route | Change |
|-------|--------|
| `POST /api/entities` | Add `projectId` to entity + event log creates |
| `POST /api/source-items/capture` | Add `projectId` to source item + event log creates |
| `POST /api/source-items/[id]/promote` | Derive `projectId` from source item |
| `POST /api/relationships` | Derive from `fromEntity.projectId`, assert same-project |
| `POST /api/distribution-events` | Derive from primary entity's `projectId` |
| `POST /api/metric-snapshots` | Derive from entity's `projectId` |
| `POST /api/source-items/[id]/draft-replies` | Derive from source item's `projectId` |

### Priority 2 — List endpoints (must filter by projectId):

| Route | Change |
|-------|--------|
| `GET /api/entities` | Add `projectId` to `where` |
| `GET /api/source-items` | Add `projectId` to `where` |
| `GET /api/events` | Add `projectId` to `where` |
| `GET /api/relationships` | Add `projectId` to `where` |
| `GET /api/distribution-events` | Add `projectId` to `where` |
| `GET /api/metric-snapshots` | Add `projectId` to `where` |

### Priority 3 — Mutation endpoints (derive from parent entity):

| Route | Change |
|-------|--------|
| `PATCH /api/entities/[id]` | Derive `projectId` from entity for event log |
| `GET /api/entities/[id]` | No change needed (fetches by ID, project is implicit) |
| `POST /api/entities/[id]/publish` | Derive from entity |
| `POST /api/entities/[id]/reject` | Derive from entity |
| `POST /api/entities/[id]/request-publish` | Derive from entity |
| `POST /api/entities/[id]/validate` | Derive from entity |
| `PUT /api/source-items/[id]/status` | Derive from source item |
| `DELETE /api/relationships` | Derive from entities |

### Not updated (intentionally global):

| Route | Reason |
|-------|--------|
| `GET/PUT /api/system-config` | SystemConfig is global, not project-scoped |

---

## Dashboard Wiring (Next Sprint)

Don't do this now. When ready:

1. Add project switcher dropdown to `src/app/dashboard/layout.tsx`
2. Store selection in cookie (`projectId`)
3. Server components read cookie and pass to Prisma queries
4. Show active project name prominently in nav bar
5. Color-code if desired (different accent per project)

The API routes already respect cookies via `resolveProjectId()`, so once the
dashboard sets the cookie, everything scopes automatically.

---

## Rules

1. **Every new row gets a projectId.** No exceptions.
2. **Every list query filters by projectId.** No exceptions.
3. **Relationships must be same-project.** Enforced in code via `assertSameProject()`.
4. **Event logs get projectId directly.** No joins for "show me project X history."
5. **Derive, don't trust.** For entity-scoped mutations, read projectId from the entity, don't take it from the request header.
6. **SystemConfig stays global.** It's system configuration, not project content.

---

## Default Project

- **UUID:** `00000000-0000-4000-a000-000000000001`
- **Slug:** `psymetric`
- **Constant:** `DEFAULT_PROJECT_ID` in `src/lib/project.ts`

All existing rows (if any) are backfilled to this project during migration.
The default is a bootstrap convenience — long-term, project context should be explicit.
