import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { documentTypeLabels, locationTypeLabels } from "@/lib/mockData";
import { roleLabel } from "@/lib/permissions";
import { ArrowLeft, Download, Pencil, Trash2 } from "lucide-react";

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { vault, deleteDocument, downloadDocument, permissions } = useApp();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const doc = vault?.documents.find((d) => d.id === id);

  if (!doc) {
    return (
      <Layout>
        <div className="container py-24 text-center">
          <p className="eyebrow mb-5">Not on file</p>
          <h1 className="display-serif text-5xl">We cannot find that entry.</h1>
          <p className="mt-5 italic-serif text-ink-muted">
            It may have been removed, or the link is incorrect.
          </p>
          <Link to="/dashboard" className="btn-ink mt-10">
            Return to your vault
          </Link>
        </div>
      </Layout>
    );
  }

  const visibleMembers =
    vault?.members.filter((m) => doc.memberIds.includes(m.id)) ?? [];

  const onDelete = async () => {
    await deleteDocument(doc.id);
    navigate("/dashboard");
  };

  const onDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadDocument(doc.id);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Could not retrieve the file",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Layout>
      <div className="container py-10 md:py-14 max-w-4xl">
        <div className="flex items-center justify-between mb-10">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-[15px] text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            Back to the vault
          </button>

          {permissions.canModify && (
            <div className="flex items-center gap-2">
              <button className="btn-ghost !min-h-[40px] !py-2 !px-4 !text-[14px]">
                <Pencil size={14} strokeWidth={1.5} />
                Amend
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                className="btn-ghost !min-h-[40px] !py-2 !px-4 !text-[14px] !text-seal hover:!bg-seal-soft"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Remove
              </button>
            </div>
          )}
        </div>

        <header className="mb-12 fade-in-up">
          <div className="flex items-start justify-between gap-6 mb-8">
            <div>
              <p className="eyebrow mb-3">
                Entry · {documentTypeLabels[doc.type]}
              </p>
              <h1 className="display-serif text-5xl md:text-6xl leading-[1.0] text-balance">
                {doc.name}
              </h1>
            </div>
            <div
              className="seal-mark shrink-0"
              style={{
                width: 72,
                height: 72,
                fontSize: 32,
                transform: "rotate(-6deg)",
                boxShadow:
                  "inset 0 0 0 2px hsl(var(--paper)/.2), 0 2px 8px hsl(36 12% 9%/.12)",
              }}
            >
              S
            </div>
          </div>
          <div className="rule" />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14 fade-in-up delay-200">
          <div className="lg:col-span-2 space-y-12">
            {doc.hasFile && (
              <Spec label="Digital copy">
                <div
                  className="flex items-center justify-between border border-hairline p-5"
                  style={{ borderRadius: "2px" }}
                >
                  <div className="min-w-0">
                    <p className="font-serif text-xl truncate">
                      {doc.fileName ?? "Document on file"}
                    </p>
                    <p className="italic-serif text-sm text-ink-subtle mt-1">
                      Encrypted at rest · Released only on request
                    </p>
                  </div>
                  {permissions.canDownload ? (
                    <button
                      onClick={onDownload}
                      disabled={downloading}
                      className="btn-ghost !min-h-[44px] !py-2 !px-4 !text-[14px] shrink-0 ml-4"
                    >
                      <Download size={14} strokeWidth={1.5} />
                      {downloading ? "Retrieving…" : "Retrieve"}
                    </button>
                  ) : (
                    <span className="italic-serif text-sm text-ink-subtle shrink-0 ml-4">
                      Sealed until released
                    </span>
                  )}
                </div>
                {downloadError && (
                  <p className="italic-serif text-seal text-sm mt-2">
                    {downloadError}
                  </p>
                )}
              </Spec>
            )}

            <Spec label="Where the original rests">
              <p
                className="font-serif text-2xl tracking-tight mb-1"
                style={{ fontVariationSettings: "'opsz' 48" }}
              >
                {locationTypeLabels[doc.locationType]}
              </p>
              <p className="text-ink text-[17px]">{doc.address}</p>
              {doc.description && (
                <p className="italic-serif text-ink-muted mt-3 leading-relaxed">
                  {doc.description}
                </p>
              )}
            </Spec>

            {permissions.isOwner && (
              <Spec label="Who may view this entry">
                {visibleMembers.length === 0 ? (
                  <p className="italic-serif text-ink-muted">
                    No one named. This entry is private to you.
                  </p>
                ) : (
                  <ul className="divide-y divide-hairline-soft border-y border-hairline-soft">
                    {visibleMembers.map((m) => (
                      <li
                        key={m.id}
                        className="py-4 flex items-center gap-4"
                      >
                        <span
                          className="seal-mark"
                          style={{ width: 38, height: 38, fontSize: 17 }}
                        >
                          {m.name.charAt(0)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-ink truncate">
                            {m.name}
                          </p>
                          <p className="text-sm text-ink-subtle truncate">
                            {m.email}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm shrink-0 ${
                            m.role === "steward"
                              ? "bg-seal-soft text-seal border border-seal/20"
                              : "bg-paper-sunk text-ink-muted border border-hairline"
                          }`}
                        >
                          {roleLabel[m.role]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Spec>
            )}
          </div>

          <aside className="lg:col-span-1 lg:border-l lg:border-hairline lg:pl-10">
            <Spec label="Recorded">
              <p className="font-serif text-xl tnum">
                {new Date(doc.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Spec>

            <div className="rule-dotted my-8" />

            <Spec label="Last amended">
              <p className="font-serif text-xl tnum">
                {new Date(doc.lastUpdated).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Spec>

            <div className="rule-dotted my-8" />

            <Spec label="Reference">
              <p className="font-mono text-sm text-ink-muted break-all">
                {doc.id}
              </p>
            </Spec>
          </aside>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="paper-card max-w-md w-full p-8"
            style={{ borderRadius: "2px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="eyebrow mb-4">A final question</p>
            <h3 className="font-serif text-3xl mb-4 tracking-tight">
              Remove this entry?
            </h3>
            <p className="italic-serif text-ink-muted mb-8">
              Once removed, the record of this paper will be gone from your
              vault. The physical document remains wherever you've kept it.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="btn-ghost"
              >
                Keep it
              </button>
              <button onClick={onDelete} className="btn-seal">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Spec({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="eyebrow mb-3">{label}</p>
      {children}
    </div>
  );
}
