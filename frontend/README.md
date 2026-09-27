# Frontend — Next.js Dashboard (SPCS)

Next-gen dashboard UI for the ML Behavioral Anomaly Detection Trust Center extension, running as a container on Snowpark Container Services inside the Native App (see `../containers/` and `../sql/07_service.sql`).

## Design system

Built to look and feel like Snowflake's own product UI (Snowsight), using tokens defined in `tailwind.config.ts`:

| Token | Value | Use |
|---|---|---|
| `sf.blue` | `#29B5E8` | Primary brand/action color ("Snowflake Blue") |
| `sf.blue-dark` | `#11567F` | Hover/active states, link text |
| `sf.blue-tint` | `#E6F6FD` | Selected/active nav background |
| `sf.midnight` | `#0B1220` | Headings on light surfaces |
| `sf.ink` / `sf.slate` | `#1A1C22` / `#5B6675` | Primary / secondary text |
| `sf.mist` / `sf.line` | `#EEF3F7` / `#E1E7ED` | Page background / borders |
| `severity.*` / `risk.*` | pink/orange/amber/blue-green ramp | Severity badges and 0–100 risk score bar |

**Typography**: [Inter](https://fonts.google.com/specimen/Inter) via `next/font/google`, loaded as `--font-inter`. This is the closest freely-licensed match to Snowflake's proprietary product typeface — Snowflake's actual brand font is not redistributable, so this scaffold does not attempt to bundle or approximate it beyond a similar geometric, high-legibility sans-serif.

**Layout**: fixed left sidebar (Snowsight's own navigation pattern) + a max-width centered content column, generous whitespace, rounded `12px` cards (`.sf-card`) with a subtle shadow that deepens on hover — mirrors Snowsight's card-based object browser feel rather than a dense enterprise-BI table style.

**Logo mark**: a simple six-point line mark in `components/Sidebar.tsx`, not the official Snowflake logo (trademarked, not bundled here).

## Pages

| Route | Purpose |
|---|---|
| `/` | Risk leaderboard — 0–100 composite score, severity, attack-chain classification, filterable |
| `/setup` | Live setup wizard — checks the 3 unavoidable ACCOUNTADMIN actions and shows copy-ready SQL for whichever remain |
| `/investigate/[user]` | Per-signal forecast-vs-actual charts + on-demand Cortex AI narrative/remediation/summary |
| `/exclusions` | Self-service exclusion list management (replaces raw `INSERT`/`DELETE` SQL cells) |
| `/models` | Model health — 20 models' last-trained time + weekly retrain task status |

## Known scaffold-level gaps (see `../tests/dev_account_checklist.md`)

- `lib/snowflake.ts`'s token/host assumptions are unverified against a real SPCS-in-Native-App deployment — this is flagged as the single highest-risk item in the whole build.
- The Cortex AI actions (`explain`/`remediation`/`summary`) call the existing SQL procedures in `sql/05_cortex_ai_procs.sql` rather than the raw Cortex REST inference API — this means no true token-by-token streaming yet. A follow-up could add real SSE streaming via `/api/v2/cortex/inference:complete` using the same token, but that duplicates prompt-construction logic that already lives in SQL; not worth the added surface area for a first cut.
- `SPLIT(?, ',')` is used in `app/api/investigate/[user]/remediation/route.ts` to turn a comma-joined string bind into the `ARRAY` parameter `recommend_remediation` expects — confirm this binds correctly via the SQL API in a real deployment; if not, switch to `PARSE_JSON(?)` with a JSON-array string instead.
- No automated tests. This is UI-development-stage code, not yet verified against a live service.
