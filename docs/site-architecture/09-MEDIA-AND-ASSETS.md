# Media & Assets

## Purpose

This document defines how **images, media, and static assets** are handled across the PsyMetric system.

It exists to:
- ensure consistent image optimization and delivery
- enforce accessibility requirements
- define Open Graph and social sharing standards
- specify asset storage and referencing

---

## Core Principle

**Media serves content. Content does not serve media.**

- Images clarify or illustrate; they do not replace explanation.
- Every image must have a purpose. Decorative images are discouraged.
- Performance and accessibility are non-negotiable.

---

## Image Formats

### Preferred Formats

| Format | Use Case |
|--------|----------|
| **WebP** | Default for all raster images (photos, screenshots, diagrams) |
| **AVIF** | Optional; use when browser support is acceptable and size savings justify it |
| **SVG** | Diagrams, icons, logos — anything that benefits from scalability |
| **PNG** | Fallback only; use when transparency is required and WebP is insufficient |

### Rules

- JPEG should be avoided for new content (use WebP instead)
- GIFs should be avoided; use MP4/WebM for animations if needed
- All images must be optimized before upload (target: <100KB for most images)

---

## Alt Text Requirements

**Every image must have alt text. No exceptions.**

### Alt Text Rules

1. **Describe the content, not the appearance**
   - Bad: "A blue diagram"
   - Good: "Diagram showing the flow from user input to LLM response"

2. **Be concise but complete**
   - Target: 10-125 characters
   - Include key information a screen reader user needs

3. **Decorative images**
   - If purely decorative, use `alt=""` (empty string)
   - Decorative images should be rare

4. **Screenshots**
   - Describe what the screenshot shows, not that it's a screenshot
   - Bad: "Screenshot of the dashboard"
   - Good: "Dashboard showing three active projects and recent activity"

5. **Diagrams and charts**
   - Summarize the key takeaway
   - Consider providing detailed description in surrounding text

---

## Open Graph & Social Cards

Every published page must have Open Graph metadata for social sharing.

### Required OG Tags

```html
<meta property="og:title" content="{Page Title}">
<meta property="og:description" content="{Page Summary}">
<meta property="og:image" content="{OG Image URL}">
<meta property="og:url" content="{Canonical URL}">
<meta property="og:type" content="article">
```

### Twitter Card Tags

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{Page Title}">
<meta name="twitter:description" content="{Page Summary}">
<meta name="twitter:image" content="{OG Image URL}">
```

### OG Image Specifications

| Property | Requirement |
|----------|-------------|
| Dimensions | 1200 x 630 px (recommended) |
| Format | PNG or WebP |
| File size | < 500KB |
| Content | Title + brand; avoid text-heavy images |

### Default OG Image

If a page has no specific OG image, use a branded default:
- PsyMetric logo + page type indicator
- Consistent template across all pages

---

## Asset Storage

### Location

Assets are stored in **object storage** (e.g., S3, R2, or equivalent), not in Git.

Exceptions:
- Small SVG icons may live in the codebase
- Brand assets (logo, favicon) may live in the codebase

### Referencing

- Assets are referenced by URL, not file path
- URLs should be stable and permanent
- Use content-addressed naming or versioned paths to enable cache busting

### Folder Structure (Logical)

```
/assets/
  /images/
    /guides/
    /concepts/
    /projects/
    /og/           # Open Graph images
  /icons/
  /brand/
```

---

## Image in Content Rules

### Placement

- Images appear **after** the text they illustrate, not before
- Images never interrupt a definition or explanation mid-paragraph
- Diagrams belong in "How It Works" sections, not "Definition" sections

### Sizing

- Images should be responsive (max-width: 100%)
- Specify explicit width and height to prevent layout shift (CLS)
- Use `loading="lazy"` for images below the fold

### Captions

- Captions are optional but encouraged for diagrams
- Captions should add context, not repeat alt text

---

## Favicon & Brand Assets

### Favicon

- Provide multiple sizes: 16x16, 32x32, 180x180 (Apple touch), 512x512 (PWA)
- Use SVG favicon where supported
- Ensure favicon is visible on both light and dark backgrounds

### Logo

- SVG format preferred
- Provide light and dark variants
- Do not use logo as a substitute for site title in headings

---

## Performance Constraints

- **Largest Contentful Paint (LCP)**: Images above the fold must load within 2.5s
- **Cumulative Layout Shift (CLS)**: All images must have explicit dimensions
- **Total image weight per page**: Target < 500KB for typical pages

Use responsive images (`srcset`) for varying viewport sizes.

---

## Accessibility Checklist

Before publishing any page with images:

- [ ] All images have meaningful alt text (or `alt=""` if decorative)
- [ ] Images have explicit width and height
- [ ] Color contrast in diagrams meets WCAG AA (4.5:1 for text)
- [ ] No information is conveyed by color alone
- [ ] Animated content can be paused (if applicable)

---

## Anti-Patterns (Forbidden)

- Stock photos with no relevance to content
- Text-heavy images (put text in HTML instead)
- Missing alt text
- Unoptimized images (>500KB without justification)
- Inline base64 images for anything larger than icons

---

## Change Control

Adding new asset types or changing storage strategy requires:

1. Update this document
2. Log `SYSTEM_CONFIG_CHANGED` event
3. Migrate existing assets if necessary

---

## End of Document
