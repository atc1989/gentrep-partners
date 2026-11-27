"use client";
import { ACTOR, describe } from "@/lib/audit";
import { PASSWORD_MAX, PASSWORD_MIN } from "@gs/api/shared";
import { useState, type FormEvent } from "react";
import { api, call, messageOf } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLoad } from "@/lib/hooks";
import { getSupabase } from "@/lib/supabase";
import { useUrlParams } from "@/lib/url-state";
import { Alert, Button, Empty, LoadView, TextField } from "../crm";

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const next: typeof errors = {};
    if (password.length < PASSWORD_MIN) next.password = `Use at least ${PASSWORD_MIN} characters. You have ${password.length}.`;
    else if (password.length > PASSWORD_MAX) next.password = `Use at most ${PASSWORD_MAX} characters.`;
    if (confirm !== password) next.confirm = "The two passwords are not the same. Type it again.";
    setErrors(next);
    if (next.password || next.confirm) return;
    setBusy(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setErrors({ password: error.message });
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  return (
    <form className="cr-section" onSubmit={submit} noValidate>
      <TextField label="New password" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters. A passphrase of a few words works well.`} error={errors.password} value={password} onChange={setPassword} />
      <TextField label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirm} value={confirm} onChange={setConfirm} />
      <div><Button type="submit" variant="primary" busy={busy}>Change password</Button></div>
      {done && <Alert tone="ok">Your password is changed. Use it the next time you sign in.</Alert>}
    </form>
  );
}

export function TenantNameForm({ name, onSaved }: { name: string; onSaved?: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const v = value.trim();
    if (v.length < 2 || v.length > 80) return setError("Use 2 to 80 characters.");
    setBusy(true);
    setError(null);
    try {
      await call(api.admin.account.patch({ name: v }));
      setValue(v);
      setDone(true);
      onSaved?.(v);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cr-section" onSubmit={submit} noValidate>
      <TextField label="Business name" maxLength={80} error={error} value={value} onChange={setValue} />
      <div><Button type="submit" variant="primary" busy={busy}>Save name</Button></div>
      {done && <Alert tone="ok">Name saved.</Alert>}
    </form>
  );
}

export function ActivityList() {
  const url = useUrlParams();
  const page = Math.max(1, Number(url.get("page")) || 1);
  const state = useLoad(() => call(api.admin.audit.get({ query: { page } })), [page]);
  return (
    <LoadView state={state}>
      {(data) =>
        data.rows.length === 0 ? (
          <Empty action={page > 1 ? <Button onClick={() => url.set({ page: null })}>Back to the first page</Button> : undefined}>{page > 1 ? "No more activity." : "Nothing has happened yet."}</Empty>
        ) : (
          <>
            <div className="hidden md:block cr-tablewrap">
              <table className="cr-table">
                <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="tnum cr-muted">{formatDate(r.at)}</td>
                      <td>{ACTOR[r.actor_kind]}</td>
                      <td>{describe(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden cr-cards">
              {data.rows.map((r) => (
                <div key={r.id} className="cr-rowcard">
                  <span className="cr-rowcard__top"><strong>{describe(r)}</strong></span>
                  <span className="cr-muted tnum" style={{ fontSize: 13 }}>{formatDate(r.at)} · {ACTOR[r.actor_kind]}</span>
                </div>
              ))}
            </div>
            {/* The audit call returns no total, so this is Previous/Next, not "n of total". */}
            <div className="cr-pager">
              <Button small disabled={page <= 1} onClick={() => url.set({ page: page - 1 === 1 ? null : String(page - 1) })}>Previous</Button>
              <Button small disabled={data.rows.length < data.page_size} onClick={() => url.set({ page: String(page + 1) })}>Next</Button>
            </div>
          </>
        )
      }
    </LoadView>
  );
}
