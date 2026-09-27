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
