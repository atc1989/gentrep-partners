"use client";
import { PasswordForm } from "@/components/admin/account";
import { PageTitle } from "@/components/crm";

export default function Page() {
  return (
    <>
      <PageTitle>Account</PageTitle>
      <div className="cr-page">
        <div className="cr-page__head"><h1>Account</h1></div>
        <div className="cr-card"><div className="cr-card__body cr-section" style={{ maxWidth: 420 }}>
          <PasswordForm />
          <hr className="cr-divider" />
          <p className="cr-hint">Your second factor is managed with the authenticator app on your phone.</p>
        </div></div>
      </div>
    </>
  );
}
