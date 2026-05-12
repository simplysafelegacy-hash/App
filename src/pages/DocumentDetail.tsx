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
        <div className="container py-20 text-center max-w-xl mx-auto">
          <h1 className="text-3xl font-bold mb-3">Document not found</h1>
          <p className="text-muted-foreground mb-8">
            It may have been removed, or the link is incorrect.
          </p>
          <Link to="/dashboard" className="btn-primary">
            Back to vault
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
      <div className="container py-8 md:py-12 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            Back to vault
          </button>

          {permissions.canModify && (
            <div className="flex items-center gap-2">
              <button className="btn-secondary !min-h-[40px] !px-3 text-sm">
                <Pencil size={14} strokeWidth={1.75} />
                Edit
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                className="btn-secondary !min-h-[40px] !px-3 text-sm !text-destructive hover:!bg-destructive/10"
              >
                <Trash2 size={14} strokeWidth={1.75} />
                Delete
              </button>
            </div>
          )}
        </div>

        <header className="mb-8">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {documentTypeLabels[doc.type]}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-balance">
            {doc.name}
          </h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {doc.hasFile && (
              <Spec label="Digital copy">
                <div className="card-surface p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-medium truncate">
                      {doc.fileName ?? "Document on file"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Encrypted at rest
                    </p>
                  </div>
                  {permissions.canDownload ? (
                    <button
                      onClick={onDownload}
                      disabled={downloading}
                      className="btn-secondary !min-h-[40px] !px-3 text-sm shrink-0 ml-4"
                    >
                      <Download size={14} strokeWidth={1.75} />
                      {downloading ? "Retrieving…" : "Download"}
                    </button>
                  ) : (
                    <span className="text-sm text-muted-foreground shrink-0 ml-4">
                      Sealed until released
                    </span>
                  )}
                </div>
                {downloadError && (
                  <p className="text-destructive text-sm mt-2">
                    {downloadError}
                  </p>
                )}
              </Spec>
            )}

            <Spec label="Where the original is kept">
              <p className="text-xl font-semibold mb-1">
                {locationTypeLabels[doc.locationType]}
              </p>
              <p className="text-foreground">{doc.address}</p>
              {doc.description && (
                <p className="text-muted-foreground mt-2 leading-relaxed">
                  {doc.description}
                </p>
              )}
            </Spec>

            {permissions.isOwner && (
              <Spec label="Who may view this document">
                {visibleMembers.length === 0 ? (
                  <p className="text-muted-foreground">
                    No one named. This document is private to you.
                  </p>
                ) : (
                  <ul className="card-surface divide-y divide-border">
                    {visibleMembers.map((m) => (
                      <li
                        key={m.id}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <span className="w-9 h-9 rounded-full bg-secondary inline-flex items-center justify-center text-sm font-semibold shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {m.name}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {m.email}
                          </p>
                        </div>
                        <span className="text-xs font-medium bg-muted text-muted-foreground rounded px-2 py-0.5 shrink-0">
                          {roleLabel[m.role]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Spec>
            )}
          </div>

          <aside className="space-y-6">
            <Spec label="Recorded">
              <p className="text-base tnum">
                {new Date(doc.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Spec>

            <Spec label="Last updated">
              <p className="text-base tnum">
                {new Date(doc.lastUpdated).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Spec>

            <Spec label="Reference">
              <p className="font-mono text-xs text-muted-foreground break-all">
                {doc.id}
              </p>
            </Spec>
          </aside>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-foreground/30 flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="card-surface max-w-md w-full p-6 bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold mb-3">Delete this document?</h3>
            <p className="text-muted-foreground mb-6">
              The record of this document will be removed from your vault. The
              physical document remains wherever you've kept it.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary"
              >
                Keep it
              </button>
              <button onClick={onDelete} className="btn-destructive">
                Delete
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
      <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}
