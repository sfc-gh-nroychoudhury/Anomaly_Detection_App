-- =============================================================================
-- ATTACK SIMULATION SQL PACK
-- ML Behavioral Anomaly Detection — Hackathon Demo
--
-- Seeds realistic anomaly data for 5 attack personas covering all 20 ML models,
-- runs the real scan/correlation engine, then populates cases and supporting
-- data so every page in the app has content.
--
-- Safe to re-run: truncates app tables first, preserves existing detection_results
-- for real users, only adds/replaces simulation rows.
-- =============================================================================

USE ROLE ACCOUNTADMIN;

-- =============================================================================
-- PHASE 0: CLEANUP (idempotent)
-- =============================================================================

-- Clear app tables (these are inside the Native App's trust_center schema)
DELETE FROM ML_ANOMALY_APP.trust_center.anomaly_results;
DELETE FROM ML_ANOMALY_APP.trust_center.attack_chains;
DELETE FROM ML_ANOMALY_APP.trust_center.cases;
DELETE FROM ML_ANOMALY_APP.trust_center.case_notes;
DELETE FROM ML_ANOMALY_APP.trust_center.response_actions;
DELETE FROM ML_ANOMALY_APP.trust_center.scan_exclusions;

-- Remove any previously seeded simulation rows from detection_results
-- (identified by series names we use below)
DELETE FROM ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS
WHERE series IN ('AZSENTINEL_USER','TC_TEST_NO_MFA_1','TC_TEST_NO_MFA_2','DATAPLATFORM_ADMIN','TC_TEST_NO_MFA_3');

-- =============================================================================
-- PHASE 1: SEED DETECTION_RESULTS — 5 ATTACK PERSONAS × 20 MODELS
--
-- Each persona gets 7 days of data. Anomaly days have is_anomaly=TRUE,
-- distance > 2.0, and y well above upper_bound. Normal days have
-- is_anomaly=FALSE with y near forecast.
--
-- Timestamps use CURRENT_DATE offsets so the demo always looks fresh.
-- =============================================================================

-- Helper: Generate a date spine for the last 7 days (the detection window)
-- plus 23 more days back (for drift charts = 30 days total)
CREATE OR REPLACE TEMPORARY TABLE _date_spine AS
SELECT DATEADD('day', -seq4(), CURRENT_DATE())::TIMESTAMP_NTZ AS ts
FROM TABLE(GENERATOR(ROWCOUNT => 30));

-- ---------------------------------------------------------------------------
-- PERSONA 1: AZSENTINEL_USER — Credential Theft + Data Exfiltration
-- 8 models: login_count, failed_auth, distinct_ips, bytes_scanned,
--           bytes_to_result, network_egress, rows_unloaded, query_volume
-- Anomaly spike on day -1 and day -2 (yesterday and day before)
-- ---------------------------------------------------------------------------

INSERT INTO ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS
(model_name, series, ts, y, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance)

-- ad_login_count: baseline ~2, spike to 150
SELECT 'ad_login_count', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 150 + UNIFORM(0,30,RANDOM())
       ELSE 1 + UNIFORM(0,3,RANDOM()) END::FLOAT AS y,
  2.0, 0.0, 8.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.5 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 23.5 ELSE -0.3 END
FROM _date_spine d

UNION ALL
-- ad_failed_auth: baseline ~1, spike to 45
SELECT 'ad_failed_auth', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 45 + UNIFORM(0,15,RANDOM())
       ELSE UNIFORM(0,2,RANDOM()) END::FLOAT,
  1.0, 0.0, 5.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.4 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 15.2 ELSE -0.2 END
FROM _date_spine d

UNION ALL
-- ad_distinct_ips: baseline ~1, spike to 12
SELECT 'ad_distinct_ips', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 12 + UNIFORM(0,4,RANDOM())
       ELSE 1 END::FLOAT,
  1.0, 0.0, 3.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 8.5 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_bytes_scanned: baseline ~0, spike to 200GB
SELECT 'ad_bytes_scanned', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 200000000000 + UNIFORM(0,50000000000,RANDOM())
       ELSE UNIFORM(0,5000000,RANDOM()) END::FLOAT,
  2000000.0, 0.0, 50000000.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 12.8 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_bytes_to_result: baseline ~0, spike to 80GB
SELECT 'ad_bytes_to_result', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 80000000000 + UNIFORM(0,20000000000,RANDOM())
       ELSE UNIFORM(0,2000000,RANDOM()) END::FLOAT,
  1000000.0, 0.0, 30000000.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 11.4 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_network_egress: baseline ~0, spike to 500M
SELECT 'ad_network_egress', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 500000000 + UNIFORM(0,100000000,RANDOM())
       ELSE UNIFORM(0,500000,RANDOM()) END::FLOAT,
  200000.0, 0.0, 5000000.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 45.2 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_rows_unloaded: baseline 0, spike to 5M (this model may have 0 baseline rows)
SELECT 'ad_rows_unloaded', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 5000000 + UNIFORM(0,1000000,RANDOM())
       ELSE 0 END::FLOAT,
  0.0, 0.0, 100.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.5 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 55.0 ELSE 0.0 END
FROM _date_spine d

UNION ALL
-- ad_query_volume: baseline ~5, spike to 800
SELECT 'ad_query_volume', 'AZSENTINEL_USER', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 800 + UNIFORM(0,200,RANDOM())
       ELSE 3 + UNIFORM(0,5,RANDOM()) END::FLOAT,
  5.0, 0.0, 25.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.4 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 38.5 ELSE -0.2 END
FROM _date_spine d
;

-- ---------------------------------------------------------------------------
-- PERSONA 2: TC_TEST_NO_MFA_1 — Privilege Escalation Attack
-- 6 models: role_usage, ddl_operations, grant_operations, db_breadth,
--           table_breadth, failed_queries
-- Anomaly spike on day -1 (yesterday)
-- ---------------------------------------------------------------------------

INSERT INTO ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS
(model_name, series, ts, y, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance)

-- ad_role_usage: baseline ~1, spike to 15
SELECT 'ad_role_usage', 'TC_TEST_NO_MFA_1', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 15 + UNIFORM(0,3,RANDOM())
       ELSE UNIFORM(0,2,RANDOM()) END::FLOAT,
  1.0, 0.0, 3.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 9.2 ELSE -0.2 END
FROM _date_spine d

UNION ALL
-- ad_ddl_operations: baseline ~0, spike to 200
SELECT 'ad_ddl_operations', 'TC_TEST_NO_MFA_1', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 200 + UNIFORM(0,50,RANDOM())
       ELSE UNIFORM(0,2,RANDOM()) END::FLOAT,
  1.0, 0.0, 10.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 22.5 ELSE -0.2 END
FROM _date_spine d

UNION ALL
-- ad_grant_operations: baseline ~0, spike to 80
SELECT 'ad_grant_operations', 'TC_TEST_NO_MFA_1', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 80 + UNIFORM(0,20,RANDOM())
       ELSE 0 END::FLOAT,
  0.0, 0.0, 5.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 18.0 ELSE 0.0 END
FROM _date_spine d

UNION ALL
-- ad_db_breadth: baseline ~1, spike to 12
SELECT 'ad_db_breadth', 'TC_TEST_NO_MFA_1', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 12 + UNIFORM(0,3,RANDOM())
       ELSE UNIFORM(0,2,RANDOM()) END::FLOAT,
  1.0, 0.0, 3.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 7.5 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_table_breadth: baseline ~2, spike to 45
SELECT 'ad_table_breadth', 'TC_TEST_NO_MFA_1', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 45 + UNIFORM(0,10,RANDOM())
       ELSE 1 + UNIFORM(0,3,RANDOM()) END::FLOAT,
  2.0, 0.0, 7.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 8.8 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_failed_queries: baseline ~2, spike to 90
SELECT 'ad_failed_queries', 'TC_TEST_NO_MFA_1', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 90 + UNIFORM(0,20,RANDOM())
       ELSE 1 + UNIFORM(0,3,RANDOM()) END::FLOAT,
  2.0, 0.0, 15.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 10.5 ELSE -0.2 END
FROM _date_spine d
;

-- ---------------------------------------------------------------------------
-- PERSONA 3: TC_TEST_NO_MFA_2 — Insider Data Theft
-- 4 models: data_staging, bytes_scanned, db_breadth, table_breadth
-- Anomaly spike on day -1 and -3 (two separate staging events)
-- ---------------------------------------------------------------------------

INSERT INTO ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS
(model_name, series, ts, y, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance)

-- ad_data_staging: baseline 0, spike to 25
SELECT 'ad_data_staging', 'TC_TEST_NO_MFA_2', d.ts,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 25 + UNIFORM(0,8,RANDOM())
       ELSE 0 END::FLOAT,
  0.0, 0.0, 2.0,
  d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ),
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 0.998 ELSE 0.5 END,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 14.0 ELSE 0.0 END
FROM _date_spine d

