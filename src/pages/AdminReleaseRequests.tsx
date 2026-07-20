import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, ExternalLink, RefreshCw, X } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { useApp } from "@/context/AppContext";
import { api, ApiError } from "@/lib/api";
import type { AdminReleaseRequest, AdminReleaseRequestFile } from "@/lib/types";
import { documentLabel } from "@/lib/permissions";

type ReviewStatus = "pending" | "approved" | "rejected" | "all";

const statusLabels: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  all: "All",
};

export default function AdminReleaseRequests() {
  const { currentUser, isAuthenticated, loading } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [requests, setRequests] = useState<AdminReleaseRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) navigate("/login");
    else if (!currentUser?.isAdmin) navigate("/dashboard");
  }, [currentUser?.isAdmin, isAuthenticated, loading, navigate]);

  const loadRequests = async (nextStatus = status) => {
    setLoadingRequests(true);
    setError(null);
    try {
      const data = await api.admin.releaseRequests(nextStatus);
      setRequests(data);
      setSelectedId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load release requests");
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (currentUser?.isAdmin) loadRequests(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.isAdmin, status]);

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId],
  );

  const review = async (request: AdminReleaseRequest, nextStatus: "approved" | "rejected") => {
    setBusyId(request.id);
    setError(null);
    try {
      const updated =
        nextStatus === "approved"
          ? await api.admin.approveReleaseRequest(request.id, reviewNote)
          : await api.admin.rejectReleaseRequest(request.id, reviewNote);
      setRequests((current) =>
        current
          .map((item) => (item.id === updated.id ? updated : item))
          .filter((item) => status === "all" || item.status === status),
      );
      setReviewNote("");
      setSelectedId(updated.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Review failed");
    } finally {
      setBusyId(null);
    }
  };

  if (!currentUser?.isAdmin) return null;

  return (
    <Layout>
      <div className="container py-7 md:py-10">
        <header className="mb-7 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Admin</p>
            <h1 className="text-2xl md:text-3xl font-semibold mb-2">
              Release review
            </h1>
            <p className="text-base text-muted-foreground max-w-2xl">
              Review proof uploads, then approve or reject release of the
              specific document section.
            </p>
          </div>
          <button
            onClick={() => loadRequests()}
            className="btn-secondary"
            disabled={loadingRequests}
          >
            <RefreshCw size={16} strokeWidth={1.75} />
            Refresh
          </button>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {(Object.keys(statusLabels) as ReviewStatus[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`px-3 py-2 rounded-md border text-sm font-medium ${
                status === item
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {statusLabels[item]}
            </button>
          ))}
        </div>

        {error && (
          <div className="border border-destructive/30 bg-destructive/5 text-destructive rounded-md p-4 mb-5 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          <aside className="card-surface overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold">{statusLabels[status]} requests</h2>
              <span className="text-sm text-muted-foreground">{requests.length}</span>
            </div>
            {requests.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {loadingRequests ? "Loading..." : "No requests here."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {requests.map((request) => (
                  <li key={request.id}>
                    <button
                      onClick={() => setSelectedId(request.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                        selected?.id === request.id ? "bg-secondary/50" : ""
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">
                        {documentLabel[request.documentType]}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {request.vaultName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(request.createdAt).toLocaleString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {selected ? (
            <ReviewDetail
              request={selected}
              busy={busyId === selected.id}
              note={reviewNote}
              onNote={setReviewNote}
              onApprove={() => review(selected, "approved")}
              onReject={() => review(selected, "rejected")}
            />
          ) : (
            <section className="card-surface p-8 text-center text-muted-foreground">
              Select a request to review.
            </section>
          )}
        </div>
      </div>
    </Layout>
  );
}

function ReviewDetail({
  request,
  busy,
  note,
  onNote,
  onApprove,
  onReject,
}: {
  request: AdminReleaseRequest;
  busy: boolean;
  note: string;
  onNote: (note: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <section className="card-surface p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            {request.releaseReason === "death" ? "Death release" : "Incapacity release"}
          </p>
          <h2 className="text-xl font-semibold">
            {documentLabel[request.documentType]}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Submitted {new Date(request.createdAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        <InfoBlock
          title="Vault owner"
          lines={[request.ownerName, request.ownerEmail, request.vaultName]}
        />
        <InfoBlock
          title="Requester"
          lines={[
            request.requesterName || "Unknown requester",
            request.requesterEmail,
            request.requesterDateOfBirth
              ? `Born ${formatBirthday(request.requesterDateOfBirth)}`
              : "Birthday not recorded",
          ]}
        />
      </div>

      <div className="mb-6">
        <h3 className="text-base font-semibold mb-3">Proof files</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {request.files.map((file) => (
            <FileButton key={file.id} file={file} />
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="field-label">Review note</label>
        <textarea
          value={note}
          onChange={(event) => onNote(event.target.value)}
          placeholder="Optional internal note"
          className="field min-h-[96px] resize-none"
        />
      </div>

      {request.status === "pending" ? (
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button onClick={onReject} className="btn-secondary" disabled={busy}>
            <X size={16} strokeWidth={1.75} />
            Reject
          </button>
          <button onClick={onApprove} className="btn-primary" disabled={busy}>
            <Check size={16} strokeWidth={1.75} />
            Approve release
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Reviewed by {request.reviewedBy || "an admin"}
          {request.reviewedAt ? ` on ${new Date(request.reviewedAt).toLocaleString()}` : ""}.
        </p>
      )}
    </section>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="border border-border rounded-md p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {lines.filter(Boolean).map((line) => (
        <p key={line} className="text-sm text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

function FileButton({ file }: { file: AdminReleaseRequestFile }) {
  const [busy, setBusy] = useState(false);
  const openFile = async () => {
    setBusy(true);
    try {
      const blob = await api.admin.downloadReleaseFile(file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openFile}
      className="border border-border rounded-md p-4 text-left hover:bg-muted transition-colors"
      disabled={busy}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium truncate">{file.fileName}</span>
        {busy ? <Download size={16} /> : <ExternalLink size={16} />}
      </span>
      <span className="text-xs text-muted-foreground mt-1 block">
        {file.contentType || "File"} · {formatBytes(file.fileSize)}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: AdminReleaseRequest["status"] }) {
  const styles = {
    pending: "bg-secondary text-foreground",
    approved: "bg-primary text-primary-foreground",
    rejected: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`px-2 py-1 rounded-sm text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatBirthday(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${month}/${day}/${year}`;
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
