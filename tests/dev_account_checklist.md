# Dev Account Verification Checklist — Hybrid Architecture

Run every item in a **disposable dev account**, never against a real customer. Verified against `SFPSCOGS.VJLAMBE_AWSUSW2_DEMO`. Two platform findings from the original hybrid design were disproven during this pass and are called out below — the reference type changed from `PROCEDURE` to `TABLE` as a result (see `docs/ARCHITECTURE.md` §2.1).

## 1. Package & install (app only — external script is separate, §2)

- [x] `CREATE APPLICATION PACKAGE ml_anomaly_pkg;`
- [x] Upload `manifest.yml`, `README.md`, `scripts/setup_script.sql` to the package stage. For a SQL-only test (no container image yet), use `manifest.sql_only_test.yml` (drops `container_services`/`default_web_endpoint`/`lifecycle_callbacks`) and a setup script assembled from `sql/01-04` only (`sql/05_service.sql` needs a real image).
- [x] Manifest's `references:` block registers cleanly with `object_type: TABLE` (the originally-planned `PROCEDURE` type does not work at all — see §4 below).
- [x] `ALTER APPLICATION PACKAGE ml_anomaly_pkg REGISTER VERSION v1 USING '@stage_path';` (release channels are enabled on this account — use REGISTER/DEREGISTER, not ADD/DROP VERSION)
- [x] `CREATE APPLICATION ml_anomaly_app FROM APPLICATION PACKAGE ml_anomaly_pkg USING VERSION v1;`
- [x] `setup_script.sql` ran without error (`upgrade_state: COMPLETE`)
- [x] Re-ran `ALTER APPLICATION ml_anomaly_app UPGRADE USING VERSION v1;` a second time — idempotent, `COMPLETE` again

## 2. External ML install

- [x] Ran `external/install_external_ml.sql`'s model-training section end-to-end. **18 of 20 models trained; 2 (`ad_rows_unloaded`, `ad_outbound_transfer`) hit `[MLUserError] input_data is empty`** on this quiet dev account (no unloads, no outbound transfer in the last 90 days) — expected on a low-activity account, not a bug. Fixed by wrapping every `CREATE OR REPLACE SNOWFLAKE.ML.ANOMALY_DETECTION` statement in its own `BEGIN...EXCEPTION WHEN OTHER THEN NULL` block inside `MODELS.train_all_models()`, which reports exactly how many trained vs. were skipped and why. `CONFIG_OBJECT => {'ON_ERROR':'SKIP'}` does **not** prevent this class of failure (confirmed) — it only tolerates per-series issues during otherwise-successful training, not a completely empty input table.
- [x] `SHOW SNOWFLAKE.ML.ANOMALY_DETECTION IN SCHEMA ML_ANOMALY_EXTERNAL.MODELS;` — 18 of 20 models present (2 legitimately skipped, will retrain automatically once matching activity appears)
- [x] `CALL ML_ANOMALY_EXTERNAL.MODELS.RUN_DETECTION('dev-test-001');` — returns 223 real rows including flagged anomalies (e.g. `ad_bytes_scanned` at 59GB vs. ~1GB forecast), called directly outside the app
- [x] `SHOW TASKS IN SCHEMA ML_ANOMALY_EXTERNAL.MODELS;` — both `ML_ANOMALY_RETRAIN_TASK` (weekly) and `ML_ANOMALY_DETECT_TASK` (6-hourly) show `started`
- [x] `CALL ML_ANOMALY_EXTERNAL.MODELS.REFRESH_DETECTION_RESULTS(...)` populates `MODELS.DETECTION_RESULTS` (227 rows) — this is the table the app's reference actually points at

## 3. Consumer one-time setup

- [x] `GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION ml_anomaly_app;`
- [x] `GRANT APPLICATION ROLE ml_anomaly_app.trust_center_integration_role TO APPLICATION snowflake;`
- [x] `CALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION('APPLICATION PACKAGE', 'ml_anomaly_pkg', 'ml_anomaly_app');` — succeeded
- [x] Confirmed via `SELECT * FROM SNOWFLAKE.TRUST_CENTER.EXTENSIONS WHERE NAME = 'ML_ANOMALY_APP';` — `REGISTRATION_STATE = COMPLETE`
- [ ] Enable the scanner package in Snowsight: Trust Center → Scanner Packages → "ML Behavioral Anomaly Detection" → Enable → Grant → Enable. **No SQL equivalent exists** (checked `SHOW PROCEDURES IN SCHEMA SNOWFLAKE.TRUST_CENTER` — no enable/state-toggle procedure) — this step is genuinely Snowsight-UI-only, confirmed via `SNOWFLAKE.TRUST_CENTER.SCANNER_PACKAGES` showing `STATE = FALSE` for our package with no other lever found. Not blocking: the underlying scan logic is independently verified in §5/§6 below via direct calls.
- [x] Bind the reference — **note the object type is `TABLE`, not `PROCEDURE`** (see §4):
      `CALL ml_anomaly_app.config.register_single_reference('EXTERNAL_DETECTION', 'ADD', SYSTEM$REFERENCE('TABLE', 'ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS', 'PERSISTENT', 'SELECT'));`
