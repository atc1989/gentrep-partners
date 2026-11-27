"use client";
import { INVITE_CODE_RE, showMobile, type Paged, type Registration } from "@gs/api/shared";
import { Check, Copy, Download, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { messageOf } from "@/lib/api";
import { downloadCsv } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { useDebounced, useLoad } from "@/lib/hooks";
import { useUrlParams } from "@/lib/url-state";
import { QrCode, type QrHandle } from "../qr";
import { Alert, Button, ConfirmDialog, Empty, LoadView, Pager, SidePanel } from "../crm";

const invitedBy = (r: Registration) => (r.referred_by_code == null ? null : `${r.referred_by_name ?? "Someone"} #${r.referred_by_code}`);

/** A person's invite link and its QR. The link is on the tenant's own host, which is the host the admin runs on. */
function InviteBlock({ code, name, onShowInvited }: { code: number; name: string; onShowInvited: () => void }) {
  const qr = useRef<QrHandle>(null);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const link = `${location.origin}/j/${code}`;
  useEffect(() => {
    if (copy === "idle") return;
    const t = setTimeout(() => setCopy("idle"), 3000);
    return () => clearTimeout(t);
  }, [copy]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <section className="cr-qr" aria-label="Invite QR">
      <h3 className="cr-label">Invite QR</h3>
      <div className="cr-qr__img"><QrCode ref={qr} value={link} label={`QR code that opens the invite link of ${name}`} filename={`invite-qr-${code}.png`} size={200} /></div>
      <p className="cr-qr__link tnum">{link}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button onClick={copyLink}>{copy === "done" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} Copy link</Button>
        <Button onClick={() => qr.current?.download()}><Download size={16} aria-hidden /> Download PNG</Button>
      </div>
      <p className="cr-hint" role="status">{copy === "done" ? "Link copied." : copy === "failed" ? "Could not copy. Select the link above and copy it by hand." : ""}</p>
      <Button onClick={onShowInvited}>Show people they invited</Button>
    </section>
  );
}

/**
 * The people who registered on a tenant's page. Search, page and the invite-code filter live in the URL, so a reload
 * or a shared link shows the same view. The list is paged on the server (25 a time). A row opens a side panel that
 * holds every action. `canFilterByCode` is for the view whose endpoint takes a code (the tenant's own admin).
 */
export function RegistrationsView({ load, onDelete, exportPath, canFilterByCode, cacheKey = "own" }: {
  load: (q: string, page: number, ref?: number) => Promise<Paged<Registration>>;
  onDelete?: (id: string) => Promise<unknown>;
  exportPath?: string;
  canFilterByCode?: boolean;
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

  const urlRef = canFilterByCode ? url.get("ref") : null;
  const refCode = urlRef && INVITE_CODE_RE.test(urlRef) ? Number(urlRef) : null; // a bad value in the address is ignored
  const [inviter, setInviter] = useState<{ code: number; name: string | null } | null>(null); // the name is only known after a click
  const inviterName = inviter && inviter.code === refCode ? inviter.name : null;
  const filterByCode = (code: number, name: string | null) => { setInviter({ code, name }); url.set({ ref: String(code), page: null }); };

  const state = useLoad(() => load(urlQ, page, refCode ?? undefined), [urlQ, page, refCode, cacheKey]);
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
      {refCode !== null && (
        <div className="cr-chip">
          <span>Invited by {inviterName ? `${inviterName} ` : ""}<span className="tnum">#{refCode}</span></span>
          <Button variant="ghost" aria-label="Show everyone, clear the invite code filter" onClick={() => url.set({ ref: null, page: null })}><X size={16} aria-hidden /></Button>
        </div>
      )}
      {exportError && <Alert tone="error">{exportError}</Alert>}
      {exportPath && <p className="cr-hint">Exports are logged, with the number of rows and when.</p>}

      <LoadView state={state}>
        {(data) =>
          data.rows.length === 0 ? (
            <Empty action={page > 1 ? <Button onClick={() => url.set({ page: null })}>Back to the first page</Button> : refCode !== null ? <Button onClick={() => url.set({ ref: null, page: null })}>Show everyone</Button> : undefined}>
              {urlQ ? "No one matches that search." : page > 1 ? "There is nothing on this page." : refCode !== null ? "Nobody has joined with this code yet." : "No registrations yet. They appear here as people register on your page."}
            </Empty>
          ) : (
            <>
              <div className="hidden md:block cr-tablewrap">
                <table className="cr-table">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col" className="hidden xl:table-cell">Mobile</th><th scope="col" className="hidden xl:table-cell">City</th><th scope="col">Code</th><th scope="col">Invited by</th><th scope="col">Registered</th></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} data-click onClick={() => setOpen(r)}>
                        <td><button type="button" className="cr-btn cr-btn--ghost" style={{ height: "auto", padding: 0, fontWeight: 500 }} onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.name_prefix ? `${r.name_prefix} ` : ""}{r.full_name}</button></td>
                        <td>{r.email}</td>
                        <td className="tnum hidden xl:table-cell">{showMobile(r.mobile)}</td>
                        <td className="hidden xl:table-cell">{r.city}</td>
                        <td className="tnum">{r.member_code}</td>
                        <td>{invitedBy(r) ?? <span className="cr-muted" aria-label="Nobody">—</span>}</td>
                        <td className="tnum cr-muted">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden cr-cards">
                {data.rows.map((r) => (
                  <button key={r.id} type="button" className="cr-rowcard" onClick={() => setOpen(r)}>
                    <span className="cr-rowcard__top"><strong>{r.name_prefix ? `${r.name_prefix} ` : ""}{r.full_name}</strong><span className="cr-muted tnum" style={{ fontSize: 13 }}>{formatDate(r.created_at)}</span></span>
                    <span className="cr-rowcard__kv">
                      <span className="cr-rowcard__k">Email</span><span className="cr-rowcard__v">{r.email}</span>
                      <span className="cr-rowcard__k">Mobile</span><span className="cr-rowcard__v tnum">{showMobile(r.mobile)}</span>
                      <span className="cr-rowcard__k">City</span><span className="cr-rowcard__v">{r.city}</span>
                      <span className="cr-rowcard__k">Code</span><span className="cr-rowcard__v tnum">#{r.member_code}</span>
                      <span className="cr-rowcard__k">Invited by</span><span className="cr-rowcard__v">{invitedBy(r) ?? "—"}</span>
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
              {open.name_prefix && <><dt>Title</dt><dd>{open.name_prefix}</dd></>}
              <dt>Name</dt><dd>{open.full_name}</dd>
              <dt>Email</dt><dd>{open.email}</dd>
              <dt>Mobile</dt><dd className="tnum">{showMobile(open.mobile)}</dd>
              <dt>City</dt><dd>{open.city}</dd>
              {open.category && <><dt>Category</dt><dd>{open.category}</dd></>}
              {open.address && <><dt>Address</dt><dd>{open.address}</dd></>}
              {open.source && <><dt>Where found</dt><dd>{open.source}</dd></>}
              <dt>Type</dt><dd>{open.member_type}</dd>
              {open.member_code != null && <><dt>Code</dt><dd className="tnum">#{open.member_code}</dd></>}
              {open.referred_by_code != null && (
                <>
                  <dt>Invited by</dt>
                  <dd>
                    {open.referred_by_name ?? "Someone"}{" "}
                    {canFilterByCode ? (
                      <Button small variant="ghost" aria-label={`Show everyone invited by code ${open.referred_by_code}`} onClick={() => { filterByCode(open.referred_by_code!, open.referred_by_name); setOpen(null); }}>
                        <span className="tnum">#{open.referred_by_code}</span>
                      </Button>
                    ) : <span className="tnum">#{open.referred_by_code}</span>}
                  </dd>
                </>
              )}
              <dt>Registered</dt><dd>{formatDate(open.created_at)}</dd>
            </dl>
            {onDelete && exportPath && open.member_code != null && (
              <>
                <hr className="cr-divider" />
                <InviteBlock code={open.member_code} name={open.full_name} onShowInvited={() => { filterByCode(open.member_code, open.full_name); setOpen(null); }} />
              </>
            )}
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
