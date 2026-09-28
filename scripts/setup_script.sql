-- =============================================================================
-- setup_script.sql
-- Assembled from sql/01_*.sql through sql/08_*.sql -- DO NOT hand-edit this file.
-- Edit the source files in sql/ and reassemble instead, so this stays diffable
-- and every section traces back to a single source of truth.
-- =============================================================================

-- ---- BEGIN sql/01_infrastructure.sql ----
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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE trust_center.scan_exclusions TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Infrastructure ready.' AS status;
-- ---- END sql/01_infrastructure.sql ----

-- ---- BEGIN sql/02_reference_config.sql ----
-- =============================================================================
-- 02_reference_config.sql
-- Manifest reference config: this app requests access to exactly ONE
-- consumer-owned object -- MODELS.DETECTION_RESULTS in the external ML
-- database (see ../external/install_external_ml.sql and manifest.yml's
-- `references:` block). Standard single-value reference callback pattern.
-- =============================================================================

CREATE OR ALTER VERSIONED SCHEMA config;

CREATE OR REPLACE PROCEDURE config.register_single_reference(
  ref_name STRING, operation STRING, ref_or_alias STRING
)
  RETURNS STRING
  LANGUAGE SQL
AS
$$
BEGIN
  CASE (operation)
    WHEN 'ADD' THEN
      SELECT SYSTEM$SET_REFERENCE(:ref_name, :ref_or_alias);
    WHEN 'REMOVE' THEN
      SELECT SYSTEM$REMOVE_REFERENCE(:ref_name, :ref_or_alias);
    WHEN 'CLEAR' THEN
      SELECT SYSTEM$REMOVE_ALL_REFERENCES(:ref_name);
    ELSE
      RETURN 'unknown operation: ' || operation;
  END CASE;
  RETURN NULL;
END;
$$;

GRANT USAGE ON SCHEMA config TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE config.register_single_reference(STRING, STRING, STRING) TO APPLICATION ROLE trust_center_integration_role;
-- ---- END sql/02_reference_config.sql ----

-- ---- BEGIN sql/03_scan_procedure.sql ----
-- =============================================================================
-- 03_scan_procedure.sql
-- Core scan procedure (correlation/attack-chain engine over raw detection
-- data pulled from ONE external reference), plus the Trust Center scanner
-- callback wrapper required by tc_extension_manifest.yml (schema:
-- ml_behavioral_anomaly_check, procedure: scan, exactly as declared there).
--
-- The 20 individual DETECT_ANOMALIES() calls, and the wrapper procedure that
-- used to run them on demand, now live in
-- ../external/install_external_ml.sql -- SNOWFLAKE.ML.ANOMALY_DETECTION
-- objects cannot exist inside this app's own database ("Classes are not
-- supported in an application", confirmed against a real account), and a
-- Native App cannot invoke a referenced PROCEDURE either way (CALL
-- reference('x')(:arg) is a syntax error; SELECT ... FROM
-- TABLE(reference('x')(:arg)) fails to resolve -- both confirmed against a
-- real account). So the external script materializes results into a TABLE
-- (MODELS.detection_results, refreshed every 6 hours by an external task),
-- and this procedure reads it via a plain SELECT through a TABLE-type
-- reference (manifest.yml `references:` block, sql/02_reference_config.sql)
-- and does everything else -- correlation, risk scoring, attack-chain
-- classification, Trust Center formatting -- itself.
-- =============================================================================

CREATE OR REPLACE PROCEDURE trust_center.run_anomaly_scan(run_id VARCHAR)
  RETURNS TABLE(risk_id VARCHAR, risk_name VARCHAR, total_at_risk_count NUMBER, scanner_type VARCHAR, risk_description VARCHAR, suggested_action VARCHAR, impact VARCHAR, severity VARCHAR, at_risk_entities ARRAY)
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE
  res RESULTSET;