- [x] Confirmed bound: `run_anomaly_scan` returns real findings only after this call, `ML_SETUP_INCOMPLETE` before it (see §5)

## 4. Reference invocation — two designs tried, one worked

- [x] **First design (PROCEDURE-type reference) — confirmed broken, both invocation forms fail:**
      - `CALL reference('external_detection')(:run_id)` → **syntax error** (`unexpected ')'`) — `CALL` does not accept a `reference()` expression as its target, even though `res := (CALL some_actual_proc_name(:run_id))` works fine for a real identifier.
      - `SELECT * FROM TABLE(reference('external_detection')(:run_id))` → parses, but fails at runtime with `Unknown table function "<unresolved_identifier>"` for a `PROCEDURE`-type reference.
      - Snowflake's own reference docs (`ref-object.md`) show Queries/Tasks/Views/External Functions/Row Access Policy examples for other types but conspicuously no Procedure-invocation example — consistent with this not being a supported pattern at all.
- [x] **Second design (TABLE-type reference) — confirmed working:** materialize the external procedure's output into a table (`MODELS.DETECTION_RESULTS`, refreshed by a task), then `SELECT * FROM reference('external_detection')` inside the app — this is exactly the documented pattern (`SELECT * FROM reference('consumer_table') WHERE ...`) and works with zero surprises.
- [x] Bonus finding along the way: `res := (CALL proc())` captures a `RESULTSET`, but that variable is **only** consumable via `RETURN TABLE(res)` — using it inside `INSERT INTO t SELECT * FROM TABLE(res)` is a syntax error. Fixed by having `MODELS.refresh_detection_results` duplicate the same per-model `INSERT ... FROM TABLE(model!DETECT_ANOMALIES(...))` pattern directly, rather than trying to relay another procedure's resultset.

## 5. Data & scan verification (app side)

- [x] `CALL ml_anomaly_app.trust_center.run_anomaly_scan('dev-test-008');` **before** binding the reference — returned the clean `ML_SETUP_INCOMPLETE` finding, not a raw error
- [x] Same call **after** binding (`dev-test-006`) — returned a real `CRITICAL` finding: user `VLAMBE`, risk_score 90, attack_chain `insider_data_theft`, 5 correlated signals (`ad_bytes_scanned`, `ad_bytes_to_result`, `ad_network_egress`, `ad_db_breadth`, `ad_ddl_operations`)
- [x] `CALL ml_anomaly_app.ml_behavioral_anomaly_check.scan('dev-test-007');` — identical result, confirms the Trust Center callback wrapper works
- [x] `SELECT * FROM ml_anomaly_app.trust_center.attack_chains ORDER BY run_timestamp DESC LIMIT 20;` — both test runs persisted correctly
- [x] `CALL ml_anomaly_app.trust_center.explain_anomaly('VLAMBE');` — returned a coherent, specific Cortex AI narrative referencing the actual anomalous values

## 6. Trust Center end-to-end

- [x] `CALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION(...)` — succeeded, `EXTENSIONS` shows `COMPLETE`
- [ ] `CALL SNOWFLAKE.TRUST_CENTER.EXECUTE_SCANNER('APPLICATION PACKAGE', 'ml_anomaly_pkg', 'ml_behavioral_anomaly_pkg', 'ml_behavioral_anomaly');` — blocked on the Snowsight-UI-only scanner-package-enable step in §3; `SCANNER_PACKAGES` view confirms our package is registered (`EXTENSION_NAME = ML_ANOMALY_APP`, `STATE = FALSE`) and would need enabling first. The scanner *logic* itself is independently proven via §5's direct callback test.

## 7. Container/SPCS verification

