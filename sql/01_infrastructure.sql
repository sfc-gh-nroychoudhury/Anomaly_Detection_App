-- =============================================================================
-- 01_infrastructure.sql
-- Native App infrastructure: versioned schemas, warehouse, tables, app role.
--
-- IMPORTANT: unlike the original notebook, this does NOT run `CREATE DATABASE`.
-- Inside a Native App's setup script, CURRENT_DATABASE() already IS the
-- application object itself once installed -- there is no separate database
-- to create. All schemas below live inside the app.
--
-- The 20 ML models, the wrapper detection procedure, and the weekly retrain
-- task all live OUTSIDE the app (see ../external/install_external_ml.sql) --
-- SNOWFLAKE.ML.ANOMALY_DETECTION objects are Class objects, and Class objects
-- are not supported inside a Native App's own database (confirmed against a
-- real account: "Classes are not supported in an application"). This app
-- only holds a reference (sql/02_reference_config.sql) to one external
-- procedure -- no TASK, no `jobs` schema, no ML objects live here.
-- =============================================================================

-- Core schema: reference config, scan/correlation logic, Cortex AI procs, tables.
-- Versioned so it upgrades cleanly across app versions (see setup_script.sql assembly).
CREATE OR ALTER VERSIONED SCHEMA trust_center;

-- Dedicated warehouse for the scan/correlation procedure and Cortex AI calls.
-- CREATE WAREHOUSE is a Tier-1 auto-granted privilege (manifest.yml) -- no
-- consumer action required for this to succeed.
CREATE WAREHOUSE IF NOT EXISTS ml_anomaly_wh
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

-- NOTE: no `USE WAREHOUSE` here -- setup scripts run in a sandboxed context
-- that disallows session-context-changing statements (`USE ...`). None of the
-- DDL below needs an active warehouse; `ml_anomaly_wh` is only consumed later,
-- by the scan procedure and the SPCS service's QUERY_WAREHOUSE setting
-- (sql/05_service.sql).

-- Results storage for the correlation engine and Cortex AI narrative procedures.
CREATE TABLE IF NOT EXISTS trust_center.anomaly_results (
  run_id VARCHAR NOT NULL,
  run_timestamp TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  model_name VARCHAR NOT NULL,
  user_name VARCHAR NOT NULL,
  ts TIMESTAMP_NTZ NOT NULL,
  metric_value FLOAT,
  forecast FLOAT,
  lower_bound FLOAT,
  upper_bound FLOAT,
  is_anomaly BOOLEAN,
  percentile FLOAT,
  distance FLOAT
);

CREATE TABLE IF NOT EXISTS trust_center.attack_chains (
  run_id VARCHAR NOT NULL,
  run_timestamp TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  user_name VARCHAR NOT NULL,
  risk_score NUMBER(5,2),
  severity VARCHAR(10),
  signal_count NUMBER,
  signals ARRAY,
  attack_chain VARCHAR,
  timeline VARCHAR,
  anomaly_details VARIANT
);

-- Consumer-managed exclusion list (self-service, no expiry = permanent exclusion).
CREATE TABLE IF NOT EXISTS trust_center.scan_exclusions (
  entity_name VARCHAR NOT NULL,
  entity_type VARCHAR DEFAULT 'USER',
  reason VARCHAR,
  approved_by VARCHAR,
  approved_on TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  expires_on TIMESTAMP_TZ
);

-- Application role Trust Center uses to invoke the scanner callback procedure.
CREATE APPLICATION ROLE IF NOT EXISTS trust_center_integration_role;

GRANT USAGE ON SCHEMA trust_center TO APPLICATION ROLE trust_center_integration_role;
GRANT SELECT, INSERT ON TABLE trust_center.anomaly_results TO APPLICATION ROLE trust_center_integration_role;
GRANT SELECT, INSERT ON TABLE trust_center.attack_chains TO APPLICATION ROLE trust_center_integration_role;
GRANT SELECT ON TABLE trust_center.scan_exclusions TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Infrastructure ready.' AS status;