UNION ALL
-- ad_bytes_scanned: baseline ~10M, spike to 100GB
SELECT 'ad_bytes_scanned', 'TC_TEST_NO_MFA_2', d.ts,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 100000000000 + UNIFORM(0,30000000000,RANDOM())
       ELSE 5000000 + UNIFORM(0,10000000,RANDOM()) END::FLOAT,
  8000000.0, 0.0, 80000000.0,
  d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ),
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 0.999 ELSE 0.4 END,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 9.8 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_db_breadth: baseline ~1, spike to 8
SELECT 'ad_db_breadth', 'TC_TEST_NO_MFA_2', d.ts,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 8 + UNIFORM(0,3,RANDOM())
       ELSE UNIFORM(0,2,RANDOM()) END::FLOAT,
  1.0, 0.0, 3.0,
  d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ),
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 0.998 ELSE 0.3 END,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 5.5 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_table_breadth: baseline ~2, spike to 30
SELECT 'ad_table_breadth', 'TC_TEST_NO_MFA_2', d.ts,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 30 + UNIFORM(0,8,RANDOM())
       ELSE 1 + UNIFORM(0,2,RANDOM()) END::FLOAT,
  2.0, 0.0, 7.0,
  d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ),
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 0.998 ELSE 0.3 END,
  CASE WHEN d.ts IN (DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ, DATEADD('day',-3,CURRENT_DATE())::TIMESTAMP_NTZ) THEN 6.5 ELSE -0.1 END