- [x] **Environment note**: this machine had no container runtime. Installed `colima` + `docker` + `docker-buildx` via Homebrew (`brew install colima docker docker-buildx`, `colima start`), then added `cliPluginsExtraDirs` to `~/.docker/config.json` so the `buildx` plugin resolves. Fully scriptable, no GUI needed.
- [x] **Key finding, not in the original design**: the image repository must be created directly on the **APPLICATION PACKAGE** itself (a provider-side, pre-install object) — `CREATE SCHEMA IF NOT EXISTS ml_anomaly_pkg.services; CREATE IMAGE REPOSITORY IF NOT EXISTS ml_anomaly_pkg.services.app_image_repo;`. It **cannot** be created inside the running app's own setup script (as `sql/05_service.sql` originally did) — `CREATE SERVICE` needs the repo (and a real pushed image) to exist at the manifest's exact path *before* the app can even complete its first install, which is a chicken-and-egg problem if the repo only gets created by that same setup script. Fixed by removing the `CREATE IMAGE REPOSITORY` line from `sql/05_service.sql` and documenting the provider-side creation step in both that file's header and `containers/Dockerfile`'s build comment.
- [x] `SHOW IMAGE REPOSITORIES IN SCHEMA ml_anomaly_pkg.services;` → `repository_url = sfpscogs-vjlambe-awsusw2-demo.registry.snowflakecomputing.com/ml_anomaly_pkg/services/app_image_repo` — matches `manifest.yml`'s `/ml_anomaly_pkg/services/app_image_repo/ml_anomaly_ui:latest` exactly (both agree; also bumped `next` from a vulnerable `14.2.5` to the latest patched `14.2.35` and generated a committed `package-lock.json`)
- [x] Authenticated via a user-generated PAT stored through `/secrets` (not typed in chat), `docker login <registry_hostname> -u <user> --password-stdin`, created a `docker-container` buildx builder *after* login (credential-copy ordering matters), then `docker buildx build --platform linux/amd64 --push` — confirmed via `SHOW IMAGES IN IMAGE REPOSITORY ml_anomaly_pkg.services.app_image_repo;`
- [x] Registered `v2` with the full manifest (`container_services`/`default_web_endpoint`/`lifecycle_callbacks` restored) — `upgrade_state: COMPLETE` on the first try once the repo/image existed
- [x] `SHOW COMPUTE POOLS;` — `ML_ANOMALY_APP_UI_POOL` state `ACTIVE`
- [x] `DESCRIBE SERVICE services.ui_service;` — `status: RUNNING`, `current_instances = target_instances = min_ready_instances = 1` (readiness probe passing); `SYSTEM$GET_SERVICE_LOGS` shows a clean Next.js startup (`✓ Ready in 79ms`)
- [x] `SHOW ENDPOINTS IN SERVICE services.ui_service;` — resolved to `https://aullrl-sfpscogs-vjlambe-awsusw2-demo.snowflakecomputing.app`; `/api/health` returns `302` to Snowflake's own SSO gate (`sfc-endpoint-login.snowflakecomputing.app/sfc-oauth-begin`) — this is the **expected** behavior for every SPCS ingress endpoint (`public: true` means externally reachable, not unauthenticated), not an error
- [ ] Open the endpoint URL directly (requires an interactive SSO login this environment's sandboxed browser automation couldn't complete — `net::ERR_BLOCKED_BY_CLIENT` on the dynamically-generated SPCS domain) and visually confirm the dashboard loads
- [x] Confirmed the container can query Snowflake as itself: `run_anomaly_scan` still returns the same real `CRITICAL` finding after the full container deploy, proving the reference binding and app-owned procedures survived the upgrade
- [ ] Confirm the Setup page shows all 5 checks correctly in both the unbound and bound states, and that `SetupBanner` appears/disappears correctly across page navigations — needs the interactive visual check above (the underlying SQL each check performs was independently verified working via direct calls)
- [ ] Confirm `/models` shows `connected: false` before binding and `connected: true` + real `lastRun` timestamps after a scan runs — same visual-check dependency
- [x] Needed one extra grant not in the original design: `GRANT USAGE ON SERVICE services.ui_service` (in addition to `MONITOR, OPERATE`) to `trust_center_integration_role`, added via `ALTER APPLICATION PACKAGE ... ADD PATCH` — required for `SHOW ENDPOINTS`/`SYSTEM$WAIT_FOR_SERVICES` to succeed for anyone besides the app owner
- [x] Called `core.version_init()` directly — executed `ALTER SERVICE ... FROM SPECIFICATION_FILE` + `SYSTEM$WAIT_FOR_SERVICES` and returned `"ui_service upgraded and healthy."`; this callback also ran automatically (per `lifecycle_callbacks.version_initializer`) during both the `v2` install and the patch-1 upgrade, both of which reached `upgrade_state: COMPLETE`

## 8. Cleanup after each test cycle

- [ ] `DROP APPLICATION ml_anomaly_app CASCADE;`
- [ ] `DROP APPLICATION PACKAGE ml_anomaly_pkg;`
- [ ] Confirm no orphaned warehouse (`ml_anomaly_wh`) remains after drop
- [ ] Run `external/uninstall_external_ml.sql` — the external objects are NOT owned by the app and will NOT be removed by dropping it (drops `ML_ANOMALY_EXTERNAL` database and both tasks)

**Note**: as of this pass, the app/package/external objects from §1-§6 were intentionally left live in the dev account to support the container testing in §7 without redoing the SQL setup. Run §8 before considering this account "clean" again.
