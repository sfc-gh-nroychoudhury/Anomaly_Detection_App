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
