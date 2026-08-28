-- 013_s3_storage_rename.sql
--
-- Document storage moved from Google Cloud Storage to Amazon S3. The columns
-- held a bucket name and an object path, which are backend-agnostic concepts,
-- so this renames them rather than adding new ones:
--
--   gcs_bucket -> storage_bucket
--   gcs_object -> storage_key   ("key" is S3's term for an object path)
--
-- Existing rows keep their values. Any row written before the migration still
-- points at a GCS bucket and will not resolve against S3 — those objects need
-- copying into the S3 bucket, or the rows deleting, as a separate data step.
--
-- Each rename is guarded on the old column still being present. The
-- schema_migrations table already prevents a second run, but a guard means a
-- half-applied or hand-patched database converges instead of failing boot.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'release_request_files' AND column_name = 'gcs_bucket'
    ) THEN
        ALTER TABLE release_request_files RENAME COLUMN gcs_bucket TO storage_bucket;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'release_request_files' AND column_name = 'gcs_object'
    ) THEN
        ALTER TABLE release_request_files RENAME COLUMN gcs_object TO storage_key;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vault_attachments' AND column_name = 'gcs_bucket'
    ) THEN
        ALTER TABLE vault_attachments RENAME COLUMN gcs_bucket TO storage_bucket;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vault_attachments' AND column_name = 'gcs_object'
    ) THEN
        ALTER TABLE vault_attachments RENAME COLUMN gcs_object TO storage_key;
    END IF;
END $$;
