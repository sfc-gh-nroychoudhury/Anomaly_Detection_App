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
