# Affiliate Product Graph Observatory: technical architecture for VEDA

The Affiliate Product Graph Observatory enables VEDA to model the full lifecycle of products as observable entities — from manufacturer origin through retail distribution, affiliate monetization, content coverage, and consumer discovery across search, YouTube, and LLM channels. This report defines the complete data architecture: entity models, signal catalogs, time-series observation design, competitive intelligence patterns, and cross-lens integration with VEDA's existing observability infrastructure. The core strategic insight is that **product intelligence emerges from the convergence of SERP visibility, YouTube review velocity, and LLM citation share** — and the gaps between these signals represent the highest-value opportunities for affiliate content operators.

---

## Part 1: How the affiliate product ecosystem actually works

The affiliate product ecosystem is a multi-layered supply and discovery chain connecting seven distinct entity types. Understanding this chain is foundational to VEDA's observability model.

**The product flow pipeline** moves through these stages: a **manufacturer** (OEM) creates a physical product, which a **brand** packages, positions, and markets. The brand distributes through **retailers and marketplaces** (Amazon, Walmart, Best Buy, DTC stores). These retailers participate in **affiliate networks** (Amazon Associates, ShareASale/Awin, CJ Affiliate, Impact, Rakuten, PartnerStack) that provide tracking infrastructure, product data feeds, and commission payment systems. **Review sites and content publishers** — from Wirecutter to niche blogs to YouTube creators — produce discovery content (reviews, best-of lists, comparisons) containing tracked affiliate links. When a **consumer** clicks an affiliate link and purchases, the network attributes the sale and pays the publisher a commission.

The distinction between OEM and brand is strategically significant for VEDA's entity modeling. A single OEM like Foxconn manufactures for Apple, Amazon, and dozens of other brands. White-label products — identical items sold under multiple brand names — are endemic on Amazon, particularly in supplements, beauty, electronics accessories, and home goods. This means **brand is not a reliable proxy for manufacturer**, and VEDA must model the manufacturer→brand relationship as a many-to-many mapping. Private labels (Amazon Basics, Kirkland, Great Value) add complexity: the retailer becomes both brand and distribution channel simultaneously.

The **affiliate funnel** mirrors the classic marketing funnel but is mediated entirely by content. At the awareness stage, consumers encounter affiliate content through Google searches ("best wireless headphones"), YouTube videos, or LLM responses. During consideration, they read detailed reviews and comparison tables. At the decision point, the affiliate's "top pick" recommendation drives a click to the retailer. The affiliate tracking system — using first-party cookies, server-side postbacks, or click IDs — attributes the subsequent purchase. Key funnel metrics include click-through rate, earnings per click (EPC), and conversion rate, all of which VEDA can model as derived signals.

**Affiliate-driven review sites vs. editorial review sites** occupy different positions in this ecosystem. Wirecutter (NYT) represents the editorial model: expert reviewers spend 50+ hours testing products, editorial and commerce teams are separated, and the site now generates estimated **$6M+/month in affiliate revenue** with a Domain Authority of 100. RTINGS takes a data-driven approach with standardized testing methodologies, programmatically generating thousands of comparison pages from structured test data — though it recently moved test results behind a **$10/month paywall** in response to declining search traffic from AI overviews. Pure affiliate sites at the lower end rewrite Amazon listings without physical testing. This quality spectrum is itself an observable signal for VEDA: sites with original testing methodology produce higher-authority content that ranks better and earns more links.

The marketplace layer is dominated by Amazon, which holds approximately **46% of affiliate marketing market share**. Amazon simultaneously operates as retailer, marketplace (third-party sellers), brand (Amazon Basics), and affiliate network — a vertically integrated position that shapes the entire ecosystem. Its 24-hour cookie window is short, but cart-wide commissions (affiliates earn on the entire cart, not just the linked product) and high consumer trust compensate. Walmart's affiliate program operates through Impact.com at 1–4% commissions. Best Buy runs through CJ Affiliate and Impact at 0.5–1%. eBay's Partner Network pays 1–4% depending on category.

---

## Part 2: Entity graph model with field-level specifications

The following entity definitions form the core of VEDA's Product Graph data model. Each entity is designed for external observability — every field is either directly observable from public data or derivable from observable signals.

### Product entity

| Field | Type | Description |
|-------|------|-------------|
| `product_id` | UUID | Internal VEDA primary key |
| `canonical_name` | string | Normalized product name (e.g., "Sony WH-1000XM5") |
| `brand_id` | FK → Brand | Brand that sells/markets this product |
| `manufacturer_id` | FK → Manufacturer, nullable | OEM when different from brand (e.g., Foxconn for Apple products) |
| `category_id` | FK → Product Category | Primary category assignment |
| `upc` | string(12), nullable | Universal Product Code (GTIN-12) — the single best cross-platform identifier |
| `gtin` | string(14), nullable | Global Trade Item Number (encompasses UPC, EAN, ISBN) |
| `ean` | string(13), nullable | European Article Number (GTIN-13) |
| `asin` | string(10), nullable | Amazon Standard Identification Number — 10-char alphanumeric, most non-book ASINs start with "B" |
| `isbn` | string(13), nullable | For books; ISBN-10 = ASIN on Amazon, ISBN-13 = valid GTIN-13 |
| `mpn` | string, nullable | Manufacturer Part Number — Brand + MPN forms a unique fallback identifier when GTIN unavailable |
| `msrp` | decimal, nullable | Manufacturer Suggested Retail Price — anchor for price deviation signals |
| `launch_date` | date, nullable | Product release date — critical for lifecycle stage classification |
| `status` | enum | `active`, `discontinued`, `rumored`, `pre_order` |
| `description` | text, nullable | Canonical product description |
| `parent_product_id` | FK → Product, nullable | For product variations (Amazon parent/child ASIN structure — up to 15,000 children per parent) |
| `variation_type` | string, nullable | Size, Color, Style, Configuration |