BEGIN
  -- Regular (non-temporary) scratch table: Native Apps do not permit
  -- CREATE TEMPORARY TABLE at all ("not permitted within APPLICATION",
  -- confirmed against a real account) -- a plain table, overwritten on
  -- every run, works fine here since nothing needs true session isolation.
  CREATE OR REPLACE TABLE _anomaly_raw (MODEL_NAME VARCHAR, SERIES VARCHAR, TS TIMESTAMP_NTZ, Y FLOAT, FORECAST FLOAT, LOWER_BOUND FLOAT, UPPER_BOUND FLOAT, IS_ANOMALY BOOLEAN, PERCENTILE FLOAT, DISTANCE FLOAT);

  -- Defensive check, run on EVERY invocation (both the app's own "Run scan
  -- now" button and Trust Center's own scheduler hit this same procedure) --
  -- if the consumer hasn't finished the external ML setup + reference bind
  -- yet, this SELECT raises an unbound-reference error (there is no
  -- documented SYSTEM$ getter to pre-check reference binding state,
  -- confirmed against a real account), so catch it here and return one
  -- clean, actionable, non-alarming finding instead of a raw SQL error
  -- every time the scanner fires.
  BEGIN
    INSERT INTO _anomaly_raw
      SELECT model_name, series, ts, y, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance
      FROM reference('external_detection');
  EXCEPTION
    WHEN OTHER THEN
      res := (
        SELECT 'ML_SETUP_INCOMPLETE'::VARCHAR AS risk_id,
          'ML Anomaly Detection Setup Incomplete'::VARCHAR AS risk_name,
          0::NUMBER AS total_at_risk_count,
          'VULNERABILITY'::VARCHAR AS scanner_type,
          'This scanner requires a one-time external setup step that has not been completed yet.'::VARCHAR AS risk_description,
          'Open the app dashboard and complete the remaining steps on the Setup page.'::VARCHAR AS suggested_action,
          'No anomaly detection is running until setup is finished.'::VARCHAR AS impact,
          'LOW'::VARCHAR AS severity,
          ARRAY_CONSTRUCT()::ARRAY AS at_risk_entities
      );
      RETURN TABLE(res);
  END;

  -- Persist raw anomaly results for the Cortex AI procedures (04_cortex_ai_procs.sql) to read later.
  INSERT INTO trust_center.anomaly_results (run_id, model_name, user_name, ts, metric_value, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance)
  SELECT :run_id, MODEL_NAME, SERIES, TS, Y, FORECAST, LOWER_BOUND, UPPER_BOUND, IS_ANOMALY, PERCENTILE, DISTANCE FROM _anomaly_raw;

  -- Correlation engine: combine which of the 20 signals fired per user into a
  -- composite risk score and an attack-chain classification. Unchanged from
  -- the original design.
  CREATE OR REPLACE TABLE _correlated AS
  WITH anomalies_only AS (
    SELECT * FROM _anomaly_raw
    WHERE IS_ANOMALY = TRUE
      AND DISTANCE > 0  -- only ABOVE-bound anomalies (more than expected); below-bound is just quiet, not suspicious
      AND SERIES NOT IN ('SYSTEM', 'SNOWFLAKE')
      AND SERIES NOT IN (SELECT ENTITY_NAME FROM trust_center.scan_exclusions WHERE ENTITY_TYPE = 'USER' AND (EXPIRES_ON IS NULL OR EXPIRES_ON > CURRENT_TIMESTAMP()))
  ),
  model_weights AS (
    SELECT column1 AS model_name, column2 AS category, column3 AS base_severity_score FROM VALUES
    ('ad_login_count','authentication',20),('ad_failed_auth','authentication',30),('ad_distinct_ips','authentication',35),('ad_client_diversity','authentication',25),
    ('ad_query_volume','data_access',20),('ad_bytes_scanned','exfiltration',40),('ad_bytes_to_result','exfiltration',45),('ad_rows_unloaded','exfiltration',50),('ad_network_egress','exfiltration',45),
    ('ad_db_breadth','reconnaissance',30),('ad_table_breadth','reconnaissance',30),('ad_failed_queries','reconnaissance',25),
    ('ad_role_usage','privilege_escalation',35),('ad_ddl_operations','privilege_escalation',40),('ad_grant_operations','privilege_escalation',50),
    ('ad_data_staging','insider_threat',35),('ad_outbound_transfer','exfiltration',50),('ad_ext_function_calls','exfiltration',45),
    ('ad_warehouse_credits','resource_abuse',25),('ad_warehouse_queries','resource_abuse',20)
  ),
  per_entity AS (
    SELECT a.SERIES AS entity_name, COUNT(DISTINCT a.MODEL_NAME) AS signal_count, ARRAY_AGG(DISTINCT a.MODEL_NAME) AS signals, ARRAY_AGG(DISTINCT mw.category) AS categories,
      SUM(mw.base_severity_score) AS raw_score, MAX(a.DISTANCE) AS max_distance, MIN(a.TS) AS first_anomaly, MAX(a.TS) AS last_anomaly,
      ARRAY_AGG(OBJECT_CONSTRUCT('model',a.MODEL_NAME,'timestamp',TO_VARCHAR(a.TS),'actual',a.Y,'forecast',a.FORECAST,'distance',a.DISTANCE)) AS anomaly_details
    FROM anomalies_only a JOIN model_weights mw ON a.MODEL_NAME = mw.model_name GROUP BY a.SERIES
  ),
  classified AS (
    SELECT entity_name, signal_count, signals, categories,
      GREATEST(0, LEAST(100, ROUND((raw_score/10.0) + (LEAST(max_distance,10)*3) + (signal_count*8), 1))) AS risk_score,
      CASE WHEN ARRAY_CONTAINS('exfiltration'::VARIANT,categories) AND ARRAY_CONTAINS('authentication'::VARIANT,categories) THEN 'credential_theft_exfiltration'
           WHEN ARRAY_CONTAINS('exfiltration'::VARIANT,categories) AND ARRAY_CONTAINS('reconnaissance'::VARIANT,categories) THEN 'insider_data_theft'
           WHEN ARRAY_CONTAINS('privilege_escalation'::VARIANT,categories) AND ARRAY_CONTAINS('reconnaissance'::VARIANT,categories) THEN 'privilege_escalation_attack'
           WHEN ARRAY_CONTAINS('authentication'::VARIANT,categories) AND signal_count >= 3 THEN 'account_takeover'
           WHEN ARRAY_CONTAINS('exfiltration'::VARIANT,categories) THEN 'data_exfiltration'
           WHEN ARRAY_CONTAINS('privilege_escalation'::VARIANT,categories) THEN 'privilege_abuse'
           WHEN ARRAY_CONTAINS('reconnaissance'::VARIANT,categories) THEN 'reconnaissance_activity'
           WHEN ARRAY_CONTAINS('resource_abuse'::VARIANT,categories) THEN 'resource_hijacking'
           ELSE 'behavioral_anomaly' END AS attack_chain,
      CASE WHEN signal_count >= 4 OR risk_score >= 80 THEN 'CRITICAL' WHEN signal_count >= 3 OR risk_score >= 60 THEN 'HIGH' WHEN signal_count >= 2 OR risk_score >= 40 THEN 'MEDIUM' ELSE 'LOW' END AS severity,
      first_anomaly, last_anomaly, anomaly_details
    FROM per_entity
  )
  SELECT * FROM classified;

  -- Persist correlated attack-chain results for the app UI to browse directly
  -- (in addition to returning them below in the Trust Center findings format).
  INSERT INTO trust_center.attack_chains (run_id, user_name, risk_score, severity, signal_count, signals, attack_chain, timeline, anomaly_details)
  SELECT :run_id, entity_name, risk_score, severity, signal_count, signals, attack_chain,
    TO_VARCHAR(first_anomaly) || ' -> ' || TO_VARCHAR(last_anomaly), anomaly_details
  FROM _correlated WHERE signal_count >= 2;

  -- Return Trust Center findings format (one row per severity level present).
  res := (
    SELECT ('ML_BEHAVIORAL_' || severity)::VARCHAR AS risk_id, ('ML-Detected Behavioral Anomaly (' || severity || ')')::VARCHAR AS risk_name,
      COUNT(*)::NUMBER AS total_at_risk_count, 'VULNERABILITY'::VARCHAR AS scanner_type,
      ('ML anomaly detection identified ' || COUNT(*) || ' entities with ' || severity || '-severity behavioral anomalies in the last 7 days.')::VARCHAR AS risk_description,
      ('Investigate flagged entities in the app dashboard. Review attack_chain and anomaly_details in entity_detail.')::VARCHAR AS suggested_action,
      ('Multi-signal anomalies indicate potential compromise, exfiltration, or insider threat.')::VARCHAR AS impact,
      severity::VARCHAR AS severity,
      ARRAY_AGG(OBJECT_CONSTRUCT('entity_id',NULL,'entity_name',entity_name,'entity_object_type','USER','entity_detail',OBJECT_CONSTRUCT('risk_score',risk_score,'signal_count',signal_count,'signals',signals,'attack_chain',attack_chain,'first_anomaly',TO_VARCHAR(first_anomaly),'last_anomaly',TO_VARCHAR(last_anomaly),'anomaly_details',anomaly_details))) AS at_risk_entities
    FROM _correlated WHERE signal_count >= 2 GROUP BY severity
    ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END
  );
  RETURN TABLE(res);
END;
$$;

GRANT USAGE ON PROCEDURE trust_center.run_anomaly_scan(VARCHAR) TO APPLICATION ROLE trust_center_integration_role;

-- Trust Center scanner callback: schema/name/version here MUST match
-- tc_extension_manifest.yml's `callback:` block exactly.
CREATE OR ALTER VERSIONED SCHEMA ml_behavioral_anomaly_check;

CREATE OR REPLACE PROCEDURE ml_behavioral_anomaly_check.scan(run_id VARCHAR)
  RETURNS TABLE(risk_id VARCHAR, risk_name VARCHAR, total_at_risk_count NUMBER, scanner_type VARCHAR, risk_description VARCHAR, suggested_action VARCHAR, impact VARCHAR, severity VARCHAR, at_risk_entities ARRAY)
  LANGUAGE SQL
AS
$$
  DECLARE res RESULTSET;
  BEGIN
    res := (CALL trust_center.run_anomaly_scan(:run_id));
    RETURN TABLE(res);
  END;
$$;

GRANT USAGE ON SCHEMA ml_behavioral_anomaly_check TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE ml_behavioral_anomaly_check.scan(VARCHAR) TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Scan procedure and Trust Center scanner callback created.' AS status;
-- ---- END sql/03_scan_procedure.sql ----

-- ---- BEGIN sql/04_cortex_ai_procs.sql ----
-- =============================================================================
-- 04_cortex_ai_procs.sql
-- Cortex AI (LLM) layer on top of the ML anomaly detection results: narrative
-- explanations, remediation steps, and activity summaries for flagged users.
-- Called on-demand from the app's Investigate page (Phase 3), not part of the
-- scheduled scan itself.
-- =============================================================================

CREATE OR REPLACE PROCEDURE trust_center.explain_anomaly(user_name VARCHAR)
  RETURNS VARCHAR
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE
  explanation VARCHAR;
  signal_summary VARCHAR;
  query_summary VARCHAR;
BEGIN
  SELECT LISTAGG(MODEL_NAME || ': actual=' || ROUND(METRIC_VALUE,1) || ' vs forecast=' || ROUND(FORECAST,1) || ' (distance=' || ROUND(DISTANCE,1) || ')', '; ')
  INTO :signal_summary
  FROM trust_center.anomaly_results
  WHERE USER_NAME = :user_name AND IS_ANOMALY = TRUE AND DISTANCE > 0 AND RUN_TIMESTAMP >= DATEADD('day', -7, CURRENT_TIMESTAMP());

  SELECT LISTAGG(DISTINCT QUERY_TYPE, ', ') INTO :query_summary
  FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
  WHERE USER_NAME = :user_name AND START_TIME >= DATEADD('day', -7, CURRENT_TIMESTAMP()) AND EXECUTION_STATUS = 'SUCCESS';

  SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2',
    'You are a security analyst. Based on the following ML anomaly detection signals for user "' || :user_name || '", write a 3-4 sentence security finding narrative. Be specific about what happened and the risk.\n\nAnomaly signals: ' || COALESCE(:signal_summary, 'none') || '\nRecent query types: ' || COALESCE(:query_summary, 'unknown') || '\n\nNarrative:'
  ) INTO :explanation;

  RETURN :explanation;
