"use client";
import { ActivityList, PasswordForm, TenantNameForm } from "@/components/admin/account";
import { useAdmin } from "@/components/admin/app";
import { PageTitle } from "@/components/crm";
import { siteUrl } from "@/lib/config";

export default function AccountPage() {
  const { me } = useAdmin();
  const tenant = me.tenant;
  return (
    <div className="cr-page">
      <PageTitle>Account</PageTitle>
      <div className="cr-page__head"><h1>Account</h1></div>
      {tenant && (
        <section className="cr-card" aria-labelledby="acc-name"><div className="cr-card__body cr-section">
          <h2 id="acc-name">Business name</h2>
          <p className="cr-hint">Your site address is <a href={siteUrl(tenant.slug)}>{siteUrl(tenant.slug)}</a></p>
          <TenantNameForm name={tenant.name} onSaved={() => location.reload()} />
        </div></section>
      )}
      <section className="cr-card" aria-labelledby="acc-pw"><div className="cr-card__body cr-section">
        <h2 id="acc-pw">Password</h2>
        <PasswordForm />
      </div></section>
      <section className="cr-card" aria-labelledby="acc-log"><div className="cr-card__body cr-section">
        <h2 id="acc-log">Recent activity</h2>
        <ActivityList />
      </div></section>
    </div>
  );
}