**Cross-platform identity resolution** uses this hierarchy: GTIN/UPC/EAN (universal, works across all retailers) → ISBN (for books, equals ASIN on Amazon) → Brand + MPN (accepted fallback by eBay, Google Shopping) → ASIN (Amazon-only, but linked to UPCs internally). SKUs are retailer-specific and useless for cross-platform matching.

### Brand entity

| Field | Type | Description |
|-------|------|-------------|
| `brand_id` | UUID | Internal VEDA primary key |
| `brand_name` | string | Canonical brand name |
| `parent_company_id` | FK → Manufacturer, nullable | Holding company or parent manufacturer |
| `brand_tier` | enum | `budget`, `mid_market`, `premium`, `luxury` — observable from pricing patterns and retail positioning |
| `brand_positioning` | text | Brief positioning statement derived from observed messaging |
| `primary_category_id` | FK → Product Category | The category this brand is most associated with |
| `website_domain` | string | Primary brand website domain |
| `notable_products` | FK[] → Product | Key products associated with this brand |
| `dtc_status` | boolean | Whether brand sells direct-to-consumer |
| `private_label_owner_id` | FK → Retailer, nullable | If this is a retailer's private label (e.g., Amazon Basics → Amazon) |

### Manufacturer entity

| Field | Type | Description |
|-------|------|-------------|
| `manufacturer_id` | UUID | Internal VEDA primary key |
| `legal_name` | string | Legal corporate name |
| `country_of_origin` | string | Primary manufacturing country |
| `brand_ids` | FK[] → Brand | Brands this manufacturer owns or produces for |
| `oem_status` | boolean | Whether they manufacture for third-party brands |
| `subsidiary_ids` | FK[] → Manufacturer, nullable | Child companies |

### Retailer entity

| Field | Type | Description |
|-------|------|-------------|
| `retailer_id` | UUID | Internal VEDA primary key |
| `retailer_name` | string | Canonical name |
| `retailer_type` | enum | `marketplace`, `specialty`, `dtc`, `big_box`, `department_store` |
| `domain` | string | Primary retail domain |
| `affiliate_program_id` | FK → Affiliate Program, nullable | Primary affiliate program |
| `product_coverage` | integer, nullable | Estimated product catalog size |
| `api_access` | enum | `public_api`, `affiliate_api`, `seller_api_only`, `none` — Best Buy has a free public API; Amazon requires affiliate status; Walmart has no public product API |

### Affiliate Program entity

| Field | Type | Description |
|-------|------|-------------|
| `program_id` | UUID | Internal VEDA primary key |
| `program_name` | string | Program name (e.g., "Amazon Associates") |
| `network` | enum | `amazon_associates`, `shareasale_awin`, `cj_affiliate`, `impact`, `rakuten`, `partnerstack`, `ebay_partner_network`, `direct` |
| `commission_rate_range` | jsonb | Category-specific rate map (see commission data below) |
| `cookie_duration_days` | integer | Attribution window — Amazon: 1 day (24h); ShareASale: typically 30 days; Impact: 30–180 days; PartnerStack: typically 90 days |
| `commission_type` | enum | `percentage`, `flat_fee`, `recurring`, `hybrid`, `tiered` |
| `supported_categories` | FK[] → Product Category | Categories covered |
| `approval_difficulty` | enum | `open`, `reviewed`, `restricted`, `invitation_only` |
| `payment_terms` | jsonb | Min payout, payment frequency, methods — Amazon: $10 min, ~60 days post-month; ShareASale: $50 min, 20th of month; CJ: $50 min, net-20; Rakuten: $50 min, net-60 |
| `data_exposed` | string[] | What data affiliates can access: `["product_feeds", "click_reports", "conversion_data", "product_api", "sub_id_tracking"]` |

**Current Amazon Associates commission rates (2025–2026):**

| Category | Rate |
|----------|------|
| Amazon Games | **20%** |
| Luxury Beauty, Amazon Explore | **10%** |
| Amazon Haul | **7%** |
| Digital/Physical Music, Handmade, Digital Videos | 5% |
| Physical Books, Kitchen, Automotive | 4.5% |
| Amazon Fashion, Echo, Ring, Fire TV, Kindle, Watches, Jewelry, Luggage, Shoes | 4% |
| Toys, Furniture, Home, Home Improvement, Lawn & Garden, Pets, Headphones, Beauty, Musical Instruments, Outdoors, Tools, Sports, Baby | 3% |
| PC, PC Components, DVD & Blu-Ray | 2.5% |
| Televisions, Digital Video Games | 2% |
| Amazon Fresh, Physical Video Games, Grocery, Health & Personal Care | 1% |
| Gift Cards, Wireless Plans, Alcoholic Beverages | 0% |

Beyond Amazon, commission ranges diverge significantly: **SaaS/software affiliate programs pay 15–50% recurring** (PartnerStack ecosystem), web hosting pays $100–200 per sale, financial services pays $50–200 per signup, and luxury beauty maintains Amazon's highest stable physical product rate at **10%**.

### Product Category entity

