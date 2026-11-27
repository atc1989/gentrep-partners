"use client";
// Super-admin screens: tenants, one tenant, reserved addresses, audit log. The API checks the caller on every request.
import { isSlug, SLUG_RE, type AuditRow } from "@gs/api/shared";
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { api, call, messageOf } from "@/lib/api";
import { ACTOR, describe } from "@/lib/audit";
import { siteUrl } from "@/lib/config";
import { count, formatDate, formatDay } from "@/lib/format";
import { useDebounced, useLoad } from "@/lib/hooks";
import { useUrlParams } from "@/lib/url-state";
import { Alert, Badge, Button, ConfirmDialog, Empty, LoadView, PageTitle, Pager, TextArea, TextField } from "../crm";
import { RegistrationsView } from "./registrations";
import { SiteEditor } from "./site-editor";

const setPage = (url: ReturnType<typeof useUrlParams>) => (p: number) => url.set({ page: p === 1 ? null : String(p) });
const cardLink = { color: "inherit", textDecoration: "none" } as const;
const StatusBadge = ({ status }: { status: "active" | "suspended" }) =>
  status === "active" ? <Badge tone="up">Active</Badge> : <Badge tone="down">Suspended</Badge>;

// ---- tenants ----------------------------------------------------------------------------------

export function TenantsList() {
  const url = useUrlParams();
  const router = useRouter();
  const page = Math.max(1, Number(url.get("page")) || 1);
  const urlQ = url.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ((cur) => (cur.trim() === urlQ ? cur : urlQ)), [urlQ]); // Back and Forward change the URL
  const debounced = useDebounced(q.trim());
  useEffect(() => {
    if (debounced !== urlQ) url.set({ q: debounced || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  const state = useLoad(() => call(api.platform.tenants.get({ query: { q: urlQ || undefined, page } })), [urlQ, page]);

  return (
    <div className="cr-section">
      <div className="cr-toolbar">
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 360 }}>
          <Search size={16} aria-hidden style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-fg)" }} />
          <input className="cr-input" style={{ paddingLeft: 32, maxWidth: "none" }} type="search" placeholder="Search name, address, admin email" aria-label="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <LoadView state={state}>
        {(data) =>
          data.rows.length === 0 ? (
            <Empty action={page > 1 ? <Button onClick={() => url.set({ page: null })}>Back to the first page</Button> : undefined}>{urlQ ? "No site matches that search." : page > 1 ? "There is nothing on this page." : "No sites yet. They appear here when someone signs up."}</Empty>
          ) : (
            <>
              <div className="hidden md:block cr-tablewrap">
                <table className="cr-table">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Address</th><th scope="col">Status</th><th scope="col">Registrations</th><th scope="col">Created</th></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} data-click onClick={() => router.push(`/admin/tenants/${r.id}`)}>
                        <td><Link href={`/admin/tenants/${r.id}`} style={{ fontWeight: 500 }} onClick={(e) => e.stopPropagation()}>{r.name}</Link></td>
                        <td>{r.slug}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="tnum">{count(r.registrations)}</td>
                        <td className="tnum cr-muted">{formatDay(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden cr-cards">
                {data.rows.map((r) => (
                  <Link key={r.id} href={`/admin/tenants/${r.id}`} className="cr-rowcard" style={cardLink}>
                    <span className="cr-rowcard__top"><strong>{r.name}</strong><StatusBadge status={r.status} /></span>
                    <dl>
                      <dt>Address</dt><dd>{r.slug}</dd>
                      <dt>Registrations</dt><dd className="tnum">{count(r.registrations)}</dd>
                      <dt>Created</dt><dd className="tnum">{formatDay(r.created_at)}</dd>
                    </dl>
                  </Link>
                ))}
              </div>
              <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage(url)} />
            </>
          )
        }
      </LoadView>
    </div>
  );
}

// ---- one tenant -------------------------------------------------------------------------------

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "branding", label: "Branding" },
  { id: "registrations", label: "Registrations" },
  { id: "activity", label: "Activity" },
] as const;
type Dialog = "suspend" | "reactivate" | "slug" | "rename" | "support" | null;

