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
    'You are a Snowflake security expert. User "' || :user_name || '" was flagged with attack chain: "' || :attack_chain || '". Signals: ' || ARRAY_TO_STRING(:signals, ', ') || '. Provide 3-5 specific actionable remediation steps (mention SQL commands). Numbered list:'
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
    'You are a security analyst. Summarize what user "' || :user_name || '" has been doing in 3-5 sentences. Flag anything suspicious.\n\nRecent queries (top 20 by volume):\n' || COALESCE(:query_sample, 'No queries') || '\n\nSummary:'
  ) INTO :activity_summary;
  RETURN :activity_summary;
END;
$$;

GRANT USAGE ON PROCEDURE trust_center.explain_anomaly(VARCHAR) TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE trust_center.recommend_remediation(VARCHAR, VARCHAR, ARRAY) TO APPLICATION ROLE trust_center_integration_role;
GRANT USAGE ON PROCEDURE trust_center.summarize_user_activity(VARCHAR, NUMBER) TO APPLICATION ROLE trust_center_integration_role;

SELECT 'Cortex AI procedures created.' AS status;
