# ML Anomaly Detection → Hybrid Native App: Guiding Principles & Architecture

Status: living reference doc. This supersedes the original "everything inside the app" design — see §4.3 for the confirmed platform blocker that forced the hybrid split, verified against a real Snowflake account (`SFPSCOGS.VJLAMBE_AWSUSW2_DEMO`), not assumed.

---

## 1. Purpose

A hybrid architecture for the ML behavioral anomaly detection Trust Center extension:
- **Native App** (Node/Next.js-on-SPCS UI, correlation/scoring, Cortex AI narratives, Trust Center callback) — distributed via the Native App Framework's listing mechanism.
- **One external SQL script** (`external/install_external_ml.sql`) — the 20 `SNOWFLAKE.ML.ANOMALY_DETECTION` models, a single wrapper detection procedure, and the retrain task. Run once, manually, by the consumer. This is the *only* part that cannot live inside the app, and the app guides the consumer through installing and connecting it via a live-checked Setup wizard.

---

## 2. Guardrails

### 2.1 Snowflake platform guardrails

- `manifest_version: 2` always — enables Tier-1 privilege auto-grant and safe patch upgrades.
- Least privilege in `manifest.yml`'s `privileges:` block — `CREATE WAREHOUSE`, `CREATE COMPUTE POOL`, `BIND SERVICE ENDPOINT`, plus the unavoidable `IMPORTED PRIVILEGES ON SNOWFLAKE DB`. **No `EXECUTE TASK`/`EXECUTE MANAGED TASK`** — the task moved external, so the app no longer needs it.
- `IMPORTED PRIVILEGES ON SNOWFLAKE DB` is permanently Tier 3 (confirmed against Snowflake docs, Sept 2026).
- **`SNOWFLAKE.ML.ANOMALY_DETECTION` (Class objects) cannot be created inside a Native App's own database — confirmed empirically** (`Classes are not supported in an application`), not from documentation. This is why the models, and everything that must co-exist with them (the wrapper procedure, the retrain task), live in `external/install_external_ml.sql` instead.
- **`TASK` objects are not supported inside a versioned schema** — confirmed empirically. Irrelevant to the app now (no task lives inside it), but still true and worth remembering for any future in-app task.
- All stateless SQL logic inside the app lives in `CREATE OR ALTER VERSIONED SCHEMA` (`trust_center`, `config`, `ml_behavioral_anomaly_check`, `core`) for safe patch upgrades. `services` (hosting the compute pool/service) is deliberately plain — services cannot live in a versioned schema either.
- Native App `references:` only support object types `TABLE`, `VIEW`, `EXTERNAL TABLE`, `FUNCTION`, `PROCEDURE`, `WAREHOUSE`, `API INTEGRATION`, `EXTERNAL ACCESS INTEGRATION`, `SECRET` — no `SCHEMA`/`DATABASE`, and no ML-model type. **A `PROCEDURE`-type reference was tried first and cannot actually be invoked at all** — confirmed empirically: `CALL reference('x')(:arg)` is a syntax error, and `SELECT ... FROM TABLE(reference('x')(:arg))` fails to resolve ("Unknown table function"). Only `TABLE`/`VIEW`-type references support the documented `SELECT * FROM reference('x')` query pattern. So the external script materializes results into a **`TABLE`** (`external_detection` → `MODELS.DETECTION_RESULTS`), refreshed every 6 hours by an external task, instead of exposing a callable procedure.
- Native Apps **do not permit `CREATE TEMPORARY TABLE` at all** — confirmed empirically (`Operation CREATE on TEMPORARY TABLE is not permitted within APPLICATION`), even in a plain (non-versioned) schema. Use a regular table instead for scratch/intermediate results inside app procedures; `CREATE OR REPLACE TABLE` works fine, including at runtime inside a versioned schema.
- `res := (CALL some_proc(...))` captures a stored procedure's `RETURNS TABLE` result into a `RESULTSET` variable, but that variable can only be consumed via `RETURN TABLE(res)` — it is **not** valid inside a general `SELECT`/`INSERT` (`INSERT INTO t SELECT * FROM TABLE(res)` fails to parse). To move a procedure's row output into a table, either return it from the outermost caller boundary only, or (simpler, used here) duplicate the underlying per-signal `INSERT ... FROM TABLE(model!DETECT_ANOMALIES(...))` statements directly against the target table.
- There is no documented `SYSTEM$` getter to check whether a reference is currently bound (`SYSTEM$GET_REFERENCE` does not exist, confirmed empirically) — the only reliable check is attempting the real query against the reference and catching the error.
- Never hardcode application/package/account names or local file paths — resolve via `CURRENT_DATABASE()` at runtime.
- Privileges and references can't change in a patch release — only in a major version.
- Container images are immutable once added to a version — every UI change needs a new `ADD VERSION`/patch.
- **The SPCS image repository must be created directly on the APPLICATION PACKAGE, before the first version is ever registered** — confirmed empirically. `CREATE SERVICE` (run inside the setup script at install time) needs the image repository, and a real pushed image, to already exist at `manifest.yml`'s exact path — but a repo created *by that same setup script* wouldn't exist yet on first install (`Image repository '<PKG>.SERVICES.APP_IMAGE_REPO' does not exist`). Fix: the provider creates the repo once, directly on the package (`CREATE SCHEMA IF NOT EXISTS <pkg>.services; CREATE IMAGE REPOSITORY IF NOT EXISTS <pkg>.services.app_image_repo;`), builds/pushes the image there, and only then registers a version whose manifest declares `container_services`.
- **`GRANT MONITOR, OPERATE ON SERVICE` is not sufficient for `SHOW ENDPOINTS`/`SYSTEM$WAIT_FOR_SERVICES`** — confirmed empirically (`Insufficient privileges ... must have USAGE granted`). Also grant `USAGE` to the app role that needs to inspect the service.
- No local container runtime is a solvable environment gap, not a hard blocker: `brew install colima docker docker-buildx`, `colima start`, then add `cliPluginsExtraDirs: ["/opt/homebrew/lib/docker/cli-plugins"]` to `~/.docker/config.json` so the `buildx` plugin resolves. Fully scriptable, no Docker Desktop GUI required.
- SPCS service endpoints marked `public: true` are still gated behind Snowflake's own account SSO (redirect to `sfc-endpoint-login.snowflakecomputing.app/sfc-oauth-begin`) — `public` means externally routable without a private network path, not unauthenticated. A `302` there on `/api/health` is the expected, healthy response, not an error.

