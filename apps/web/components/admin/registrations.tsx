"use client";
import { showMobile, type Paged, type Registration } from "@gs/api/shared";
import { Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { messageOf } from "@/lib/api";
import { downloadCsv } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { useDebounced, useLoad } from "@/lib/hooks";
import { useUrlParams } from "@/lib/url-state";
import { Alert, Button, ConfirmDialog, Empty, LoadView, Pager, SidePanel } from "../crm";

/**
 * The people who registered on a tenant's page. Search and page live in the URL, so a reload or a shared link shows
 * the same view. The list is paged on the server (25 a time). A row opens a side panel that holds every action.
 */
export function RegistrationsView({ load, onDelete, exportPath, cacheKey = "own" }: {
  load: (q: string, page: number) => Promise<Paged<Registration>>;
  onDelete?: (id: string) => Promise<unknown>;
  exportPath?: string;
  cacheKey?: string;
}) {
  const url = useUrlParams();
  const page = Math.max(1, Number(url.get("page")) || 1);
  const urlQ = url.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ((cur) => (cur.trim() === urlQ ? cur : urlQ)), [urlQ]); // Back and Forward change the URL
  const debounced = useDebounced(q.trim());
  useEffect(() => {
    if (debounced !== urlQ) url.set({ q: debounced || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const state = useLoad(() => load(urlQ, page), [urlQ, page, cacheKey]);
  const [open, setOpen] = useState<Registration | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function remove() {
    if (!open || !onDelete) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(open.id);
      setConfirm(false);
      setOpen(null);
      state.reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    if (!exportPath) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadCsv(exportPath, `registrations-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setExportError(messageOf(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="cr-section">
      <div className="cr-toolbar">
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 360 }}>
          <Search size={16} aria-hidden style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-fg)" }} />
          <input className="cr-input" style={{ paddingLeft: 32, maxWidth: "none" }} type="search" placeholder="Search name, email, mobile, city" aria-label="Search registrations" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {exportPath && <Button onClick={exportCsv} busy={exporting}><Download size={16} aria-hidden /> Export CSV</Button>}
      </div>
      {exportError && <Alert tone="error">{exportError}</Alert>}
      {exportPath && <p className="cr-hint">Exports are logged, with the number of rows and when.</p>}

      <LoadView state={state}>
        {(data) =>
          data.rows.length === 0 ? (
            <Empty action={page > 1 ? <Button onClick={() => url.set({ page: null })}>Back to the first page</Button> : undefined}>{urlQ ? "No one matches that search." : page > 1 ? "There is nothing on this page." : "No registrations yet. They appear here as people register on your page."}</Empty>
          ) : (
            <>
              <div className="hidden md:block cr-tablewrap">
                <table className="cr-table">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Mobile</th><th scope="col">City</th><th scope="col">Registered</th></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} data-click onClick={() => setOpen(r)}>
                        <td><button type="button" className="cr-btn cr-btn--ghost" style={{ height: "auto", padding: 0, fontWeight: 500 }} onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.full_name}</button></td>
                        <td>{r.email}</td>
                        <td className="tnum">{showMobile(r.mobile)}</td>
                        <td>{r.city}</td>
                        <td className="tnum cr-muted">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden cr-cards">
                {data.rows.map((r) => (
                  <button key={r.id} type="button" className="cr-rowcard" onClick={() => setOpen(r)}>
                    <span className="cr-rowcard__top"><strong>{r.full_name}</strong><span className="cr-muted tnum" style={{ fontSize: 13 }}>{formatDate(r.created_at)}</span></span>
                    <span className="cr-rowcard__kv">
                      <span className="cr-rowcard__k">Email</span><span className="cr-rowcard__v">{r.email}</span>
                      <span className="cr-rowcard__k">Mobile</span><span className="cr-rowcard__v tnum">{showMobile(r.mobile)}</span>
                      <span className="cr-rowcard__k">City</span><span className="cr-rowcard__v">{r.city}</span>
                    </span>
                  </button>
                ))}
              </div>
              <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={(p) => url.set({ page: p === 1 ? null : String(p) })} />
            </>
          )
        }
      </LoadView>

      <SidePanel open={open !== null} title="Registration" onClose={() => setOpen(null)}>
        {open && (
          <>
            <dl className="cr-kv">
              <dt>Name</dt><dd>{open.full_name}</dd>
              <dt>Email</dt><dd>{open.email}</dd>
              <dt>Mobile</dt><dd className="tnum">{showMobile(open.mobile)}</dd>
              <dt>City</dt><dd>{open.city}</dd>
              <dt>Type</dt><dd>{open.member_type}</dd>
              <dt>Registered</dt><dd>{formatDate(open.created_at)}</dd>
            </dl>
            {onDelete && (
              <>
                <hr className="cr-divider" />
                <p className="cr-hint">Someone who asks to be removed can be deleted here. This cannot be undone, and the deletion is logged.</p>
                <Button variant="secondary" onClick={() => setConfirm(true)}>Delete this registration</Button>
              </>
            )}
          </>
        )}
      </SidePanel>
      <ConfirmDialog open={confirm} title="Delete this registration?" confirmLabel="Delete registration" busy={busy} error={error} onConfirm={remove} onCancel={() => { setConfirm(false); setError(null); }}>
        <p>{open?.full_name} will be removed from your list. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