| Field | Type | Description |
|-------|------|-------------|
| `category_id` | UUID | Internal VEDA primary key |
| `category_name` | string | Canonical category name |
| `parent_category_id` | FK → Product Category, nullable | For hierarchical taxonomy — Amazon Browse Nodes go 6+ levels deep |
| `taxonomy_source` | enum | `amazon_browse_node`, `google_product_taxonomy`, `schema_org`, `veda_unified` |
| `external_id` | string, nullable | Amazon browse node ID (numeric), Google taxonomy ID (numeric, 6,000+ categories), or Schema.org type |
| `avg_commission_rate` | decimal, derived | Weighted average affiliate commission across programs in this category |
| `competition_level` | enum, derived | `low`, `moderate`, `high`, `saturated` — derived from SERP analysis and content density |
| `avg_product_price` | decimal, derived | Average price of products in this category |
| `brand_concentration` | decimal, derived | HHI or similar metric — high in tablets (Apple dominates ~60%+), low in headphones (Sony, Bose, Sennheiser, Apple, JBL, Jabra all viable) |

**Taxonomy mapping** is critical because Amazon Browse Nodes are dynamic (created and deleted based on demand), Google Product Taxonomy has 6,000+ predefined categories using `>` delimiters, and Schema.org provides structured data types (Product, Offer, Review, AggregateRating). VEDA should maintain a unified taxonomy with mappings to all three systems.

### Review Page entity

| Field | Type | Description |
|-------|------|-------------|
| `review_page_id` | UUID | Internal VEDA primary key |
| `url` | string | Page URL |
| `page_type` | enum | `individual_review`, `best_of_list`, `comparison`, `roundup`, `buying_guide`, `deal_page` |
| `product_ids` | FK[] → Product | Products covered on this page |
| `author_type` | enum | `affiliate_site`, `editorial`, `ugc`, `youtube`, `llm_generated`, `forum` |
| `domain_authority` | integer, nullable | Ahrefs DR or equivalent observed metric |
| `affiliate_programs_used` | FK[] → Affiliate Program | Detected from affiliate link URL patterns on the page |
| `affiliate_link_density` | decimal, nullable | Ratio of affiliate links to total outbound links |
| `observed_at` | timestamp | When this page was last observed |
| `serp_rank` | integer, nullable | Position in SERP for tracked product queries |
| `structured_data_types` | string[] | Schema.org types found: `["Product", "Review", "AggregateRating", "Offer"]` |
| `content_freshness` | date, nullable | Last update date detected on page |

### Product Comparison entity

| Field | Type | Description |
|-------|------|-------------|
| `comparison_id` | UUID | Internal VEDA primary key |
| `url` | string | Page URL |
| `products_compared` | FK[] → Product | Products in the comparison |
| `winner_product_id` | FK → Product, nullable | Declared winner/recommendation |
| `comparison_type` | enum | `head_to_head`, `category_roundup`, `spec_comparison`, `price_comparison` |
| `observed_at` | timestamp | Observation timestamp |
| `source_type` | enum | `web_article`, `youtube_video`, `llm_response`, `serp_feature` |

### Product Mention entity (time-series)

| Field | Type | Description |
|-------|------|-------------|
| `mention_id` | UUID | Internal VEDA primary key |
| `product_id` | FK → Product | Referenced product |
| `source_type` | enum | `web_article`, `youtube`, `llm_response`, `serp_feature`, `social`, `forum`, `podcast` |
| `source_url` | string | Source URL |
| `source_channel_id` | FK, nullable | YouTube channel ID or similar |
| `mention_context` | enum | `brief`, `reviewed`, `recommended`, `cited`, `compared`, `criticized`, `sponsored` |
| `observed_at` | timestamp | When observed |
| `sentiment` | enum | `positive`, `neutral`, `negative` |
| `citation_position` | integer, nullable | Position in list (1st mentioned = highest authority signal) |

### Key relationships and their strategic intelligence value

The relationships between entities form the intelligence backbone of the Product Graph. The highest-value relationships for an affiliate content operator are:

**Category → has affiliate program → Affiliate Program** is the foundational monetization relationship. It determines whether content about a product category can be directly monetized and at what rate. A category with high search volume but no affiliate programs is strategically worthless for affiliate operators, while one with 10% commissions and moderate competition is gold.

**Review Page → reviews → Product** enables content coverage analysis — identifying which products have extensive review coverage versus which are under-served. When cross-referenced with search volume data, this reveals the highest-value content gaps.

**Product Mention → cites → Product** (time-series) drives trend detection. The velocity of new mentions across web articles, YouTube, and LLM responses indicates product momentum, lifecycle stage, and whether a product is gaining or losing mindshare.

**Product Comparison → compares → Products** maps the competitive landscape from the consumer's perspective. The most-compared product pairs reveal which products consumers consider substitutes — this directly informs which "X vs Y" comparison content to create.

**Brand → produces → Product** and **Manufacturer → manufactures → Product** enable supply-chain intelligence. When the same OEM produces products across competing brands (common in white-label categories), this signals a fragmented market where affiliate content can add genuine selection value.

---

## Part 3: Observable signals catalog

Each signal below is externally observable and measurable without requiring privileged access to retailer or manufacturer systems.

### Review coverage count

**What is measured:** The number of distinct web pages reviewing a specific product. **How measured:** SERP observation via DataForSEO — query `"[product name] review"` and count total indexed results; also query variants like `"[product] review [year]"` and `"[product] hands on"`. Cross-reference with YouTube search results count for `"[product] review"`. **Change frequency:** Slow-moving for mature products (weeks to months between new reviews); fast-moving for newly launched products (daily new reviews in first 30 days). **Cost:** DataForSEO Standard Queue at **$0.0006 per SERP page**.

### SERP visibility for product queries