export function TenantDetailView({ id }: { id: string }) {
  const url = useUrlParams();
  const tab = TABS.find((t) => t.id === url.get("tab"))?.id ?? "overview";
  const state = useLoad(() => call(api.platform.tenants({ id }).get()), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (d: Dialog, initial = "") => { setValue(initial); setError(null); setDialog(d); };
  const close = () => { setDialog(null); setError(null); };
  /** Runs a change, shows the API's own message in the dialog if it fails, reloads on success. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      state.reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: { slug?: string; name?: string; status?: "active" | "suspended" }) => run(() => call(api.platform.tenants({ id }).patch(body)));

  const go = (t: string) => url.set({ tab: t === "overview" ? null : t, q: null, page: null });
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length].id;
    go(t);
    document.getElementById(`tab-${t}`)?.focus();
  };

  return (
    <LoadView state={state}>
      {(d) => {
        const supportOpen = !!d.support_expires_at && new Date(d.support_expires_at).getTime() > Date.now();
        const slugError = value.trim() !== "" && !isSlug(value.trim()) ? "Use 3 to 40 letters, numbers or hyphens, with no double hyphens." : null;
        return (
          <div className="cr-section" style={{ gap: 16 }}>
            <PageTitle>{d.name}</PageTitle>
            <Link href="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, width: "fit-content" }}><ChevronLeft size={14} aria-hidden /> Tenants</Link>
            <div className="cr-page__head" style={{ justifyContent: "flex-start", gap: "8px 12px" }}>
              <h1>{d.name}</h1>
              <StatusBadge status={d.status} />
              <a href={siteUrl(d.slug)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14 }}>
                {siteUrl(d.slug).replace(/^https?:\/\//, "")} <ExternalLink size={14} aria-hidden /><span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>

            <div role="tablist" aria-label="Site sections" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid var(--border)" }}>
              {TABS.map((t, i) => (
                <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="tabpanel" tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => go(t.id)} onKeyDown={(e) => onKey(e, i)}
                  style={{ flex: "none", minHeight: 44, padding: "0 14px", background: "none", border: 0, borderBottom: `2px solid ${tab === t.id ? "var(--brand-ink)" : "transparent"}`, marginBottom: -1, color: tab === t.id ? "var(--foreground)" : "var(--muted-fg)", font: "inherit", fontWeight: tab === t.id ? 500 : 400, cursor: "pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === "overview" && (
                <div className="cr-card"><div className="cr-card__body cr-section" style={{ gap: 16 }}>
                  <dl className="cr-kv">
                    <dt>Name</dt><dd>{d.name}</dd>
                    <dt>Address</dt><dd>{d.slug}</dd>
                    <dt>Admin name</dt><dd>{d.admin_name ?? "—"}</dd>
                    <dt>Admin email</dt><dd>{d.admin_email ?? "—"}</dd>
                    <dt>Registrations</dt><dd className="tnum">{count(d.registrations)}</dd>
                    <dt>Created</dt><dd>{formatDay(d.created_at)}</dd>
                  </dl>
                  <hr className="cr-divider" />
                  <div className="cr-toolbar">
                    <Button onClick={() => open("rename", d.name)}>Rename</Button>
                    <Button onClick={() => open("slug", d.slug)}>Change address</Button>
                  </div>
                  <hr className="cr-divider" />
                  {d.status === "active"
                    ? <div><Button onClick={() => open("suspend")}>Suspend site</Button></div>
                    : <div><Button onClick={() => open("reactivate")}>Reactivate site</Button></div>}
                </div></div>
              )}
              {tab === "branding" && (
                <SiteEditor load={() => call(api.platform.tenants({ id }).site.get())} save={(s) => call(api.platform.tenants({ id }).site.put(s))} />
              )}
              {tab === "registrations" && (supportOpen ? (
                <div className="cr-section">
                  <p className="cr-statusline">Open until {formatDate(d.support_expires_at!)}</p>
                  <RegistrationsView load={(q, page) => call(api.platform.tenants({ id }).registrations.get({ query: { q: q || undefined, page } }))} cacheKey={id} />
                </div>
              ) : (
                <Alert tone="info" actions={<Button variant="primary" onClick={() => open("support")}>Open registrations</Button>}>
                  Registrations are private to the site. Open them for 1 hour with a reason. The site&apos;s admin can see your reason.
                </Alert>
              ))}
              {tab === "activity" && <AuditPanel tenant={id} />}
            </div>

            <ConfirmDialog open={dialog === "suspend"} title="Suspend this site?" confirmLabel="Suspend site" busy={busy} error={error} onConfirm={() => patch({ status: "suspended" })} onCancel={close}>
              <p>The admin is locked out and public pages show &ldquo;unavailable&rdquo;. Nothing is deleted. You can reactivate the site at any time.</p>
            </ConfirmDialog>
            <ConfirmDialog open={dialog === "reactivate"} title="Reactivate this site?" tone="primary" confirmLabel="Reactivate site" cancelLabel="Cancel" busy={busy} error={error} onConfirm={() => patch({ status: "active" })} onCancel={close}>
              <p>The admin can sign in again and the public pages open.</p>
            </ConfirmDialog>
            <ConfirmDialog open={dialog === "slug"} title="Change address" tone="primary" confirmLabel="Change address" cancelLabel="Cancel" busy={busy} error={error} confirmDisabled={!isSlug(value.trim()) || value.trim() === d.slug} onConfirm={() => patch({ slug: value.trim() })} onCancel={close}>
              <TextField label="Address" value={value} onChange={(v) => setValue(v.toLowerCase())} error={slugError} hint="The old address stops working. Letters, numbers and hyphens, 3 to 40." autoCapitalize="none" spellCheck={false} />
            </ConfirmDialog>
            <ConfirmDialog open={dialog === "rename"} title="Rename site" tone="primary" confirmLabel="Save name" cancelLabel="Cancel" busy={busy} error={error} confirmDisabled={value.trim().length < 2 || value.trim() === d.name} onConfirm={() => patch({ name: value.trim() })} onCancel={close}>
              <TextField label="Name" value={value} onChange={setValue} maxLength={80} hint="2 to 80 characters." />
            </ConfirmDialog>
            <ConfirmDialog open={dialog === "support"} title="Open registrations" tone="primary" confirmLabel="Open for 1 hour" cancelLabel="Cancel" busy={busy} error={error} confirmDisabled={value.trim().length < 10} onConfirm={() => run(() => call(api.platform.tenants({ id }).support.post({ reason: value.trim() })))} onCancel={close}>
              <TextArea label="Reason" value={value} onChange={setValue} maxLength={300} rows={4} hint={`At least 10 characters. ${value.length} of 300. The site's admin can see this.`} />
            </ConfirmDialog>
          </div>
        );
      }}
    </LoadView>
  );
}

// ---- reserved addresses -----------------------------------------------------------------------

export function ReservedList() {
  const state = useLoad(() => call(api.platform.reserved.get()), []);
  const [slug, setSlug] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const s = slug.trim().toLowerCase();
    if (!SLUG_RE.test(s)) return setAddError("Use 3 to 40 lowercase letters, numbers or hyphens. Start and end with a letter or number.");
    setAdding(true);
    setAddError(null);
    try {
      await call(api.platform.reserved.post({ slug: s }));
      setSlug("");
      state.reload();
    } catch (err) {
      setAddError(messageOf(err));
    } finally {
      setAdding(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await call(api.platform.reserved({ slug: removing }).delete());
      setRemoving(null);
      state.reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cr-section" style={{ gap: 16 }}>
      <p className="cr-hint">Reserved addresses cannot be taken by a new site, for example &ldquo;admin&rdquo; or &ldquo;www&rdquo;.</p>
      <form onSubmit={add} className="cr-section" style={{ maxWidth: 420 }} noValidate>
        <TextField label="Address to reserve" value={slug} onChange={(v) => setSlug(v.toLowerCase())} error={addError} autoCapitalize="none" spellCheck={false} />
        <div><Button type="submit" variant="primary" busy={adding}>Add address</Button></div>
      </form>
      <LoadView state={state}>
        {(list) =>
          list.length === 0 ? (
            <Empty>No reserved addresses yet.</Empty>
          ) : (
            <div className="cr-section">
              <h2 className="tnum">{count(list.length)} reserved</h2>
              <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
                {list.map((s) => (
                  <li key={s} style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 999, paddingLeft: 14 }}>
                    {s}
                    <Button variant="ghost" aria-label={`Remove ${s}`} onClick={() => { setError(null); setRemoving(s); }} style={{ width: 44, height: 44, padding: 0, borderRadius: 999 }}><X size={16} aria-hidden /></Button>
                  </li>
                ))}
              </ul>
            </div>
          )
        }
      </LoadView>
      <ConfirmDialog open={removing !== null} title="Remove from the reserved list?" confirmLabel="Remove address" busy={busy} error={error} onConfirm={remove} onCancel={() => { setRemoving(null); setError(null); }}>
        <p>Anyone can then take {removing} as an address.</p>
      </ConfirmDialog>
    </div>
  );
}

// ---- audit log --------------------------------------------------------------------------------

export const AuditView = () => <AuditPanel />;

/** The whole log, or one tenant's rows. The API sends no total, so a full page means there may be a next one. */
function AuditPanel({ tenant }: { tenant?: string }) {
  const url = useUrlParams();
  const page = Math.max(1, Number(url.get("page")) || 1);
  const state = useLoad(() => call(api.platform.audit.get({ query: { tenant, page } })), [tenant, page]);
  const who = (r: AuditRow) => r.actor_email ?? ACTOR[r.actor_kind];
  const site = (r: AuditRow) => (r.tenant_slug && r.tenant_id ? <Link href={`/admin/tenants/${r.tenant_id}`}>{r.tenant_slug}</Link> : <span className="cr-muted">—</span>);

  return (
    <LoadView state={state}>
      {(data) =>
        data.rows.length === 0 ? (
          <Empty action={page > 1 ? <Button onClick={() => url.set({ page: null })}>Back to the first page</Button> : undefined}>{page > 1 ? "No more entries." : "Nothing has been logged yet."}</Empty>
        ) : (
          <div className="cr-section">
            <div className="hidden md:block cr-tablewrap">
              <table className="cr-table">
                <thead>
                  <tr><th scope="col">When</th><th scope="col">Who</th>{!tenant && <th scope="col">Site</th>}<th scope="col">What</th></tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="tnum cr-muted" style={{ whiteSpace: "nowrap" }}>{formatDate(r.at)}</td>
                      <td>{who(r)}</td>
                      {!tenant && <td>{site(r)}</td>}
                      <td>{describe(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden cr-cards">
              {data.rows.map((r) => (
                <div key={r.id} className="cr-rowcard">
                  <span className="cr-rowcard__top"><strong>{who(r)}</strong><span className="cr-muted tnum" style={{ fontSize: 13 }}>{formatDate(r.at)}</span></span>
                  {!tenant && r.tenant_slug && <span style={{ fontSize: 13 }}>{site(r)}</span>}
                  <span>{describe(r)}</span>
                </div>
              ))}
            </div>
            <div className="cr-pager">
              <span className="tnum">Page {data.page}</span>
              <span style={{ display: "flex", gap: 8 }}>
                <Button small disabled={page <= 1} onClick={() => setPage(url)(page - 1)}><ChevronLeft size={16} aria-hidden /> Previous</Button>
                <Button small disabled={data.rows.length < data.page_size} onClick={() => setPage(url)(page + 1)}>Next <ChevronRight size={16} aria-hidden /></Button>
              </span>
            </div>
          </div>
        )
      }
    </LoadView>
  );
}