END;
$$;

CREATE OR REPLACE PROCEDURE trust_center.recommend_remediation(user_name VARCHAR, attack_chain VARCHAR, signals ARRAY)
  RETURNS VARCHAR
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE recommendation VARCHAR;
BEGIN
  SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2',
    'You are a Snowflake security expert. User "' || :user_name || '" was flagged with attack chain "' || :attack_chain || '". Signals: ' || ARRAY_TO_STRING(:signals, ', ') || '.

Return ONLY a valid JSON array of 3-5 remediation steps. No prose before or after the JSON. Each element must have exactly these keys:
- "title": short action title (5-8 words)
- "description": one sentence explanation of what to do and why
- "sql": a single Snowflake SQL command (or null if not applicable)
- "priority": "immediate", "short_term", or "long_term"

Example format:
[{"title":"Rotate user credentials","description":"Force a password reset to invalidate any stolen credentials.","sql":"ALTER USER VLAMBE SET PASSWORD = ''<new_password>'' MUST_CHANGE_PASSWORD = TRUE;","priority":"immediate"}]

JSON array:'
  ) INTO :recommendation;
  RETURN :recommendation;
END;
$$;

CREATE OR REPLACE PROCEDURE trust_center.summarize_user_activity(user_name VARCHAR, days_back NUMBER DEFAULT 7)
  RETURNS VARCHAR
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE activity_summary VARCHAR; query_sample VARCHAR;
BEGIN
  SELECT LISTAGG(QUERY_TYPE || ': ' || LEFT(QUERY_TEXT, 100), '\n') WITHIN GROUP (ORDER BY BYTES_SCANNED DESC)
  INTO :query_sample
  FROM (SELECT QUERY_TYPE, QUERY_TEXT, BYTES_SCANNED FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
        WHERE USER_NAME = :user_name AND START_TIME >= DATEADD('day', -:days_back, CURRENT_TIMESTAMP()) AND EXECUTION_STATUS = 'SUCCESS'
        ORDER BY BYTES_SCANNED DESC LIMIT 20);

  SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2',
    'You are a senior security analyst writing an executive briefing. Analyze user "' || :user_name || '" activity over the last 7 days.