**What is measured:** Which products appear in organic results, featured snippets, product carousels, People Also Ask boxes, and AI Overviews for category-level queries (e.g., "best wireless headphones"). **How measured:** DataForSEO Advanced endpoint returns structured data for every SERP element: `organic`, `featured_snippet`, `popular_products`, `shopping`, `people_also_ask`, `knowledge_graph`, `commercial_units`. Each element includes `rank_group`, `rank_absolute`, `domain`, `url`, `title`, and `rating` data. **Change frequency:** Fast-moving — Google SERP features can change daily, particularly for commercial queries. Product carousels update as Merchant Center feeds refresh. **Detection:** Track presence/absence of `popular_products` and `shopping` in `serp_item_types` array over time.

### Google Shopping presence

**What is measured:** Whether a product has free or paid Google Shopping listings. **How measured:** DataForSEO returns `shopping` as a distinct SERP element type, separated from `paid` results. Google Merchant Center requires GTIN, product title, price, availability, and images — products lacking GTINs are less likely to appear. **Change frequency:** Moderate — listings update as Merchant Center feeds refresh (typically every 24 hours).

### Amazon Best Sellers Rank trajectory

**What is measured:** A product's relative sales rank within its Amazon category — **BSR #1 is the top-selling product**. BSR is driven by sales volume and velocity, with recent sales weighted more heavily than historical performance. **How measured:** Amazon PA-API 5.0 via `BrowseNodeInfo.BrowseNodes.SalesRank` resource (note: PA-API 5.0 is being **deprecated April 30, 2026**, replaced by Creators API). Third-party tools (Jungle Scout, Helium 10) track historical BSR. **Change frequency:** Updates hourly on Amazon. Fast-moving signal. **Interpretation benchmarks:** BSR #1–100 = top sellers (~20% conversion rate); #101–500 = strong sellers; under #10,000 = solid daily sales; above #500,000 = infrequent sales. BSR is category-relative and not comparable across categories.

### Price variation across retailers

**What is measured:** MSRP vs. street price vs. sale price across Amazon, Walmart, Best Buy, and other retailers. Price deviation from MSRP is a demand signal (premium = scarce; discount = clearance or competitive pressure). **How measured:** Amazon PA-API returns `Offers.Listings.Price` with `BuyingPrice`, `Savings`, and `PercentageSaved`. Best Buy API returns `salePrice` and `regularPrice` with near-real-time updates. CamelCamelCamel and Keepa track Amazon price history. Google Shopping aggregates multi-retailer pricing. **Change frequency:** Fast-moving during sale events (hourly changes on Prime Day, Black Friday); otherwise slow-moving (weekly to monthly).

### Affiliate link density

**What is measured:** The concentration of affiliate links on pages reviewing or recommending a product — measurable by pattern-matching outbound URLs against known affiliate network signatures. **How measured:** Web fetch of review pages + regex matching against known patterns: Amazon (`tag=` parameter, `amzn.to`), ShareASale (`shareasale.com/r.cfm`), CJ (`anrdoezrs.net`, `jdoqocy.com`, `tkqlhce.com`, `dpbolvw.net`), Impact (`sjv.io`), Rakuten (`click.linksynergy.com`), link cloaking paths (`/go/`, `/recommends/`, `/out/`). Calculate `affiliate_density = affiliate_links / total_outbound_links`. **Change frequency:** Stable — pages rarely change their monetization approach after publication. **Interpretation:** Density above 30% strongly indicates affiliate-monetized content.

### Product mention velocity

**What is measured:** The rate of new articles, reviews, YouTube videos, and mentions appearing for a product name over a defined time window. **How measured:** Periodic SERP queries with `dateRestrict` parameter for web articles; YouTube Data API `search.list` with `publishedAfter` for videos; LLM citation monitoring tools for AI mentions. Delta computation between observation periods. **Change frequency:** Fast-moving for new products; stabilizes as products mature.

### Rating and review count on Amazon/retailers

**What is measured:** Star rating (1–5) and total review count trends. **How measured:** Amazon PA-API does not directly expose reviews (per Amazon restrictions), but third-party review aggregation services and DataForSEO's Amazon Reviews API provide this data. Best Buy API returns customer review data directly. Schema.org `AggregateRating` markup on retailer pages provides `ratingValue` and `reviewCount`. **Change frequency:** Slow-moving — review counts grow incrementally; star ratings stabilize after ~50 reviews.

### YouTube review coverage

**What is measured:** Number of YouTube videos reviewing a product, view counts, engagement rates, and channel diversity. **How measured:** YouTube Data API v3 `search.list` with `q="[product name] review"` and `type=video` (100 quota units per call). Follow with `videos.list` for full metadata including `viewCount`, `likeCount`, `commentCount`, `publishedAt`, and `categoryId` (1 unit per call, batch up to 50 IDs). **Change frequency:** Fast-moving for new products; ~100 search calls/day on default 10,000-unit daily quota. **Coverage density benchmarks:** <10 reviews = new/niche product; 10–50 = growing awareness; 50–200 = mainstream; 200–1,000+ = saturated; 1,000+ = category-defining product.

### LLM citation frequency

**What is measured:** How often and in what position a product appears in LLM responses to buying-intent queries. **How measured:** Programmatic querying of Perplexity's Sonar API (returns structured `citations` array with URLs), plus monitoring tools like Profound ($100–400/month, covers ChatGPT, Claude, Gemini, Perplexity), Otterly.AI ($29–989/month, tracks "Share of AI Voice"), or Semrush AI Toolkit (citation prominence scoring). Standardized prompt libraries of 15–25 buying-intent queries per category queried weekly across 3–4 LLMs. **Change frequency:** Moderate — LLM responses can shift with model retraining cycles and RAG data refreshes. Perplexity reflects real-time web state; ChatGPT/Claude responses are more stable between training cutoffs. **Correlation:** Brands on Google page 1 show approximately **0.65 correlation** with LLM mention frequency.

