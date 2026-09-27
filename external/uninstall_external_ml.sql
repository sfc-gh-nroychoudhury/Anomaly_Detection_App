-- =============================================================================
-- uninstall_external_ml.sql
-- Teardown counterpart to install_external_ml.sql. Run as ACCOUNTADMIN.
--
-- Run this BEFORE dropping the Native App if you want a completely clean
-- account -- dropping the app alone does NOT remove these external objects
-- (by design: the app never owns them, it only holds a reference to
-- MODELS.DETECTION_RESULTS).
-- =============================================================================

DROP TASK IF EXISTS ML_ANOMALY_EXTERNAL.MODELS.ml_anomaly_detect_task;
DROP TASK IF EXISTS ML_ANOMALY_EXTERNAL.MODELS.ml_anomaly_retrain_task;
DROP DATABASE IF EXISTS ML_ANOMALY_EXTERNAL;

SELECT 'External ML models, detection results, and both tasks removed.' AS status;