FROM _date_spine d
;

-- ---------------------------------------------------------------------------
-- PERSONA 4: DATAPLATFORM_ADMIN — Resource Hijacking
-- 3 models: warehouse_credits, warehouse_queries, query_volume
-- Using warehouse name for warehouse models, user name for query_volume
-- Anomaly on day -1
-- ---------------------------------------------------------------------------

-- Warehouse-level models use warehouse name as series
INSERT INTO ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS
(model_name, series, ts, y, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance)

-- ad_warehouse_credits: spike for a suspicious warehouse pattern
-- We use DATAPLATFORM_ADMIN as series to create a user-level signal
-- (the scan correlates by SERIES, so warehouse models contribute to warehouse entities)
SELECT 'ad_query_volume', 'DATAPLATFORM_ADMIN', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 1500 + UNIFORM(0,300,RANDOM())
       ELSE UNIFORM(0,3,RANDOM()) END::FLOAT,
  1.0, 0.0, 10.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 160.0 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_warehouse_credits as user-level signal
SELECT 'ad_warehouse_credits', 'DATAPLATFORM_ADMIN', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 50 + UNIFORM(0,15,RANDOM())
       ELSE 0.01 + UNIFORM(0,1,RANDOM()) * 0.05 END::FLOAT,
  0.05, 0.0, 2.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 28.0 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_warehouse_queries
SELECT 'ad_warehouse_queries', 'DATAPLATFORM_ADMIN', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 2000 + UNIFORM(0,500,RANDOM())
       ELSE UNIFORM(0,5,RANDOM()) END::FLOAT,
  2.0, 0.0, 20.0,
  d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-1,CURRENT_DATE())::TIMESTAMP_NTZ THEN 110.0 ELSE -0.1 END
FROM _date_spine d
;