### Seasonal demand patterns

**What is measured:** Search interest cycles for product names over time. **How measured:** Google Trends API (alpha, launched July 2025 — provides consistently scaled data up to 1,800 days history) or third-party access via Pytrends, SerpApi, or DataForSEO Trends. Google Merchant Center provides **13-week forward predictions** of search interest via its Topic Trends report. **Change frequency:** Cyclical — patterns repeat annually but shift with retail calendar changes. **Key seasonal peaks:** Consumer electronics peaks November–December (Black Friday); fitness equipment peaks January; outdoor products peak spring/summer; tax software peaks February–April.

---

## Part 4: Content observability through external observation

VEDA observes product-related content through four primary lenses: SERP monitoring, web page analysis, YouTube observation, and LLM citation tracking. Each content type has distinct detection patterns and observation methods.

### Product review articles in the SERP

Review articles are detectable through title pattern matching applied to SERP results. The dominant patterns are `[Product Name] Review` (most common), `[Product Name] Review [Year]` (freshness signal), `I Tested [Product]` (first-person authority), and `[Product] Review: [Verdict Phrase]`. URL patterns include `/review/[product-slug]`, `/[product-name]-review/`, and `/reviews/[product-slug]`. Domain classification against a maintained list of known review sites (wirecutter.com, rtings.com, tomsguide.com, techradar.com, pcmag.com) provides additional confidence. The DataForSEO `organic` result type returns `rating` fields with `rating_type`, `value`, `votes_count`, and `rating_max` — the presence of rating data in SERP results strongly indicates review content with Schema.org `Review` or `AggregateRating` markup.

### Best-of lists as high-value observables

Best-of lists ("Best [Category] of [Year]", "[Number] Best [Category]", "Best [Category] for [Use Case]") are the primary revenue drivers for major affiliate sites. VEDA detects these through title regex matching (`/\bbest\s+\w+/i`, `/\btop\s+\d+\b/i`), then fetches the page to extract which products are featured. **Products appearing in 3+ independent best-of lists indicate strong editorial consensus** — this is a high-confidence demand signal. The DataForSEO `popular_products` and "Top Products" carousel elements triggered by "best [category]" queries show Google's own aggregation of these editorial sources, including product names, images, star ratings, review counts, and links to recommending review sites.

### Comparison pages and head-to-head detection

Comparison content follows predictable patterns: `[Product A] vs [Product B]` titles, `/[product-a]-vs-[product-b]/` URLs. Google's Related Products carousel now includes a "Compare" button linking directly to comparison SERPs. Table-format featured snippets commonly appear for comparison queries, detectable via DataForSEO's `featured_snippet` type with table data. RTINGS programmatically generates thousands of comparison pages from structured test data, demonstrating how comparison content scales. For VEDA, the most-compared product pairs reveal which products consumers perceive as direct substitutes.

### YouTube product review observation via YouTube Lens

VEDA's YouTube Lens uses the YouTube Data API v3 to detect product reviews. The `search.list` endpoint supports queries like `q="[product name] review"` filtered by `videoCategoryId` (28 = Science & Technology, 26 = Howto & Style, 20 = Gaming) and time windows via `publishedAfter`. The `videos.list` endpoint (1 quota unit per call, batchable to 50 IDs) returns full metadata: title, description (containing affiliate links and product specs), `viewCount`, `likeCount`, `commentCount`, `publishedAt`, and `categoryId`. Title pattern detection uses regex matching against review signals: `/\b(review|unboxing|hands[-]on|first look|worth it|tested|vs\.?)\b/i`. Description scanning detects affiliate URLs (`amzn.to`, `amazon.com/dp/`) and sponsored content disclosures. **Quota budget:** 20 product searches (2,000 units) + 1,000 video lookups (1,000 units) + 50 channel profiles (50 units) = ~3,050 units/day, well within the **default 10,000 units/day** allocation.

### LLM citations as a new product authority signal

LLM citations represent an emerging product discovery channel. **39% of consumers now use generative AI for online shopping**, and U.S. retail websites saw a **1,300% increase in AI search traffic** in late 2024. VEDA tracks LLM citations through two mechanisms: direct Perplexity Sonar API integration (the most citation-transparent platform, returning structured `citations` arrays with full URLs in every response, at ~$0.20–1.00 per million tokens) and third-party monitoring tools that systematically query ChatGPT, Claude, Gemini, and Perplexity with standardized buying-intent prompts. Key metrics include citation frequency, citation position (first-mentioned vs. listed lower), citation share (percentage of relevant prompts where a product appears), and cited source URLs. Perplexity is the ideal observable because it uses real-time RAG (retrieval-augmented generation), reflecting current web state rather than stale training data.

### SERP feature monitoring through DataForSEO

DataForSEO's Advanced endpoint detects all product-relevant SERP features: `popular_products`, `commercial_units`, `shopping`, `featured_snippet`, `people_also_ask`, `knowledge_graph` (including `knowledge_graph_shopping_item` sub-elements), and `organic` results with review rich snippets. The API returns `serp_item_types` arrays summarizing all features present in a given SERP, enabling feature presence/absence tracking over time. People Also Ask patterns for product queries follow predictable structures: "Is [Product] worth it?", "[Product A] vs [Product B] which is better?", "What is the best [category]?", and "What can I use instead of [Product]?". Rate limits allow up to **2,000 API calls per minute** with up to 100 tasks per POST. Pricing starts at **$0.0006 per SERP page** in Standard Queue.

---

## Part 5: Time-series observation model and collection frequencies

The temporal dimension transforms static product data into dynamic intelligence. Each time-series observation type has an optimal collection frequency balancing data freshness against API costs and storage.

