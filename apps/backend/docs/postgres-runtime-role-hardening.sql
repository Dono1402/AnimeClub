-- AnimeClub runtime role hardening.
-- Run manually on production as a PostgreSQL superuser during a maintenance window.
-- Goal: keep schema ownership/migrations separate from the application runtime user.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'animeclub_owner') THEN
        CREATE ROLE animeclub_owner NOLOGIN;
    END IF;

    -- The existing animeclub_app login role remains the runtime role used by backend.env.
END
$$;

ALTER DATABASE animeclub OWNER TO animeclub_owner;
ALTER SCHEMA public OWNER TO animeclub_owner;

REASSIGN OWNED BY animeclub_app TO animeclub_owner;

GRANT CONNECT ON DATABASE animeclub TO animeclub_app;
GRANT USAGE ON SCHEMA public TO animeclub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO animeclub_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO animeclub_app;

ALTER DEFAULT PRIVILEGES FOR ROLE animeclub_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO animeclub_app;

ALTER DEFAULT PRIVILEGES FOR ROLE animeclub_owner IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO animeclub_app;

REVOKE CREATE ON SCHEMA public FROM animeclub_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE animeclub FROM PUBLIC;

COMMIT;
