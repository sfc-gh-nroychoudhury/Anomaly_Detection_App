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