-- ---------------------------------------------------------------------------
-- PERSONA 5: TC_TEST_NO_MFA_3 — Account Takeover
-- 5 models: client_diversity, failed_auth, login_count, ext_function_calls,
--           outbound_transfer
-- Anomaly spike on day -1 and -2
-- ---------------------------------------------------------------------------

INSERT INTO ML_ANOMALY_EXTERNAL.MODELS.DETECTION_RESULTS
(model_name, series, ts, y, forecast, lower_bound, upper_bound, is_anomaly, percentile, distance)

-- ad_client_diversity: baseline ~1, spike to 8
SELECT 'ad_client_diversity', 'TC_TEST_NO_MFA_3', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 8 + UNIFORM(0,3,RANDOM())
       ELSE 1 END::FLOAT,
  1.0, 0.0, 3.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 5.5 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_failed_auth: baseline ~0, spike to 30
SELECT 'ad_failed_auth', 'TC_TEST_NO_MFA_3', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 30 + UNIFORM(0,10,RANDOM())
       ELSE UNIFORM(0,1,RANDOM()) END::FLOAT,
  0.5, 0.0, 4.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 12.0 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_login_count: baseline ~0, spike to 100
SELECT 'ad_login_count', 'TC_TEST_NO_MFA_3', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 100 + UNIFORM(0,30,RANDOM())
       ELSE UNIFORM(0,1,RANDOM()) END::FLOAT,
  0.5, 0.0, 5.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.3 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 22.0 ELSE -0.1 END
FROM _date_spine d

UNION ALL
-- ad_ext_function_calls: baseline 0, spike to 500
SELECT 'ad_ext_function_calls', 'TC_TEST_NO_MFA_3', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 500 + UNIFORM(0,100,RANDOM())
       ELSE 0 END::FLOAT,
  0.0, 0.0, 5.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.5 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 100.0 ELSE 0.0 END
FROM _date_spine d

UNION ALL
-- ad_outbound_transfer: baseline 0, spike to 10GB
SELECT 'ad_outbound_transfer', 'TC_TEST_NO_MFA_3', d.ts,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 10000000000 + UNIFORM(0,3000000000,RANDOM())
       ELSE 0 END::FLOAT,
  0.0, 0.0, 1000.0,
  d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 0.999 ELSE 0.5 END,
  CASE WHEN d.ts >= DATEADD('day',-2,CURRENT_DATE())::TIMESTAMP_NTZ THEN 10000.0 ELSE 0.0 END
FROM _date_spine d
;

-- =============================================================================
-- PHASE 2: RUN THE REAL SCAN/CORRELATION ENGINE
-- =============================================================================

CALL ML_ANOMALY_APP.trust_center.run_anomaly_scan('demo_attack_sim_001');

-- =============================================================================
-- PHASE 3: SEED SUPPORTING DATA (cases, notes, exclusions, response actions)
-- =============================================================================

-- Cases — one per persona in different states
INSERT INTO ML_ANOMALY_APP.trust_center.cases
(case_id, user_name, attack_chain, severity, status, priority, assigned_to, summary, created_at, updated_at, closed_at)
VALUES
('CASE-SIM-001', 'AZSENTINEL_USER', 'credential_theft_exfiltration', 'CRITICAL', 'INVESTIGATING', 'URGENT', 'VJ Lambe',
 'Active credential theft detected. AZSENTINEL_USER showed 150+ logins from 12+ distinct IPs followed by 200GB+ data scanning and network egress. Immediate containment required.',
 DATEADD('hour', -6, CURRENT_TIMESTAMP()), DATEADD('hour', -1, CURRENT_TIMESTAMP()), NULL),

('CASE-SIM-002', 'TC_TEST_NO_MFA_1', 'privilege_escalation_attack', 'CRITICAL', 'OPEN', 'HIGH', NULL,
 'Privilege escalation via test account without MFA. 15+ roles used, 200+ DDL operations, 80+ GRANT commands. Test account may have been compromised.',
 DATEADD('hour', -3, CURRENT_TIMESTAMP()), DATEADD('hour', -3, CURRENT_TIMESTAMP()), NULL),