Return ONLY a valid JSON object with exactly these keys:
- "risk_level": one of "critical", "high", "medium", "low"
- "headline": one sentence executive summary of the situation (max 20 words)
- "findings": array of 3 objects, each with "label" (2-4 word category like "Data Access Pattern", "Authentication Behavior", "Privilege Usage") and "detail" (one concise sentence)
- "recommendation": one sentence recommended next action for the security team

No prose before or after the JSON.

Example:
{"risk_level":"high","headline":"User showed unusual data export patterns consistent with potential exfiltration.","findings":[{"label":"Data Access","detail":"Queried 15 tables across 4 databases, 3x above their 30-day average."},{"label":"Export Activity","detail":"Executed COPY INTO commands targeting external stages."},{"label":"Access Timing","detail":"Activity concentrated between 1-4 AM, outside normal working hours."}],"recommendation":"Immediately review recent COPY INTO and GET_PRESIGNED_URL activity and consider temporary access suspension."}

Recent queries (top 20 by volume):
' || COALESCE(:query_sample, 'No queries') || '

JSON:'
  ) INTO :activity_summary;
  RETURN :activity_summary;
END;
$$;

GRANT USAGE ON PROCEDURE trust_center.explain_anomaly(VARCHAR) TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE trust_center.recommend_remediation(VARCHAR, VARCHAR, ARRAY) TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE trust_center.summarize_user_activity(VARCHAR, NUMBER) TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Cortex AI procedures created.' AS status;
-- ---- END sql/04_cortex_ai_procs.sql ----

-- ---- BEGIN sql/05_service.sql ----
-- =============================================================================
-- 05_service.sql
-- SPCS infrastructure for the Next.js dashboard: compute pool, service, and an
-- upgrade-safe version_initializer callback.
--
-- Per Native App SPCS rules: services CANNOT live in a versioned schema, so
-- `services` is a plain schema. The upgrade logic itself (version_init) DOES
-- live in a versioned schema (`core`) since it's stateless procedural code.
--
-- IMPORTANT (confirmed against a real account): the image repository does
-- NOT get created here, inside the running app's setup script -- CREATE
-- SERVICE needs the image repository (and a real pushed image) to already
-- exist at manifest.yml's exact path *before* the app can even install, so
-- the repo must live on the APPLICATION PACKAGE itself (a provider-side,
-- pre-install object), not be created by consumer-triggered setup script
-- execution. The provider creates it once, directly on the package:
--   CREATE SCHEMA IF NOT EXISTS <pkg>.services;
--   CREATE IMAGE REPOSITORY IF NOT EXISTS <pkg>.services.app_image_repo;
-- then builds/pushes to it (see containers/Dockerfile), before ever
-- registering a version with `container_services` in the manifest.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS services;
CREATE OR ALTER VERSIONED SCHEMA core;

