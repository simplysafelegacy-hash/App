-- 019_release_request_documents.sql — one proof packet, many documents.
--
-- A single piece of evidence answers for every document it proves. Two
-- physician certifications establish incapacity, which is the trigger for both
-- the power of attorney and the health care directive; a death certificate
-- establishes death, which is the trigger for both the will and the trust.
-- Requiring the same PDF to be uploaded once per document made the submitter
-- do the work N times and made the admin review the same packet N times.
--
-- So a release request now covers a SET of documents. release_requests.
-- document_type is kept as the representative document (it is NOT NULL, and
-- older rows and any client that still posts a single documentType keep
-- working); this table is the authoritative coverage set, and approval
-- releases every document listed here.

CREATE TABLE IF NOT EXISTS release_request_documents (
    release_request_id UUID NOT NULL REFERENCES release_requests(id) ON DELETE CASCADE,
    document_type      TEXT NOT NULL,
    PRIMARY KEY (release_request_id, document_type)
);

-- Every request that predates this table covered exactly the one document it
-- named, so the backfill is a straight copy. Idempotent.
INSERT INTO release_request_documents (release_request_id, document_type)
SELECT id, document_type FROM release_requests
ON CONFLICT DO NOTHING;

-- The per-member submission cap counts through this table.
CREATE INDEX IF NOT EXISTS release_request_documents_type_idx
    ON release_request_documents (document_type);