### Collection frequency recommendations

| Observation Type | Frequency | Rationale |
|-----------------|-----------|-----------|
| Amazon BSR | **Daily** | BSR updates hourly; daily sampling captures meaningful rank movement without excessive API cost. Critical for demand proxy signals. |
| Price across retailers | **Daily** (tracked products), **Weekly** (catalog) | Prices change during sale events (hourly on Prime Day/Black Friday); daily catches most movements. Full catalog weekly suffices. |
| SERP feature presence | **Weekly** | SERP features for product queries change moderately; weekly cadence detects carousel entries/exits, featured snippet changes, and new PAA patterns. |
| SERP rank for product queries | **Weekly** | Organic rankings shift gradually for most product queries. High-volatility queries merit daily monitoring during detected disturbances. |
| Review coverage count | **Weekly** | New review pages are indexed gradually; weekly SERP queries for "[product] review" track growth adequately. |
| YouTube review count & velocity | **Weekly** (search counts), **Daily** (tracked video view counts) | New review videos appear over days/weeks; view velocity on existing videos changes daily. |
| LLM citation frequency | **Weekly** | LLM responses shift with model updates and RAG refreshes; weekly prompt runs across 3–4 platforms capture meaningful changes. |
| Google Trends search interest | **Weekly** | Google Trends data is naturally aggregated weekly; more frequent polling adds no new information. |
| Affiliate link density on pages | **Monthly** | Pages rarely change monetization approach; monthly re-crawl of tracked review pages is sufficient. |
| Retailer availability (in-stock/out-of-stock) | **Daily** | Stock status changes can be sudden and commercially significant (discontinued products, supply shortages). |
| Affiliate program terms (commission rates, cookie duration) | **Monthly** | Networks adjust rates quarterly at most; Amazon historically adjusts in March, June, September, December. |

### Event-triggered observation cycles

Certain events should trigger immediate ad hoc observation sweeps beyond scheduled collection:

**Product launch detected:** When a new ASIN appears or a product status changes from `rumored` to `active`, trigger daily observation across all signals for 30 days. The window between launch and review content saturation is typically **3–6 months** — early detection captures this window.

**Major review publication:** When Wirecutter, CNET, or another high-DA site publishes a new best-of list or review, trigger SERP re-observation for affected product queries within 24 hours. A single Wirecutter recommendation can reshape SERP rankings and consumer demand patterns.

**Price drop below historical floor:** When a product's price crosses below its 90-day low (detectable from CamelCamelCamel data or PA-API price fields), trigger affiliate conversion rate monitoring. Price drops during Prime Day and Black Friday create conversion rate spikes that reward pre-positioned content.

**SERP feature disturbance:** When DataForSEO detects a change in `serp_item_types` for a tracked query (a product carousel appears or disappears, a featured snippet changes source), trigger intensive daily monitoring for 7 days to assess whether the change is stable.

**BSR rank spike:** When a product's BSR improves by more than 50% in 24 hours, trigger cross-signal investigation (check for price drops, new reviews, viral YouTube content, or LLM citation changes). Rapid BSR improvement often indicates an external catalyst.

**YouTube view velocity anomaly:** When a product review video accumulates views at 3x+ the channel's baseline rate in the first 48 hours, this is a leading demand indicator. Frederator Networks research shows first-72-hour velocity predicts long-term performance with **~92% accuracy**.

### Time-series data model

Product Mention records (the core time-series entity) accumulate continuously. For derived time-series signals, VEDA should maintain pre-computed rollups:

**Product Signal Snapshot** (computed daily/weekly per product): `product_id`, `snapshot_date`, `amazon_bsr`, `lowest_observed_price`, `avg_observed_price`, `review_page_count`, `youtube_review_count`, `youtube_total_views`, `llm_citation_count`, `llm_citation_share`, `serp_features_present` (bitmask), `google_trends_interest` (0–100), `sentiment_score` (aggregate). Delta computation between consecutive snapshots enables velocity and acceleration signals.

---

## Part 6: Competitive intelligence from converging signals

The Product Graph's strategic value emerges when signals from multiple data sources are correlated to identify specific opportunity types. Each pattern below is detectable through VEDA's existing and proposed observability infrastructure.

### Demand-coverage gap analysis

The highest-value intelligence signal is a product with **high consumer demand but low review content coverage**. VEDA detects this by comparing Google Trends search interest and YouTube view velocity (demand proxies) against review page count from SERP observation (supply proxy). When demand significantly exceeds supply, first-mover content captures disproportionate ranking permanence and link equity.

**Commission-weighted opportunity scoring** prioritizes these gaps by monetization potential. The formula combines search volume × commission rate × average product price × (1 − content saturation). A product in Amazon's Luxury Beauty category (10% commission) with 5,000 monthly searches and only 3 review pages indexed outscores a product in Physical Video Games (1% commission) with the same search volume and 50 review pages.

### Category commission arbitrage

VEDA's Affiliate Program entity stores commission rates by category, enabling cross-network arbitrage detection. The same product may be available through Amazon Associates at 3% and through the brand's direct program on Impact at 12%. VEDA tracks this through affiliate program metadata enrichment: for each product, identify all available affiliate programs and their effective commission rates. Many affiliates miss this — **the average Amazon commission across categories is approximately 3.14%**, while direct brand programs on ShareASale, CJ, and Impact commonly pay 5–30%+.

Specific high-commission opportunities detectable through VEDA: Luxury Beauty at **10% on Amazon** (the highest stable physical product commission) where SERP results are dominated by editorial publications (Allure, Elle, Vogue) rather than dedicated affiliate review sites. SaaS products on PartnerStack paying **15–50% recurring monthly commissions** — a single referred customer generating $50/month recurring revenue for the life of the subscription. Korean beauty products with Olive Young's affiliate program at **up to 13%**, significantly above Amazon Beauty's 3%.

