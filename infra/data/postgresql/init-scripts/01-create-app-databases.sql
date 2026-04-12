-- Bootstrap script for shared bitnami/postgresql instance in namespace `data`.
-- Executed once on first container start by bitnami chart's primary.initdb.scriptsSecret.
-- Three app users, each OWNER of its own database; cross-database visibility revoked
-- from PUBLIC so one compromised app cannot read the others' data.
--
-- Variables ${FIREFLY_DB_PASSWORD}, ${GHOSTFOLIO_DB_PASSWORD}, ${FINBRAIN_DB_PASSWORD}
-- are substituted by `scripts/apply-secrets.sh` before this file is stored in the
-- `postgresql-init-scripts` Secret. The rendered copy MUST NOT be committed back to git.

CREATE USER firefly    WITH PASSWORD '${FIREFLY_DB_PASSWORD}';
CREATE USER ghostfolio WITH PASSWORD '${GHOSTFOLIO_DB_PASSWORD}';
CREATE USER finbrain   WITH PASSWORD '${FINBRAIN_DB_PASSWORD}';

CREATE DATABASE firefly    OWNER firefly;
CREATE DATABASE ghostfolio OWNER ghostfolio;
CREATE DATABASE finbrain   OWNER finbrain;

REVOKE ALL ON DATABASE firefly    FROM PUBLIC;
REVOKE ALL ON DATABASE ghostfolio FROM PUBLIC;
REVOKE ALL ON DATABASE finbrain   FROM PUBLIC;

GRANT ALL ON DATABASE firefly    TO firefly;
GRANT ALL ON DATABASE ghostfolio TO ghostfolio;
GRANT ALL ON DATABASE finbrain   TO finbrain;
