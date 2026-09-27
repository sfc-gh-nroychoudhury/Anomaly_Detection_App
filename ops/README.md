# ops/ — internal QA only, never shipped

This directory is intentionally **not referenced by `manifest.yml`, `scripts/setup_script.sql`, or any file under `sql/`**. Nothing here is uploaded to the application package stage and nothing here reaches a customer account.

## Why this directory exists

The original notebook (`ML_Anomaly_Detection_Production.ipynb`) mixed real deployment logic with QA/demo steps in one file — including a step that creates a real `LEGACY_SERVICE` user with a plaintext password specifically so a human can log in and manufacture a flagged violation for demo purposes. That step must **never** ship inside anything a customer installs. This directory is where that kind of QA-only logic belongs instead: usable by whoever is testing the app in a disposable dev/sandbox account, kept structurally separate from everything that gets packaged.

## Rules for anything added here

- Never imported, sourced, or referenced by `setup_script.sql` or any `sql/*.sql` file.
- Never uploaded to an application package stage.
- Only run against disposable dev/sandbox accounts — never a real customer account, never the account used for the public/private listing's provider profile.
- If a QA script creates a real Snowflake object (a user, a role, a grant) for demo purposes, its filename must say so clearly (e.g. `qa_manufacture_demo_violation.sql`) and it must include an explicit `DROP`/teardown counterpart.

## Suggested contents (add as needed, not created yet)

- `qa_manufacture_demo_violation.sql` — creates a demo `LEGACY_SERVICE` user with a password, for exercising the `ad_login_count`/attack-chain correlation path end-to-end in a sandbox. Must ship with a matching teardown statement in the same file.
- `qa_seed_synthetic_anomalies.sql` — optional: inserts synthetic rows directly into `trust_center.anomaly_results` for UI development (Phase 3) without waiting on `ACCOUNT_USAGE` latency or a real 90-day training history.
