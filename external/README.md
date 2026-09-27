# External ML install — why this exists, and how to use it

## Why this is separate from the app

`SNOWFLAKE.ML.ANOMALY_DETECTION` objects are Snowflake "Class" objects. Snowflake's Native App Framework does not support creating Class objects inside an application's own database — confirmed empirically against a real Snowflake account (`Classes are not supported in an application`), not assumed from documentation. This is the **only** part of the whole system that cannot live inside the Native App.

Everything else — the correlation/risk-scoring engine, Cortex AI narrative/remediation/summary generation, the Trust Center scanner callback, the exclusion list, and the entire dashboard UI — lives entirely inside the app and requires no manual SQL.

## What this installs

Running `install_external_ml.sql` once, as ACCOUNTADMIN, creates exactly:
- `ML_ANOMALY_EXTERNAL.MODELS` — a schema in a new, dedicated database
- 20 `SNOWFLAKE.ML.ANOMALY_DETECTION` models (each trained on an inline `SELECT` over `SNOWFLAKE.ACCOUNT_USAGE` — no separate view objects), each wrapped in its own error-tolerant block so a signal with no matching activity (e.g. a quiet account with zero unloads) never blocks the other 19 from training
- `MODELS.RUN_DETECTION(run_id VARCHAR)` — a procedure that runs all 20 `DETECT_ANOMALIES()` calls and returns the raw per-signal rows, useful for direct/manual testing
- `MODELS.DETECTION_RESULTS` — a table holding the latest detection run's raw rows. **This is the only object the app ever touches.** A Native App cannot invoke a referenced PROCEDURE at all (confirmed against a real account: `CALL reference('x')(:arg)` is a syntax error, and `SELECT ... FROM TABLE(reference('x')(:arg))` fails to resolve) — only TABLE/VIEW-type references support the documented `SELECT * FROM reference('x')` pattern, so results are materialized here instead of being computed live inside the app's scan.
- `MODELS.REFRESH_DETECTION_RESULTS(run_id VARCHAR)` — repopulates `DETECTION_RESULTS`
- A weekly retrain task (`ML_ANOMALY_RETRAIN_TASK`) and a 6-hourly detection-refresh task (`ML_ANOMALY_DETECT_TASK`)

## What to do after running it

1. Run `install_external_ml.sql` as ACCOUNTADMIN (Snowsight worksheet or SnowSQL — no local files needed, it's plain SQL).
2. Open the Native App's **Setup** page — it live-checks whether this step is done and shows you the exact command for step 3 below, pre-filled with your app's real name.
3. Bind the app's reference to `MODELS.DETECTION_RESULTS`, as ACCOUNTADMIN:
   ```sql
   CALL <your_app_name>.config.register_single_reference(
     'EXTERNAL_DETECTION', 'ADD',
     SYSTEM$REFERENCE('TABLE', 'ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS', 'PERSISTENT', 'SELECT'));
   ```
4. Refresh the Setup page — once bound, this step shows complete and the dashboard starts working.

## Removing it

Run `uninstall_external_ml.sql` as ACCOUNTADMIN. Do this before dropping the app if you want a fully clean account — the app dropping does not remove these objects, since it never owned them.