-- Compute pool sized for a lightweight dashboard (no ML training happens
-- here -- that lives entirely outside the app, see
-- ../external/install_external_ml.sql). Multi-cloud instance
-- family selection: CPU_X64_XS is available on every cloud Snowflake runs on.
LET pool_name VARCHAR := CURRENT_DATABASE() || '_ui_pool';

CREATE COMPUTE POOL IF NOT EXISTS IDENTIFIER(:pool_name)
  MIN_NODES = 1
  MAX_NODES = 1
  INSTANCE_FAMILY = CPU_X64_XS
  AUTO_RESUME = TRUE
  AUTO_SUSPEND_SECS = 1800;

-- Service function protocol note: this service only serves the web UI
-- (default_web_endpoint) and calls out to Snowflake itself from inside the
-- container (see frontend/lib/snowflake.ts) -- it does not register any
-- SQL service functions, so no POST-handler contract applies here.
CREATE SERVICE IF NOT EXISTS services.ui_service
  IN COMPUTE POOL IDENTIFIER(:pool_name)
  FROM SPECIFICATION_FILE = '/containers/service_spec.yaml'
  QUERY_WAREHOUSE = ml_anomaly_wh;

GRANT USAGE ON SCHEMA services TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE, MONITOR, OPERATE ON SERVICE services.ui_service TO APPLICATION ROLE trust_center_integration_role;

-- Endpoint access control: `GRANT USAGE ON SERVICE` above is for
-- inspecting/monitoring the service object (SHOW ENDPOINTS,
-- SYSTEM$WAIT_FOR_SERVICES) -- it does NOT grant access to the web endpoint
-- itself. That requires separately granting the per-endpoint SERVICE ROLE
-- declared in containers/service_spec.yaml's `serviceRoles:` block.
-- Confirmed empirically: without this grant, visiting the endpoint URL after
-- a successful SSO login returns `ERROR_FORBIDDEN` /
-- "Access denied. Insufficient privileges to use <endpoint-host>." This
-- grant requires OWNERSHIP on the service, which only the app itself has --
-- it cannot be granted from outside by ACCOUNTADMIN after the fact.
GRANT SERVICE ROLE services.ui_service!ui_endpoint_role TO APPLICATION ROLE trust_center_integration_role;

-- ---------------------------------------------------------------------------
-- Upgrade support: version_initializer runs after setup_script.sql on every
-- install/upgrade. It updates the running service to the new version's image
-- and spec, rather than requiring the consumer to manually restart anything.
-- Registered in manifest.yml as lifecycle_callbacks.version_initializer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE PROCEDURE core.version_init()
  RETURNS VARCHAR
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
BEGIN
  ALTER SERVICE services.ui_service FROM SPECIFICATION_FILE = '/containers/service_spec.yaml';
  CALL SYSTEM$WAIT_FOR_SERVICES(120, 'services.ui_service');
  RETURN 'ui_service upgraded and healthy.';
END;
$$;

GRANT USAGE ON SCHEMA core TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE core.version_init() TO APPLICATION ROLE trust_center_integration_role;

-- TEMP DEBUG PROC -- remove once the ingress "upstream connect error" is
-- root-caused. Forces a full DROP + CREATE of the service (not just
-- ALTER/SUSPEND/RESUME) to rule out stale ingress-gateway registration.
CREATE OR REPLACE PROCEDURE core.recreate_service()
  RETURNS VARCHAR
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE
  old_pool_name VARCHAR;
  new_pool_name VARCHAR;
BEGIN
  old_pool_name := CURRENT_DATABASE() || '_UI_POOL';
  new_pool_name := CURRENT_DATABASE() || '_UI_POOL2';
  DROP SERVICE IF EXISTS services.ui_service;
  BEGIN
    DROP COMPUTE POOL IF EXISTS IDENTIFIER(:old_pool_name);
  EXCEPTION WHEN OTHER THEN NULL;
  END;
  CREATE COMPUTE POOL IF NOT EXISTS IDENTIFIER(:new_pool_name)
    MIN_NODES = 1
    MAX_NODES = 1
    INSTANCE_FAMILY = CPU_X64_XS
    AUTO_RESUME = TRUE
    AUTO_SUSPEND_SECS = 1800;
  CREATE SERVICE services.ui_service
    IN COMPUTE POOL IDENTIFIER(:new_pool_name)
    FROM SPECIFICATION_FILE = '/containers/service_spec.yaml'
    QUERY_WAREHOUSE = ml_anomaly_wh;
  GRANT USAGE, MONITOR, OPERATE ON SERVICE services.ui_service TO APPLICATION ROLE trust_center_integration_role;
  GRANT SERVICE ROLE services.ui_service!ui_endpoint_role TO APPLICATION ROLE trust_center_integration_role;
  CALL SYSTEM$WAIT_FOR_SERVICES(120, 'services.ui_service');
  RETURN 'ui_service recreated on a brand-new compute pool.';
END;
$$;

GRANT USAGE ON PROCEDURE core.recreate_service() TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Compute pool, service, and upgrade callback created.' AS status;
-- ---- END sql/05_service.sql ----