('CASE-SIM-003', 'TC_TEST_NO_MFA_2', 'insider_data_theft', 'HIGH', 'INVESTIGATING', 'HIGH', 'VJ Lambe',
 'Insider data staging detected. 25+ CTAS operations across 8 databases touching 30+ tables. Pattern suggests systematic data collection for exfiltration.',
 DATEADD('hour', -4, CURRENT_TIMESTAMP()), DATEADD('hour', -2, CURRENT_TIMESTAMP()), NULL),

('CASE-SIM-004', 'TC_TEST_NO_MFA_3', 'account_takeover', 'HIGH', 'RESOLVED', 'MEDIUM', 'VJ Lambe',
 'Account takeover of no-MFA test account. 8+ client types, 30+ failed logins, 500+ external function calls. Account credentials rotated and MFA enforced.',
 DATEADD('day', -1, CURRENT_TIMESTAMP()), DATEADD('hour', -8, CURRENT_TIMESTAMP()), DATEADD('hour', -8, CURRENT_TIMESTAMP()));

-- Case notes
INSERT INTO ML_ANOMALY_APP.trust_center.case_notes (note_id, case_id, author, note, created_at)
VALUES
-- Case 1 notes (AZSENTINEL)
('NOTE-001', 'CASE-SIM-001', 'VJ Lambe', 'Initial triage: confirmed anomalous login burst from IPs not previously associated with this service account. Geolocation shows requests from 4 countries in 2 hours — impossible travel pattern.', DATEADD('hour', -5, CURRENT_TIMESTAMP())),
('NOTE-002', 'CASE-SIM-001', 'VJ Lambe', 'Escalated to security team. Network egress of 500MB+ detected post-authentication. Reviewing data access logs for sensitive table exposure.', DATEADD('hour', -3, CURRENT_TIMESTAMP())),
('NOTE-003', 'CASE-SIM-001', 'VJ Lambe', 'Containment: suspended the integration temporarily. Rotated API keys. Need to assess data exposure scope before re-enabling.', DATEADD('hour', -1, CURRENT_TIMESTAMP())),

-- Case 2 notes (TC_TEST_NO_MFA_1)
('NOTE-004', 'CASE-SIM-002', 'System', 'Auto-generated: 6 anomaly signals detected in a single day for this entity. Attack chain classified as privilege_escalation_attack.', DATEADD('hour', -3, CURRENT_TIMESTAMP())),

-- Case 3 notes (TC_TEST_NO_MFA_2)
('NOTE-005', 'CASE-SIM-003', 'VJ Lambe', 'Identified 25 CTAS operations creating staging copies of production tables in a personal schema. Data appears to include PII columns.', DATEADD('hour', -3, CURRENT_TIMESTAMP())),
('NOTE-006', 'CASE-SIM-003', 'VJ Lambe', 'Cross-referenced with HR: this user submitted resignation last week. Pattern is consistent with insider data theft before departure.', DATEADD('hour', -2, CURRENT_TIMESTAMP())),

-- Case 4 notes (TC_TEST_NO_MFA_3 — resolved)
('NOTE-007', 'CASE-SIM-004', 'VJ Lambe', 'Account takeover confirmed. Credential stuffing attack succeeded against this no-MFA account. External function calls were attempting to exfiltrate data via webhook.', DATEADD('hour', -20, CURRENT_TIMESTAMP())),
('NOTE-008', 'CASE-SIM-004', 'VJ Lambe', 'Remediation complete: password reset, MFA enforced, reviewed and revoked all sessions. No sensitive data confirmed exfiltrated — external functions failed on permission checks.', DATEADD('hour', -8, CURRENT_TIMESTAMP()));

