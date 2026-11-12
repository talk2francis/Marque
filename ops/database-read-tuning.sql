-- psql script: connect as the application role to its application database.
-- This changes only that role's NEW sessions in that database, with no restart.
-- Capture the previous pg_db_role_setting entry before applying or restoring it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RAISE EXCEPTION 'Connect as the application role, not the database superuser';
  END IF;
END $$;
SELECT format('ALTER ROLE %I IN DATABASE %I SET jit = off', current_user, current_database())
\gexec
