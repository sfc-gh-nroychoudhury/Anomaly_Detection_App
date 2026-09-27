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