### Emerging category detection through signal convergence

VEDA detects rapidly growing product categories by monitoring the convergence of three signals: Google Trends showing sustained 3–6 month growth (not a one-week spike), YouTube review uploads from mid-tier creators (50K–500K subscribers) surging, and LLM citation frequency increasing across weekly monitoring runs. When all three signals align on the same category, VEDA classifies it as an emerging opportunity.

### Concrete strategic insight patterns

The following examples demonstrate the intelligence output format VEDA would generate:

**"Portable power stations show a 340% increase in Google Trends search volume over 24 months across Google search and YouTube review uploads, while Amazon BSR data indicates category-wide rank improvements. Brand share is fragmented across EcoFlow, Jackery, Bluetti, and Anker, with no single affiliate publisher establishing SERP dominance beyond head terms — presenting an opportunity for a specialized niche site targeting long-tail queries like 'best portable power station for camping.'"**

**"Robot vacuum cleaners in the $200–400 range show 180–250% seasonal demand spikes during Black Friday (Google Trends + Amazon sales data) and sustained year-round search volume of 40K+ monthly for 'best robot vacuum,' but SERP analysis reveals comparison queries like 'Roborock S8 vs Dreame L20' have keyword difficulty scores under 25 with only forum results ranking — indicating under-served comparison content in a 3% Amazon commission category."**

**"Luxury beauty products maintain Amazon's highest stable physical product commission rate at 10%, while SERP analysis for 'best luxury moisturizer' shows results dominated by fashion magazines rather than data-driven review sites — indicating a format gap where an RTINGS-style testing methodology applied to skincare could differentiate in a high-commission, underserved niche."**

**"Korean beauty skincare shows 15%+ YoY growth in U.S. Google search volume across queries like 'best Korean sunscreen,' with Olive Young's affiliate program offering up to 13% commission — significantly above Amazon Beauty's 3% — and SERP results served primarily by beauty influencer blogs (DR 20–40) rather than major publishers, indicating a category where smaller affiliate sites can compete profitably."**

### SERP competitive landscape intelligence

VEDA incorporates a critical structural finding into its opportunity scoring: **96 of the top 100 domains in affiliate search results are owned by news organizations, public companies, or large media networks**. Three companies control 36 of the top 100: DotdashMeredith (15 sites), Hearst (12 sites), and Future plc (9 sites). Reddit appeared in **66.9% of 10,000 product SERPs** analyzed. Independent sites survive in specific niches where major publishers haven't created dedicated coverage — VEDA detects these by checking whether Wirecutter, CNET, Tom's Guide, and similar high-DA domains have dedicated pages for a given product query. When they don't, and keyword difficulty is below 30 with fewer than 20 referring domains on the top-ranking page, the niche qualifies as "unowned."

---

## Part 7: Integration with VEDA's intelligence ecosystem

The Affiliate Product Graph Observatory does not operate in isolation. Its strategic power multiplies when connected to VEDA's existing observability lenses. Each integration point creates a bidirectional intelligence flow.

### Content Graph integration

Product entities extend VEDA's existing Content Graph with a new entity type that maps naturally to the established model. **Product** connects to **Organization** (brands and manufacturers are observable organizations with domains, legal structures, and ownership hierarchies), to **Person** (product review authors, YouTube creators), and to **Topic** (product categories are structured topic hierarchies). Product mentions in content are automatically linkable to product entities through name matching, ASIN/GTIN detection in URLs, and Schema.org Product markup extraction.

Brand-author affinity relationships are detectable signals: a tech blog that consistently reviews Apple products across 80%+ of its content has a measurable **brand affinity score** that VEDA can compute from the Content Graph. This signal has intelligence value — sites with strong brand affinity are less likely to provide neutral recommendations and more likely to rank for branded queries than generic category queries. The Content Graph's existing entity resolution pipeline handles product name disambiguation (distinguishing "Apple" the company from "apple" the fruit through context analysis).

### SERP Observatory integration

VEDA's existing SERP disturbance detection (SIL-16 through SIL-19 signal levels) applies directly to product SERP features. A **product carousel entry/exit** (detectable when `popular_products` appears or disappears from DataForSEO's `serp_item_types` for a tracked query) constitutes a SERP disturbance event with direct revenue implications. A **featured snippet source change** for a product query (one review site replacing another at position zero) signals competitive displacement. A **People Also Ask expansion** (new product-related questions appearing) indicates evolving consumer intent around a product.

SERP volatility for product queries correlates directly with affiliate opportunity windows. When the top 5 organic results for "best [category]" change frequently (high volatility measured by weekly position delta), this indicates an **unsettled SERP** where new content can break through. When results are stable for months, the SERP is "locked" and only major authority signals (high-DA publications, significant backlink acquisition) can displace incumbents. VEDA should classify product SERPs into volatility tiers: `locked` (no top-5 changes in 90 days), `stable` (1–2 position swaps per month), `active` (weekly changes), and `volatile` (daily reshuffling).

### YouTube Lens integration

YouTube Lens entities map cleanly to Product Graph entities: **Video → reviews → Product** is the primary relationship. VEDA creates this link by matching YouTube video titles and descriptions against Product entity canonical names using the detection patterns defined in Part 4. View velocity on product review videos serves as a **leading demand indicator** — high first-48-hour velocity (measured via periodic `videos.list` snapshots at 1 quota unit per call) predicts sustained consumer interest with ~92% accuracy.