-- ---- BEGIN sql/06_enterprise_features.sql ----
-- =============================================================================
-- 06_enterprise_features.sql
-- Case management, peer comparison, and drift-series support for the
-- Investigate page's Timeline / Drift / Peers / Case tabs.
--
-- CRUD on cases/case_notes/response_actions is done via direct SQL from the
-- frontend API routes (same convention as trust_center.scan_exclusions in
-- 01_infrastructure.sql), not stored procedures -- the app has no logic in
-- the CRUD path that belongs server-side beyond what INSERT/UPDATE already
-- express. get_peer_comparison and get_drift_series ARE procedures because
-- they aggregate across all users, which is easier to express and reuse as
-- a callable TABLE-returning proc than to inline in every caller.
-- =============================================================================

CREATE TABLE IF NOT EXISTS trust_center.cases (
  case_id VARCHAR DEFAULT UUID_STRING(),
  user_name VARCHAR NOT NULL,
  attack_chain VARCHAR,
  severity VARCHAR(10),
  status VARCHAR DEFAULT 'OPEN',        -- OPEN | INVESTIGATING | RESOLVED | DISMISSED
  priority VARCHAR DEFAULT 'MEDIUM',    -- LOW | MEDIUM | HIGH | URGENT
  assigned_to VARCHAR,
  summary VARCHAR,
  created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  closed_at TIMESTAMP_TZ
);

CREATE TABLE IF NOT EXISTS trust_center.case_notes (
  note_id VARCHAR DEFAULT UUID_STRING(),
  case_id VARCHAR NOT NULL,
  author VARCHAR,
  note VARCHAR NOT NULL,
  created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS trust_center.response_actions (
  action_id VARCHAR DEFAULT UUID_STRING(),
  case_id VARCHAR,
  user_name VARCHAR NOT NULL,
  action_type VARCHAR NOT NULL,   -- e.g. EXCLUDE_USER, RESOLVE_CASE, DISABLE_USER, REVOKE_ROLE
  tier VARCHAR NOT NULL,          -- 'A' (executed directly by the app) | 'B' (generated script, run manually)
  status VARCHAR DEFAULT 'LOGGED', -- LOGGED | EXECUTED | GENERATED | COPIED
  script_text VARCHAR,
  created_by VARCHAR,
  created_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);

-- For each of the 20 models, compares the target user's average metric value
-- over the last 7 days against the population (all other users) average/p95/max
-- for that same model and window.
CREATE OR REPLACE PROCEDURE trust_center.get_peer_comparison(target_user VARCHAR)
  RETURNS TABLE(model_name VARCHAR, user_value FLOAT, peer_avg FLOAT, peer_p95 FLOAT, peer_max FLOAT)
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE
  res RESULTSET;
BEGIN
  res := (
    SELECT
      u.model_name,
      u.user_value,
      p.peer_avg,
      p.peer_p95,
      p.peer_max
    FROM (
      SELECT model_name, AVG(metric_value) AS user_value
      FROM trust_center.anomaly_results
      WHERE user_name = :target_user AND ts >= DATEADD('day', -7, CURRENT_TIMESTAMP())
      GROUP BY model_name
    ) u
    JOIN (
      SELECT model_name,
        AVG(metric_value) AS peer_avg,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) AS peer_p95,
        MAX(metric_value) AS peer_max
      FROM trust_center.anomaly_results
      WHERE user_name <> :target_user AND ts >= DATEADD('day', -7, CURRENT_TIMESTAMP())
      GROUP BY model_name
    ) p ON u.model_name = p.model_name
    ORDER BY u.model_name
  );
  RETURN TABLE(res);
END;
$$;

-- 30-day actual-vs-forecast series for a user's flagged models, wider than the
-- 7-day Overview window, so the Drift tab can show how the actual/forecast gap
-- has widened (or not) over time.
CREATE OR REPLACE PROCEDURE trust_center.get_drift_series(target_user VARCHAR)
  RETURNS TABLE(model_name VARCHAR, ts TIMESTAMP_NTZ, metric_value FLOAT, forecast FLOAT, lower_bound FLOAT, upper_bound FLOAT, is_anomaly BOOLEAN)
  LANGUAGE SQL
  EXECUTE AS OWNER
AS
$$
DECLARE
  res RESULTSET;
BEGIN
  res := (
    SELECT model_name, ts, metric_value, forecast, lower_bound, upper_bound, is_anomaly
    FROM trust_center.anomaly_results
    WHERE user_name = :target_user AND ts >= DATEADD('day', -30, CURRENT_TIMESTAMP())
    ORDER BY model_name, ts
  );
  RETURN TABLE(res);
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE trust_center.cases TO APPLICATION ROLE trust_center_integration_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE trust_center.case_notes TO APPLICATION ROLE trust_center_integration_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE trust_center.response_actions TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE trust_center.get_peer_comparison(VARCHAR) TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE trust_center.get_drift_series(VARCHAR) TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Enterprise features (cases, peer comparison, drift series) ready.' AS status;
-- ---- END sql/06_enterprise_features.sql ----

-- ---- BEGIN sql/07_semantic_view.sql ----
-- =============================================================================
-- 07_semantic_view.sql
-- Semantic view over the core security tables, enabling natural-language
-- querying via Cortex Analyst and Cortex Agents. This view auto-deploys
-- with the app -- no consumer setup required.
--
-- Uses DDL syntax (not YAML) so it runs directly in setup_script.sql.
-- Tables are referenced without database qualifier since the setup script
-- runs inside the app's own database context.
-- =============================================================================

