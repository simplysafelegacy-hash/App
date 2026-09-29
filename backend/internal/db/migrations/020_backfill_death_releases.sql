-- 020_backfill_death_releases.sql — open the sections an earlier approval
-- could not.
--
-- Until this release, approving a death certificate wrote release rows only
-- for the documents the request named (in practice the will, and later the
-- trust). Personal property, non-probate assets, funeral wishes and contacts
-- were grantable "after death" in the member picker but had no code path that
-- ever released them: admin approval is the only writer of
-- vault_document_releases, and the owner — the only other releaser — cannot
-- act once dead. So those grants were permanently unreachable.
--
-- Approval now opens every death-operative section. This backfills the vaults
-- that were approved before that, so an existing successor sees what the owner
-- actually granted them instead of a silently truncated vault.
--
-- Safe by construction: a release row grants nothing on its own. CanReadDocument
-- still requires a matching permission row, so this opens exactly the grants
-- the owner already made and nothing else. Only vaults with an *approved death*
-- request are touched; incapacity approvals were always correct (they release
-- the power of attorney and health care directive only, which is the point of
-- incapacity being document-specific).
--
-- The section list must match handlers.deathOperativeSections(); a test asserts
-- the two agree.

INSERT INTO vault_document_releases (
    vault_id, document_type, release_request_id, released_by
)
SELECT DISTINCT ON (rr.vault_id, s.document_type)
       rr.vault_id, s.document_type, rr.id, rr.reviewed_by
FROM release_requests rr
CROSS JOIN (VALUES
    ('will'),
    ('trust'),
    ('personal_property'),
    ('non_probate'),
    ('funeral'),
    ('contacts')
) AS s(document_type)
WHERE rr.status = 'approved'
  AND rr.release_reason = 'death'
ORDER BY rr.vault_id, s.document_type, rr.reviewed_at DESC NULLS LAST
ON CONFLICT (vault_id, document_type) DO NOTHING;