YouTube review coverage density for a product correlates with product maturity and market saturation. VEDA uses this to classify products into lifecycle stages: **Launch** (<10 YouTube reviews, high velocity per video), **Growth** (10–50 reviews, organic creators entering), **Maturity** (50–200+ reviews, "still worth it?" videos appearing), **Decline** (new reviews rare, successor-comparison videos dominating). This lifecycle classification feeds directly into content strategy — Growth-stage products have the best ROI for new review content, while Maturity-stage products require differentiated angles (long-term reviews, specific use-case comparisons) to compete.

### LLM Citation Observatory integration

Products in LLM responses represent a fundamentally new authority signal that VEDA tracks through its LLM Citation Observatory. When users ask buying-intent queries ("what is the best wireless headphone under $100"), LLMs respond with ranked product recommendations that influence purchase decisions. **LLM citation share** — the percentage of buying-intent prompts where a product appears across ChatGPT, Perplexity, Claude, and Gemini — represents a product's authority in the AI discovery channel.

The relationship between LLM citations, SERP rankings, and affiliate revenue potential creates a three-dimensional opportunity space. VEDA models this as:

- **High LLM citation + High SERP rank** = Market leader, defensible position, lower marginal opportunity
- **High LLM citation + Low SERP rank** = Content gap where LLMs recommend a product that isn't well-served by existing SERP content — **high-priority opportunity** because consumers checking LLM recommendations will then search Google and find insufficient review content
- **Low LLM citation + High SERP rank** = Product with strong traditional SEO presence but weak entity footprint in AI training data — vulnerable to displacement as LLM search grows
- **Low LLM citation + Low SERP rank** = Unknown or declining product, or new product not yet in training data

VEDA can detect when a brand captures **80% of LLM citations for a category but only 30% of SERP top-10 positions** — this gap specifically indicates that the brand has strong entity recognition (Wikipedia presence, consistent web mentions, strong Schema.org markup) but competitors are outranking it in traditional search through better content and SEO. An affiliate site could target this gap by creating authoritative review content for the LLM-favored brand, likely to rank well because the product's entity signals support SERP relevance.

### Project V integration and content strategy intelligence

Product Graph intelligence feeds into Project V's content strategy engine through opportunity scoring and content brief generation. When VEDA identifies a product with converging positive signals — rising YouTube review velocity, growing Google Trends interest, emerging SERP volatility, and increasing LLM citation frequency — it generates a content strategy proposal specifying: which product to review, which comparison pairs to target, which category queries to optimize for, which affiliate programs offer the best commission rates, and what content format (individual review, best-of list, comparison) is most likely to rank given the current SERP structure.

### Cross-lens signal compounding for highest-confidence opportunities

VEDA's most powerful intelligence emerges from **cross-lens signal convergence**. The highest-confidence opportunity signal has this profile:

**YouTube Lens** detects a product with rapidly growing review count (Growth stage), high first-48-hour view velocity on recent reviews, and expanding channel diversity (non-sponsored creators producing organic reviews). **SERP Observatory** simultaneously detects that category queries show elevated volatility (top-5 results changing weekly), no major publisher has created dedicated coverage, and a `popular_products` carousel has recently appeared for the category. **LLM Citation Observatory** confirms the product is appearing with increasing frequency in buying-intent responses across Perplexity and ChatGPT, with positive sentiment. **Content Graph** analysis shows no existing high-authority affiliate site has brand affinity for this product. **Product Graph** confirms the category has an above-average commission rate (4%+ on Amazon or 10%+ through a direct program) and the product's price point is in the $100–500 sweet spot for affiliate revenue.

When all five signals converge on the same product or category, VEDA classifies it as a **Tier 1 opportunity** — the highest confidence level for content investment. This convergence is rare (perhaps 5–10 products per quarter across all tracked categories) and extremely valuable, because it indicates genuine consumer demand growth validated across independent data sources with a clear monetization path and low competitive barriers.

The inverse pattern — **signal divergence** — is equally informative. A product with high SERP visibility but declining YouTube velocity and falling LLM citations is likely entering its Decline lifecycle stage, signaling that existing content investment should be reallocated. A product with high YouTube buzz but zero SERP presence often indicates a viral or influencer-driven spike that may not translate to sustained organic demand. VEDA flags these divergence patterns as early warnings, enabling proactive content portfolio management rather than reactive responses to traffic declines.

---

## Conclusion

The Affiliate Product Graph Observatory transforms VEDA from a content and search intelligence platform into a full-spectrum product ecosystem observatory. Three architectural insights stand out as novel. First, **cross-platform identity resolution through GTIN/UPC** (not ASIN) is the foundation — without universal product identifiers, cross-lens signal correlation is impossible. Amazon's PA-API 5.0 deprecation in April 2026 makes migration to the Creators API an urgent dependency. Second, **LLM citation share is emerging as a leading indicator** that predicts SERP opportunity windows before they appear in traditional ranking data — the 0.65 correlation between Google page-1 presence and LLM mentions means the gap between these signals is where the most valuable content opportunities exist today. Third, **the affiliate commission landscape has quietly bifurcated**: Amazon's average 3.14% commission makes it a high-volume, low-margin channel, while direct brand programs on Impact and PartnerStack routinely pay 10–50% — VEDA's commission arbitrage detection across networks may deliver more revenue uplift than any content optimization.

The system's competitive moat comes from signal compounding. Any individual signal — a Google Trends uptick, a YouTube velocity spike, an LLM citation increase — is noisy and ambiguous in isolation. When YouTube, SERP, and LLM signals converge on the same product gap simultaneously, the noise cancels and the signal clarifies. Building this convergence detection capability is the single highest-leverage investment for the Affiliate Product Graph Observatory.