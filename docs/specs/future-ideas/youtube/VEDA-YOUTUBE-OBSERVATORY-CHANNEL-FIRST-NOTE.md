# VEDA YouTube Observatory — Channel-First Architecture Note

## Purpose

This note captures a small but high-leverage architectural decision for future YouTube observatory work:

> Treat YouTube as a **channel-surface observatory first**, and a **video observatory second**.

This is a future-scope design note only. It does **not** begin YouTube implementation.

---

## Why this note exists

The Brand Surface Registry hardening pass introduced a stronger identity model for `CgSurface`, including:

- canonicalized operator-facing `key`
- durable machine-readable `canonicalIdentifier`
- optional `canonicalUrl`

That work creates the correct attachment point for future observatories.

For YouTube specifically, the most important architectural choice is to avoid attaching observatory logic directly to videos first.

Doing so would make later channel-level reasoning more complex and error-prone.

---

## Core decision

Future YouTube observatory work should attach to:

```text
Project
  ↓
CgSurface(type = youtube, canonicalIdentifier = channel identity)
  ↓
YouTube Observatory
  ↓
Channel snapshots / search observations / video observations
```

Not this:

```text
Project
  ↓
Video URLs
  ↓
Ad hoc channel inference
```

---

## Reasoning

A YouTube channel is the durable identity anchor.

Videos are content units that belong to that channel.

Most strategic observatory questions are channel-scoped before they are video-scoped:

- what channel owns this visibility
- how often does the channel appear in search-like YouTube results
- how strong is the channel across topic territory
- how does channel authority change over time
- which videos belong to the observed channel surface

If video-first modeling is chosen, the system will eventually need to reconstruct channel truth later, which introduces unnecessary complexity.

---

## Recommended future model direction

The future YouTube observatory should likely be built around the following layering:

```text
CgSurface (type = youtube)
    canonicalIdentifier = durable channel identity
        ↓
YouTube channel observation layer
        ↓
Video inventory / video observation layer
        ↓
Search / recommendation / citation intelligence
```

This preserves a clean separation between:

- surface identity
- channel state over time
- video units
- observatory analytics

---

## Identity guidance

When future YouTube work begins, the preferred durable identity should be the YouTube channel ID when available.

Examples:

- stronger identity: `UCxxxxxxxxxxxxxxxxxxxxxx`
- weaker but operator-friendly interim identity: `@channelhandle`

The observatory bootstrap layer should normalize weaker forms to channel ID as early as practical.

This note does **not** require the current surface registry to solve that normalization today.

---

## Benefits of the channel-first approach

1. **Cleaner identity model**
   - one durable anchor for a YouTube brand surface

2. **Better observatory structure**
   - channel-level visibility and authority can be measured directly

3. **Simpler video attachment**
   - videos become children of a known channel surface rather than the source of truth themselves

4. **Less future refactoring**
   - avoids backfilling channel identity after video ingestion already exists

5. **Better alignment with VEDA surface architecture**
   - observatories attach to hardened surfaces, not ad hoc URL fragments

---

## Scope discipline

This note is a future-scope architectural aid.

It does **not** authorize:

- YouTube observatory implementation
- new YouTube tables
- new ingestion routes
- social observatory expansion ahead of the roadmap

It simply records the preferred architecture so future implementation starts from the correct identity layer.

---

## Summary

The key idea is simple:

> In VEDA, YouTube should be modeled as a **channel-surface observatory first**, and a **video observatory second**.

That decision should reduce future complexity substantially and aligns with the newly hardened Brand Surface Registry.
