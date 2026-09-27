# ML Behavioral Anomaly Detection — Trust Center Extension

ML-powered, per-user behavioral anomaly detection for Snowflake accounts. Trains 20 `SNOWFLAKE.ML.ANOMALY_DETECTION` models on 90 days of account activity, correlates anomalies across signals into attack-chain classifications, and surfaces everything through an in-app dashboard (Node/Next.js, running on Snowpark Container Services) plus Cortex AI-generated narrative explanations.

This is a genuine anomaly-detection app (per-user adaptive baselines via ML forecasting), not a fixed-threshold rule scanner — it complements rule-based Trust Center scanners rather than replacing them.

## What it detects

20 models across 6 categories, each comparing a user's current activity to their own 90-day forecasted baseline (not a single fixed threshold for everyone):

| Category | Signals | MITRE Tactics |
|---|---|---|
| Authentication | login count, failed auth, distinct IPs, client diversity | Initial Access, Credential Access |
| Data Exfiltration | query volume, bytes scanned, bytes-to-result, rows unloaded, network egress | Collection, Exfiltration |
| Reconnaissance | DB breadth, table breadth, failed queries | Discovery |
| Privilege Escalation | role usage, DDL operations, grant operations | Privilege Escalation, Persistence |
| Insider Threat | data staging, outbound transfer, external function calls | Collection, Staging |
| Resource Abuse | warehouse credits, warehouse queries | Impact |

## One-time setup (required after installing the app)

Snowflake's security model requires a few manual, one-time steps from an ACCOUNTADMIN — these cannot be automated by any app, by design:

1. **Grant `IMPORTED PRIVILEGES ON SNOWFLAKE DB`** to this application. Snowsight shows this as a pending access request after install (Apps → this app → "Grant privileges"), or run directly:
   ```sql
   GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE TO APPLICATION <this_app_name>;
   ```
2. **Grant the app's Trust Center role to Snowflake:**
   ```sql
   GRANT APPLICATION ROLE <this_app_name>.trust_center_integration_role TO APPLICATION snowflake;
   ```
   (If you installed from the Snowflake Marketplace as a public listing, this step and step 3 below may already be handled automatically — check `SELECT * FROM SNOWFLAKE.TRUST_CENTER.EXTENSIONS` first.)
3. **Register with Trust Center** (as a role with `SNOWFLAKE.TRUST_CENTER_ADMIN` granted):
   ```sql
   CALL SNOWFLAKE.TRUST_CENTER.REGISTER_EXTENSION('APPLICATION PACKAGE', '<this_package_name>', '<this_app_name>');
   ```
4. **Enable the scanner package** in Snowsight: Governance & Security → Trust Center → Scanner Packages → select "ML Behavioral Anomaly Detection" → Enable package → Grant → Enable.

Open the app's dashboard (Snowsight → Apps → this app) at any time — the **Setup** page live-checks all 4 steps and shows exactly what's left, with copy-ready SQL for steps 1–3.

## Using the app

- **Dashboard**: composite 0–100 risk score leaderboard, attack-chain classification per flagged user.
- **Investigate**: per-signal actual-vs-forecast charts, Cortex AI narrative explanation and remediation steps for any flagged user.
- **Exclusions**: manage the approved-exception list (with optional expiry) without writing SQL.
- **Model health**: last retrain time, training data volume, and any models skipped during training per model.

Model retraining runs automatically every week via a serverless task. The scan itself runs on Trust Center's own schedule (or on demand via "Run scan now" in the app).

## Data handling

All data stays in your account. The app reads `SNOWFLAKE.ACCOUNT_USAGE` (via the `IMPORTED PRIVILEGES` grant above) and writes only to schemas it owns. Cortex AI narrative/remediation calls use `SNOWFLAKE.CORTEX.COMPLETE`, which also runs entirely within your Snowflake account.