-- Response actions
INSERT INTO ML_ANOMALY_APP.trust_center.response_actions
(action_id, case_id, user_name, action_type, tier, status, script_text, created_by, created_at)
VALUES
('ACT-001', 'CASE-SIM-001', 'AZSENTINEL_USER', 'EXCLUDE_USER', 'A', 'EXECUTED', NULL, 'VJ Lambe', DATEADD('hour', -1, CURRENT_TIMESTAMP())),
('ACT-002', 'CASE-SIM-001', 'AZSENTINEL_USER', 'DISABLE_USER', 'B', 'GENERATED',
 'USE ROLE SECURITYADMIN;\nALTER USER AZSENTINEL_USER SET DISABLED = TRUE;\n-- Re-enable after investigation: ALTER USER AZSENTINEL_USER SET DISABLED = FALSE;',
 'VJ Lambe', DATEADD('hour', -1, CURRENT_TIMESTAMP())),
('ACT-003', 'CASE-SIM-004', 'TC_TEST_NO_MFA_3', 'FORCE_PASSWORD_RESET', 'B', 'GENERATED',
 'USE ROLE SECURITYADMIN;\nALTER USER TC_TEST_NO_MFA_3 SET MUST_CHANGE_PASSWORD = TRUE;',
 'VJ Lambe', DATEADD('hour', -8, CURRENT_TIMESTAMP())),
('ACT-004', 'CASE-SIM-004', 'TC_TEST_NO_MFA_3', 'RESOLVE_CASE', 'A', 'EXECUTED', NULL, 'VJ Lambe', DATEADD('hour', -8, CURRENT_TIMESTAMP()));

-- Scan exclusion (DATAPLATFORM_ADMIN is a known disabled admin — exclude from future scans after investigation)
INSERT INTO ML_ANOMALY_APP.trust_center.scan_exclusions
(entity_name, entity_type, reason, approved_by, approved_on, expires_on)
VALUES
('UI_SERVICE', 'USER', 'SPCS service identity — internal app traffic, not a human user.', 'VJ Lambe', CURRENT_TIMESTAMP(), NULL);

-- =============================================================================
-- PHASE 4: VALIDATION QUERIES
-- =============================================================================

-- Check 1: attack_chains populated with correct classifications
SELECT '=== ATTACK CHAINS ===' AS section;
SELECT user_name, risk_score, severity, signal_count, attack_chain, 
       ARRAY_SIZE(signals) as signal_array_size
FROM ML_ANOMALY_APP.trust_center.attack_chains
WHERE run_id = 'demo_attack_sim_001'
ORDER BY risk_score DESC;

-- Check 2: anomaly_results has all 20 models
SELECT '=== MODEL COVERAGE ===' AS section;
SELECT model_name, COUNT(DISTINCT user_name) as users, COUNT(*) as row_count,
       COUNT_IF(is_anomaly) as anomaly_rows
FROM ML_ANOMALY_APP.trust_center.anomaly_results
WHERE run_id = 'demo_attack_sim_001'
GROUP BY model_name ORDER BY model_name;

-- Check 3: cases seeded
SELECT '=== CASES ===' AS section;
SELECT case_id, user_name, status, severity, priority FROM ML_ANOMALY_APP.trust_center.cases ORDER BY created_at;

-- Check 4: notes seeded
SELECT '=== CASE NOTES ===' AS section;
SELECT case_id, author, LEFT(note, 80) as note_preview FROM ML_ANOMALY_APP.trust_center.case_notes ORDER BY created_at;

-- Check 5: exclusions
SELECT '=== EXCLUSIONS ===' AS section;
SELECT * FROM ML_ANOMALY_APP.trust_center.scan_exclusions;

-- Check 6: response actions
SELECT '=== RESPONSE ACTIONS ===' AS section;
SELECT action_id, user_name, action_type, tier, status FROM ML_ANOMALY_APP.trust_center.response_actions ORDER BY created_at;

-- Done
SELECT 'SIMULATION COMPLETE' AS status, 
       (SELECT COUNT(*) FROM ML_ANOMALY_APP.trust_center.attack_chains WHERE run_id = 'demo_attack_sim_001') AS attack_chains,
       (SELECT COUNT(DISTINCT model_name) FROM ML_ANOMALY_APP.trust_center.anomaly_results WHERE run_id = 'demo_attack_sim_001') AS models_covered,
       (SELECT COUNT(*) FROM ML_ANOMALY_APP.trust_center.cases) AS cases;
