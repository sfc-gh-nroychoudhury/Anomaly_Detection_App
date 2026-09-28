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
