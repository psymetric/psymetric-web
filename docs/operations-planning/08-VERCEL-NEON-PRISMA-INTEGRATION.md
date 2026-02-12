# Vercel + Neon + Prisma Integration

## Purpose
This document defines the **practical integration rules** for connecting the PsyMetric application (Vercel) to the database (Neon Postgres) using Prisma.

It exists to:
- prevent serverless connection exhaustion
- avoid Edge-runtime DB footguns
- standardize environment variables
- keep migrations safe and boring

This document is implementation-facing. If it conflicts with higher-level architecture, architecture wins.

---

## Core Principles

1. **DB access happens in Node runtime by default.**
2. **Use a pooled connection for application runtime.**
3. **Use a direct connection for migrations and schema management.**
4. **Never create a new Prisma client per request.**

---

## Runtime Strategy

### Default (Recommended v1)
- Run DB queries from **Node.js server runtime** (Next.js Server Components, Route Handlers, Server Actions).
- Avoid Edge runtime for any route that touches the DB.

This keeps Postgres connectivity straightforward and reduces tooling surprises.

### If Edge Runtime Is Required (Deferred)
If a route must run on the Edge (latency/geo requirements):
- do **not** use a normal TCP Postgres driver
- use a serverless HTTP/WebSocket driver (Neon serverless driver)
- keep transactions simple

Edge DB access is optional and should be adopted intentionally.

---

## Connection Strings (Required)

### Environment Variables
Define two connection strings:

- `DATABASE_URL` = **pooled** connection string (safe for serverless runtime)
- `DIRECT_DATABASE_URL` = **direct** connection string (for migrations / admin / long-running operations)

Rules:
- Runtime app code uses `DATABASE_URL`.
- Prisma CLI and migrations use `DIRECT_DATABASE_URL`.

---

## Prisma Datasource Configuration

Use Prisma’s `directUrl` to keep migrations on the direct connection.

Example pattern:
- `url` uses `DATABASE_URL`
- `directUrl` uses `DIRECT_DATABASE_URL`

This prevents migration failures caused by transaction pooling limitations.

---

## Prisma Client Instantiation (Required)

Prisma Client must be a singleton to avoid creating new connection pools per request.

Rules:
- Create Prisma Client once per server instance.
- Reuse it across requests.
- In development, reuse via a global reference to avoid hot-reload explosion.

---

## Serverless Connection Exhaustion

Serverless platforms can spawn many concurrent instances.

Rules:
- Always use pooled connection for runtime.
- Avoid long transactions.
- Keep request handlers short-lived.
- Prefer read patterns that do not hold connections longer than necessary.

---

## Migrations (Required Workflow)

Local development:
1. Update schema
2. Run migrations locally
3. Commit migration files

Production deployment:
- Run deploy-time migrations using a non-interactive command.

Rules:
- Never run interactive migration commands in production.
- Migrations must be reversible or have a documented rollback plan.

---

## Prisma in Edge (If Adopted Later)

If you need Prisma-like ergonomics in Edge:
- use a database proxy / pooling layer designed for Edge environments
- ensure the solution supports Prisma Client in Edge

This is out of scope for v1 unless explicitly required.

---

## Observability (Minimal)

Minimum operational visibility:
- log DB connection errors clearly
- log Prisma errors with request identifiers
- surface “too many connections” symptoms distinctly

Avoid heavy observability stacks in v1.

---

## Invariants

- Runtime DB access uses pooled connection
- Migrations use direct connection
- Prisma client is singleton
- DB access remains Node-runtime by default

If an implementation violates any invariant above, it is not v1-compliant.

---

## Status
This document defines the canonical integration approach for Vercel + Neon + Prisma.

End of document.