CREATE OR REPLACE SEMANTIC VIEW trust_center.security_sv

  TABLES (
    anomaly_signals AS trust_center.anomaly_results
      PRIMARY KEY (run_id, model_name, user_name, ts)
      WITH SYNONYMS ('anomaly results', 'signals')
      COMMENT = 'Per-user per-model anomaly detection results from each scan run',
    flagged_users AS trust_center.attack_chains
      PRIMARY KEY (run_id, user_name)
      WITH SYNONYMS ('attack chains', 'risky users', 'flagged users')
      COMMENT = 'Users flagged with correlated risk scores, severity, and attack chain labels',
    cases AS trust_center.cases
      PRIMARY KEY (case_id)
      WITH SYNONYMS ('security cases', 'investigations')
      COMMENT = 'Security investigation cases tracking flagged users through resolution'
  )

  RELATIONSHIPS (
    signals_to_users AS
      anomaly_signals (user_name) REFERENCES flagged_users (user_name),
    users_to_cases AS
      flagged_users (user_name) REFERENCES cases (user_name)
  )

  FACTS (
    anomaly_signals.anomaly_flag AS CASE WHEN is_anomaly AND distance > 0 THEN 1 ELSE 0 END
      COMMENT = 'Binary flag: 1 if this signal is a true anomaly above baseline',
    cases.resolution_hours AS TIMESTAMPDIFF('HOUR', created_at, closed_at)
      COMMENT = 'Hours from case open to close'
  )

  DIMENSIONS (
    anomaly_signals.user_name AS user_name
      WITH SYNONYMS = ('user', 'account user')
      COMMENT = 'Snowflake user whose behavior was analyzed',
    anomaly_signals.model_name AS model_name
      WITH SYNONYMS = ('model', 'signal', 'detector')
      COMMENT = 'Name of the ML anomaly detection model',
    anomaly_signals.is_anomaly AS is_anomaly
      COMMENT = 'Whether this data point was flagged as anomalous',
    anomaly_signals.run_id AS run_id
      COMMENT = 'Unique identifier for the scan run',
    anomaly_signals.signal_date AS ts::DATE
      WITH SYNONYMS = ('date', 'day')
      COMMENT = 'Date of the anomaly signal',

    flagged_users.user_name AS user_name
      WITH SYNONYMS = ('risky user', 'flagged user')
      COMMENT = 'Snowflake user who was flagged',
    flagged_users.severity AS severity
      WITH SYNONYMS = ('risk level', 'threat level')
      COMMENT = 'Risk severity: CRITICAL, HIGH, MEDIUM, LOW'
      SAMPLE_VALUES ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
      IS_ENUM,
    flagged_users.attack_chain AS attack_chain
      WITH SYNONYMS = ('attack pattern', 'threat type')
      COMMENT = 'Classified attack pattern',
    flagged_users.run_id AS run_id
      COMMENT = 'Scan run identifier',
    flagged_users.run_timestamp AS run_timestamp
      WITH SYNONYMS = ('scan time', 'scan date')
      COMMENT = 'Timestamp when the scan was run',

    cases.case_id AS case_id
      COMMENT = 'Unique case identifier',
    cases.user_name AS user_name
      COMMENT = 'User under investigation',
    cases.status AS status
      WITH SYNONYMS = ('case status', 'state')
      COMMENT = 'Case status: OPEN, INVESTIGATING, RESOLVED, DISMISSED'
      SAMPLE_VALUES ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')
      IS_ENUM,
    cases.priority AS priority
      COMMENT = 'Case priority: LOW, MEDIUM, HIGH, URGENT'
      SAMPLE_VALUES ('LOW', 'MEDIUM', 'HIGH', 'URGENT')
      IS_ENUM,
    cases.severity AS severity
      COMMENT = 'Severity at time of case creation',
    cases.attack_chain AS attack_chain
      COMMENT = 'Attack chain at time of case creation',
    cases.assigned_to AS assigned_to
      WITH SYNONYMS = ('assignee', 'analyst')
      COMMENT = 'Analyst assigned to the case',
    cases.created_date AS created_at::DATE
      WITH SYNONYMS = ('opened date')
      COMMENT = 'Date the case was opened'
  )

  METRICS (
    anomaly_signals.total_anomalies AS SUM(anomaly_signals.anomaly_flag)
      WITH SYNONYMS = ('anomaly count', 'number of anomalies')
      COMMENT = 'Count of anomalous signals',
    anomaly_signals.avg_distance AS AVG(distance)
      WITH SYNONYMS = ('average anomaly score', 'mean deviation')
      COMMENT = 'Average distance from forecast across signals',
    anomaly_signals.users_affected AS COUNT(DISTINCT CASE WHEN is_anomaly AND distance > 0 THEN user_name END)
      COMMENT = 'Distinct users with at least one anomaly',

    flagged_users.total_flagged AS COUNT(user_name)
      WITH SYNONYMS = ('flagged user count')
      COMMENT = 'Number of users flagged in latest scan',
    flagged_users.avg_risk_score AS AVG(risk_score)
      WITH SYNONYMS = ('average risk', 'mean risk score')
      COMMENT = 'Average risk score across flagged users',
    flagged_users.total_signals AS SUM(signal_count)
      COMMENT = 'Total ML model signals across all flagged users',

    cases.open_cases AS COUNT(CASE WHEN status IN ('OPEN', 'INVESTIGATING') THEN 1 END)
      COMMENT = 'Number of open or in-progress cases',
    cases.avg_mttr AS AVG(cases.resolution_hours)
      WITH SYNONYMS = ('mean time to resolve', 'MTTR')
      COMMENT = 'Average hours from case open to close'
  )

  COMMENT = 'Security anomaly detection analytics for Cortex Analyst and CoWork'

  AI_SQL_GENERATION 'When filtering flagged_users or attack_chains, always filter to the latest scan run using: run_timestamp = (SELECT MAX(run_timestamp) FROM trust_center.attack_chains). Round all numeric outputs to 1 decimal place.'

  AI_QUESTION_CATEGORIZATION 'This semantic view covers security anomaly detection data only. Reject questions about salary, PII, or topics unrelated to security monitoring. If the user asks about a specific user without specifying a time range, default to the last 7 days.'

  AI_VERIFIED_QUERIES (
    critical_alert_count AS (
      QUESTION 'How many critical alerts are there?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT COUNT(*) AS critical_count FROM flagged_users WHERE severity = ''CRITICAL'' AND run_timestamp = (SELECT MAX(run_timestamp) FROM flagged_users)'
    ),
    highest_risk_users AS (
      QUESTION 'Which users have the highest risk scores?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT user_name, risk_score, severity, attack_chain, signal_count FROM flagged_users WHERE run_timestamp = (SELECT MAX(run_timestamp) FROM flagged_users) ORDER BY risk_score DESC LIMIT 10'
    ),
    anomaly_trend AS (
      QUESTION 'What is the anomaly trend over the last 30 days?'
      ONBOARDING_QUESTION TRUE
      SQL 'SELECT anomaly_signals.signal_date AS day, SUM(anomaly_signals.anomaly_flag) AS total_anomalies, COUNT(DISTINCT CASE WHEN anomaly_signals.is_anomaly AND anomaly_signals.distance > 0 THEN anomaly_signals.user_name END) AS users_affected FROM anomaly_signals GROUP BY day ORDER BY day'
    ),
    open_cases_count AS (
      QUESTION 'How many open cases are there?'
      SQL 'SELECT COUNT(*) AS open_cases FROM cases WHERE status IN (''OPEN'', ''INVESTIGATING'')'
    ),
    model_signal_frequency AS (
      QUESTION 'Which ML models are firing the most anomalies?'
      SQL 'SELECT anomaly_signals.model_name, COUNT(*) AS anomaly_count, ROUND(AVG(anomaly_signals.distance), 1) AS avg_distance FROM anomaly_signals WHERE anomaly_signals.is_anomaly = TRUE AND anomaly_signals.distance > 0 GROUP BY anomaly_signals.model_name ORDER BY anomaly_count DESC'
    )
  );