### 2.2 Distribution guardrails

- Prefer a public Marketplace listing once proven, specifically because public installs get automatic Trust Center registration (confirmed in Snowflake docs) — private/targeted listings require the consumer to manually run `REGISTER_EXTENSION`. Start private (`listing/listing_manifest.yml`) for a controlled pilot; the same application package can back a public listing later.
- Never ship demo/QA logic that mutates real security state inside anything a customer installs — see `ops/README.md`.
- The `privileges:`/`references:` `description:` text in `manifest.yml` is real consumer-facing UX (shown in Snowsight's native access-request banner), not decoration. `description` has a hard 200-character limit (confirmed empirically) — keep it terse.

### 2.3 AI-assisted / agentic build guardrails

- Plan → confirm → implement → verify, per phase.
- Dev account first, always — see `tests/dev_account_checklist.md`.
- Idempotent, reversible steps (`CREATE OR REPLACE`, `IF EXISTS`) over one-shot irreversible actions.
- Task-tracked build (`cortex ctx task`/`step`), one ctx task per phase.
- **Verify, don't assume — and when a real test contradicts the design, redesign around the confirmed constraint rather than working around it with increasingly fragile workarounds.** This is exactly what happened here: an in-app "callable `initialize()`" procedure was tried first, showed anomalous non-persisting behavior in testing, and rather than debugging that further, the design moved the ML models out of the app entirely once the hard "Classes are not supported" blocker was found — which turned out to be the right call regardless of the `initialize()` mystery, since models can never live in the app no matter how view/task creation is sequenced.

---

## 3. Project structure (as built)

```
ml-anomaly-native-app/
├── manifest.yml                      # manifest_version 2, privileges, references (external_detection), container_services
├── tc_extension_manifest.yml         # scanner package/scanner declaration
├── README.md                         # consumer-facing: what it does, one-time setup, usage
├── external/                         # NOT part of the app package -- run manually, once
│   ├── install_external_ml.sql       # 20 ML models + DETECTION_RESULTS table + refresh proc + retrain/detect tasks
│   ├── uninstall_external_ml.sql     # teardown counterpart
│   └── README.md                     # why this exists, how to run it, how to connect it
├── scripts/
│   ├── setup_script.sql              # ASSEMBLED — do not hand-edit, see assemble.sh
│   └── assemble.sh                   # rebuilds setup_script.sql from sql/01-05, syncs frontend/public copy of the external script
├── sql/
│   ├── 01_infrastructure.sql         # versioned schema, warehouse, tables, app role (no task, no ML objects)
│   ├── 02_reference_config.sql       # config schema + register_single_reference callback
│   ├── 03_scan_procedure.sql         # RUN_ANOMALY_SCAN (calls reference('external_detection'), defensive setup-incomplete check) + Trust Center callback
│   ├── 04_cortex_ai_procs.sql        # EXPLAIN_ANOMALY / RECOMMEND_REMEDIATION / SUMMARIZE_USER_ACTIVITY
│   └── 05_service.sql                # image repo, compute pool, service, version_init callback
├── containers/
│   ├── Dockerfile                    # multi-stage Next.js standalone build
│   └── service_spec.yaml             # SPCS service spec (image path UNVERIFIED, see checklist)
├── frontend/                         # Next.js app (see frontend/README.md for design system)
│   ├── app/                          # dashboard, setup (5 checks incl. external ML), investigate/[user], exclusions, models
│   ├── components/                   # Sidebar, SetupBanner (global, every page), SeverityBadge, RiskScoreBar, ForecastChart, etc.
│   ├── public/install_external_ml.sql  # synced copy for the Setup page to serve/display (kept in sync by assemble.sh)
│   └── lib/                          # snowflake.ts (SQL API client), types.ts
├── listing/
│   └── listing_manifest.yml          # private/targeted draft
├── tests/
│   └── dev_account_checklist.md      # concrete verification steps + open questions
└── ops/
    └── README.md                     # guardrail: QA-only demo logic never ships
```

---

## 4. Technical architecture

### 4.1 Package → install → runtime flow

```
Provider account                          Consumer account
─────────────────                         ─────────────────
Application Package                       CREATE APPLICATION (from listing "Get")
  ├─ setup_script.sql  ───install/upgrade──▶  runs atomically, creates:
  ├─ manifest.yml (privileges + references)   ├─ trust_center (versioned): scan/correlation proc, Cortex AI procs, tables
  ├─ tc_extension_manifest.yml                 ├─ config (versioned): register_single_reference callback
  ├─ image repo (services.app_image_repo)      ├─ ml_behavioral_anomaly_check (versioned): TC callback
  └─ listing (private → public)                ├─ core (versioned): version_init upgrade callback
                                                ├─ services (plain): compute pool + ui_service
                                                └─ trust_center_integration_role (app role)

install_external_ml.sql (run manually, once, by consumer ACCOUNTADMIN):
  ├─ ML_ANOMALY_EXTERNAL.MODELS (new database/schema, NOT owned by the app)
  ├─ 20x SNOWFLAKE.ML.ANOMALY_DETECTION models (inline SELECT over ACCOUNT_USAGE, no view objects; each wrapped
  │    in its own error-tolerant block so a signal with no matching activity never blocks the other 19)
  ├─ MODELS.RUN_DETECTION(run_id) -- runs all 20 DETECT_ANOMALIES() calls, for direct/manual use
  ├─ MODELS.DETECTION_RESULTS -- the ONE object the app ever touches (TABLE-type reference)
  ├─ MODELS.REFRESH_DETECTION_RESULTS(run_id) -- repopulates DETECTION_RESULTS
  ├─ weekly retrain task (plain schema, external -- no versioned-schema task restriction here)
  └─ 6-hourly detection-refresh task (keeps DETECTION_RESULTS current for the app to read)

Consumer one-time actions, all live-checked + guided by the app's Setup page:
  1. Approve "IMPORTED PRIVILEGES ON SNOWFLAKE DB" access request (native Snowsight banner)
  2. GRANT APPLICATION ROLE ... TO APPLICATION snowflake  — auto-handled if public listing (unverified)
  3. CALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION(...)   — auto-handled if public listing (confirmed)
  4. Enable the scanner package in Trust Center UI (Enable → Grant → Enable) — manual on every channel
  5. Run install_external_ml.sql, then CALL config.register_single_reference(...) to bind it — manual on every channel, unavoidable (Class-object + reference-type constraints, see §2.1)
```

### 4.2 Runtime data flow

```
External weekly TASK (in ML_ANOMALY_EXTERNAL.MODELS) ──▶ retrain 20 ML models
External 6-hourly TASK ──▶ MODELS.REFRESH_DETECTION_RESULTS ──▶ MODELS.DETECTION_RESULTS (latest snapshot)
Trust Center scheduler / "Run scan" ──▶ ml_behavioral_anomaly_check.scan ──▶ trust_center.run_anomaly_scan
                                                                                     │
                                              defensive check: attempt the real query, catch any error
                                              (no SYSTEM$ getter for reference-bound state exists)
                                                     unbound?  → return one clean "setup incomplete" finding, stop.
                                                     bound?    → SELECT * FROM reference('external_detection')
                                                                        │
                                                                        ▼
                                            trust_center.anomaly_results / attack_chains (correlation/scoring happens HERE, in-app)
                                                                                     │
                          Next.js container (SPCS) ◀── SQL API (OAuth token) ────────┘
                                    │
                                    ├─ / (dashboard): risk leaderboard, SetupBanner shown globally if any check pending
                                    ├─ /investigate/[user]: forecast charts + Cortex AI actions
                                    │    (calls trust_center.explain_anomaly / recommend_remediation /
                                    │     summarize_user_activity via SQL API, not raw Cortex REST)
                                    ├─ /exclusions: CRUD on trust_center.scan_exclusions
                                    ├─ /models: external connection status + last-scored time per model (no in-app SHOW SNOWFLAKE.ML.ANOMALY_DETECTION -- can't see it, only the one bound reference)
                                    └─ /setup: live probes for all 5 consumer actions, incl. external ML connection
```

### 4.3 Confirmed platform findings (from real dev-account testing, not documentation)

These were discovered by actually installing and testing against `SFPSCOGS.VJLAMBE_AWSUSW2_DEMO` — treat as ground truth, re-verify only if targeting a materially different Snowflake edition/release:

1. **`SNOWFLAKE.ML.ANOMALY_DETECTION` cannot be created inside a Native App's own database.** `CALL initialize_models()` (a procedure inside the app) failed with `Classes are not supported in an application` — clean, reproducible, unconditional. This is *the* reason for the hybrid split.
2. **`CREATE VIEW` referencing `SNOWFLAKE.ACCOUNT_USAGE` binds eagerly** and fails at setup-script time before the `IMPORTED PRIVILEGES` grant exists (`Shared database is no longer available for use`). Moot now (no views anywhere — model `INPUT_DATA` uses inline subqueries), but worth remembering for any future view-over-shared-database design.
3. **`TASK` objects are not supported inside a versioned schema** (`Task is not supported in versioned schemas`). Confirmed with a plain top-level `CREATE TASK` statement.
4. **`ALTER TASK ... RESUME` requires the `EXECUTE TASK` privilege**, distinct from `EXECUTE MANAGED TASK` — both had to be requested for the (now-removed) in-app task to resume successfully.
5. **Manifest `privileges:`/`references:` `description:` fields have a hard 200-character limit** — exceeding it fails `ALTER APPLICATION PACKAGE ... REGISTER VERSION` with a clear compile error.
6. **Unresolved, now moot**: a callable `initialize_views()` procedure using `EXECUTE IMMEDIATE` reported success but the resulting views never persisted, reproducibly, even on a completely fresh single-shot install with no upgrade history. Root cause never isolated (possibly a script-size/statement-count ceiling triggered while iterating — a `debug_trivial_view`/`debug_trivial_table` added near the tail of an already-large ~600-line script also failed to persist with no view or ACCOUNT_USAGE involvement at all). Not investigated further since the hybrid redesign made it irrelevant — flagging here only so a future in-app "callable initializer" attempt doesn't get blindsided by the same thing.

### 4.4 Still-unverified items (carried over, lower risk than §4.3)

1. **Container-to-Snowflake auth.** `frontend/lib/snowflake.ts` assumes a mounted OAuth token at `/snowflake/session/token` and a `SNOWFLAKE_HOST` env var. Standard documented SPCS-in-Native-App pattern, not yet execute-tested (Docker unavailable in this environment).
2. **`reference('external_detection')(:run_id)` call syntax** inside `run_anomaly_scan` — the `ref-object.md` reference doc shows `reference()` used inline in `SELECT`/`CREATE VIEW`/`CREATE TASK` contexts and confirms `PROCEDURE` is a valid reference object type with `USAGE`, but does not show an explicit example of calling a *referenced procedure* this way. Verify in Phase 3 before trusting it.
3. **Image path.** The exact `<db>` segment of the SPCS image path (`/ml_anomaly_pkg/services/app_image_repo/ml_anomaly_ui:latest`) is a placeholder — confirm via `SHOW IMAGE REPOSITORIES` and update `manifest.yml` + `containers/service_spec.yaml` to match.
4. **Array bind.** `SPLIT(?, ',')` for the `signals ARRAY` parameter to `recommend_remediation` via the SQL API — confirm it binds correctly; fall back to `PARSE_JSON(?)` if not.

---

## 5. Phased build plan

| Phase | Scope | Status |
|---|---|---|
| **0** | Distribution decision + manifest privilege set finalized | Done |
| **1** | Native App skeleton, all-in-app design (SQL only) | Superseded — hit the Class-object blocker in dev-account testing |
| **2** | SPCS container + Next.js dashboard (all-in-app design) | Superseded — UI/container layer carries forward unchanged into the hybrid design |
| **2.5** | **Hybrid redesign**: external ML script (models + wrapper proc + task), in-app `references:` config, scan procedure rewritten to call the reference with a defensive fallback, 5-step Setup wizard, global SetupBanner | **Done** (scaffolded; not yet dev-account-tested) |
| **3** | Dev-account verification pass on the hybrid design | **Not started** — run `tests/dev_account_checklist.md` end-to-end, resolve §4.4's open items, most importantly the `reference()` call syntax for a `PROCEDURE` type |
| **4** | Private/targeted listing to 1–2 pilot accounts | Not started |
| **5** | Public Marketplace listing (once pilot stable) | Not started |

**Everything built so far is unverified scaffold code except the §4.3 findings, which came from real execution.** Phase 3 is the next required step — most importantly confirming the `reference('external_detection')(:run_id)` call syntax actually works, since that's the one genuinely new, never-executed piece the whole hybrid design depends on.

---

## 6. Pre-release verification checklist

See `tests/dev_account_checklist.md` for the full, itemized checklist, updated for the hybrid flow: install the app → run `external/install_external_ml.sql` → bind the reference → verify `run_anomaly_scan` end-to-end (including its defensive fallback when unbound) → Trust Center scan → container/SPCS verification → cleanup (app first, then the external script's `uninstall_external_ml.sql`).
