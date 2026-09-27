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