GRANT SELECT ON SEMANTIC VIEW trust_center.security_sv
  TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Semantic view created.' AS status;
-- ---- END sql/07_semantic_view.sql ----

-- ---- BEGIN sql/08_cortex_agent.sql ----
-- =============================================================================
-- 08_cortex_agent.sql
-- Cortex Agent that uses the semantic view for natural-language security
-- analytics. Auto-deploys with the app -- no consumer setup required.
--
-- Once deployed, this agent:
--   1. Appears in CoWork for any user with the app role
--   2. Answers natural-language security questions via Cortex Analyst
--   3. Generates charts from query results via data_to_chart
--   4. Supports CoWork features: Deep Research, Automations, Artifacts
-- =============================================================================

CREATE OR REPLACE AGENT trust_center.security_agent
  COMMENT = 'AI security analyst for ML behavioral anomaly detection'
  PROFILE = '{"display_name": "Security Analyst", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto

  orchestration:
    tool_not_accessible: accept
    budget:
      seconds: 60
      tokens: 32000

  instructions:
    response: |
      You are a security analyst for Snowflake account monitoring.
      You help security teams investigate behavioral anomalies detected
      by 20 ML models that monitor login patterns, query volumes, data
      access breadth, privilege usage, and data movement.

      When answering questions:
      - Be specific and cite actual numbers from the data
      - Explain risk scores (0-100 scale) and severity levels (CRITICAL/HIGH/MEDIUM/LOW)
      - Describe attack chain patterns in plain language
      - Suggest investigation steps when discussing risky users
      - Use charts when showing trends or comparisons
    orchestration: |
      Use SecurityAnalyst for all data questions about anomalies, users,
      risk scores, attack chains, cases, and security metrics.
      Use data_to_chart when the user asks for visualizations or when
      showing trends, distributions, or comparisons.
    sample_questions:
      - question: "Which users have the highest risk scores right now?"
      - question: "How many critical alerts are there?"
      - question: "Show me the anomaly trend over the last 30 days"
      - question: "What are the most common attack patterns?"
      - question: "Which ML models are firing the most anomalies?"
      - question: "How many open cases do we have?"

  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "SecurityAnalyst"
        description: >
          Queries structured security anomaly data including per-user per-model
          anomaly signals with actual vs forecast values, correlated attack chain
          risk scores with severity classifications, and case management records
          tracking investigation status and resolution times.
    - tool_spec:
        type: "data_to_chart"
        name: "data_to_chart"
        description: "Generates charts and visualizations from security data"

  tool_resources:
    SecurityAnalyst:
      semantic_view: "trust_center.security_sv"
      execution_environment:
        type: "warehouse"
        warehouse: "ml_anomaly_wh"
  $$;

GRANT USAGE ON AGENT trust_center.security_agent
  TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Cortex Agent created.' AS status;
-- ---- END sql/08_cortex_agent.sql ----

