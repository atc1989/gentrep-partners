import { NOTICE_VERSION, type SiteSettings } from "@gs/api/shared";
import { OPERATOR } from "@/lib/operator";

// DRAFT legal text, written from the playbook templates (05 - Legal/07) and what the system really does today.
// A lawyer or the DPO reads it before launch. Update it in the same change that adds a field, a purpose or a service.

const Table = ({ head, rows }: { head: string[]; rows: string[][] }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
      <thead>
        <tr>{head.map((h) => <th key={h} style={{ textAlign: "left", padding: "8px 12px 8px 0", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} style={{ padding: "8px 12px 8px 0", borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);

const RIGHTS = [
  "be informed about how your data is used",
  "see and get a copy of your data",
  "correct data that is wrong",
  "object to processing, or withdraw consent",
  "ask for deletion or blocking, where no law requires the data to be kept",
  "receive your data in a portable format",
  "claim damages if you are harmed by inaccurate or misused data",
  "complain to the National Privacy Commission (privacy.gov.ph)",
];

export function TermsDoc() {
  return (
    <article className="sk-prose">
      <h1 className="sk-h2">Terms of service</h1>
      <p className="sk-muted">Version {NOTICE_VERSION}. Draft.</p>
      <h2>1. Agreement</h2>
      <p>These terms are a contract between you and {OPERATOR.name} (&quot;we&quot;) for the use of Gentrep, which lets a business run a branded page where people register. By creating a site you accept them.</p>
      <h2>2. Who can use it</h2>
      <p>You must be at least 18 and able to enter a contract. If you sign up for a business, you confirm you may act for it.</p>
      <h2>3. Your account and your site</h2>
      <p>Keep your sign-in details secret. One person per account. Tell us at once if you think someone else has access. You are responsible for what is done through your account and for what your site says.</p>
      <h2>4. Roles for personal data</h2>
      <p>For the people who register on your site, you are the controller: you decide why their details are collected. We are your processor: we store them for you and follow your instructions. For your own account details, we are the controller. The privacy notice says more.</p>
      <p>You must have a lawful reason to collect each person&apos;s details, show them the privacy notice at the point of registration, and answer their requests to see, correct or remove their details.</p>
      <h2>5. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>break the law or the rights of others;</li>
        <li>pretend to be another business, a bank, a government body or a brand you do not own;</li>
        <li>use the registration form to collect more than it asks for, or to mislead people;</li>
        <li>try to reach data or accounts that are not yours;</li>
        <li>test, scan or attack the service without our written permission;</li>
        <li>copy, resell or overload the service, or collect data from it with automated tools.</li>
      </ul>
      <h2>6. Your content</h2>
      <p>You own what you put on your site: text, logo and images. You allow us to store and show it as needed to run the service for you. You confirm you have the right to use it.</p>
      <h2>7. Suspension</h2>
      <p>We may suspend a site that breaks these terms or looks like abuse. A suspended site shows an unavailable page and its admin cannot sign in. Nothing is deleted by suspension. You can ask us to reopen it. You may stop using the service at any time; ask us to close your site.</p>
      <h2>8. Fees</h2>
      <p>[Fees: decide before launch. Write the price, the period, tax, renewal and refund terms, or state that the service is free.]</p>
      <h2>9. No warranty and limit of liability</h2>
      <p>We provide the service &quot;as is&quot;. We work to keep it available and correct but do not promise it will be free of errors or interruptions. As far as the law allows, we are not liable for indirect or consequential loss, or loss of profit or data. [Liability cap: a lawyer decides.] Nothing here limits liability the law does not allow us to limit.</p>
      <h2>10. Changes</h2>
      <p>We post changes here with a new version and date. For important changes we will email you before they apply.</p>
      <h2>11. Law and contact</h2>
      <p>These terms are governed by the laws of the Republic of the Philippines. [Court city: a lawyer decides.] Contact: {OPERATOR.name}, {OPERATOR.address}, {OPERATOR.dpo}.</p>
    </article>
  );
}

export function PlatformPrivacyDoc() {
  return (
    <article className="sk-prose">
      <h1 className="sk-h2">Privacy notice</h1>
      <p className="sk-muted">Version {NOTICE_VERSION}. Draft. This notice is for people who create and run a site on Gentrep. People who register on a site see that site&apos;s own notice.</p>
      <h2>Who we are</h2>
      <p>{OPERATOR.name}, {OPERATOR.address}. Data Protection Officer: {OPERATOR.dpo}.</p>
      <h2>What we collect</h2>
      <Table head={["Data", "Examples", "Where it comes from"]} rows={[
        ["Account", "Your name, email address, password (stored only as a one-way hash)", "You"],
        ["Site", "Business name, address of your site, logo, text, contact details you choose to show", "You"],
        ["Activity", "A log of exports, deletions, suspensions and platform support access to your site", "Created by the system"],
        ["Technical", "IP address, browser, sign-in times", "Collected automatically"],
      ]} />
      <p>We do not collect government ID numbers, health data or payment card numbers.</p>
      <h2>Why we use it and our legal basis</h2>
      <Table head={["Purpose", "Basis"]} rows={[
        ["Create your account, run your site and sign you in", "Contract"],
        ["Keep the service secure, stop abuse, keep an audit trail", "Legitimate interest"],
        ["Send you the emails the service needs: the confirm link and password reset", "Contract"],
      ]} />
      <p>We do not sell your data and do not make decisions about you by automated means alone.</p>
      <h2>Who receives it</h2>
      <Table head={["Recipient", "What they get", "Where"]} rows={[
        ["Supabase (database, sign-in, file storage)", "All account and site data", "[confirm region before launch]"],
        ["Vercel (hosting)", "Request logs, IP addresses", "[confirm region before launch]"],
        ["Resend (email)", "Your email address and the message", "[confirm region before launch]"],
      ]} />
      <p>These providers act on our instructions under their published agreements. Some are outside the Philippines. We remain responsible for your data wherever it is processed.</p>
      <h2>How long we keep it</h2>
      <p>Account and site data: while your site is open, then [period]. Activity and security logs: [period]. Backups: [rolling window]. After that we delete it or remove what identifies you.</p>
      <h2>How we protect it</h2>
      <p>Data is encrypted in transit. Each site&apos;s data is kept apart from every other site&apos;s by the database itself. Platform staff cannot see the people who registered on your site unless they open them for one hour with a written reason, which is logged and shown to you. Platform staff sign in with a second factor. If a breach puts you at risk, we will tell you and the National Privacy Commission within the time the law sets.</p>
      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>{RIGHTS.map((r) => <li key={r}>{r}</li>)}</ul>
      <p>To use a right, write to {OPERATOR.dpo}.</p>
      <h2>Cookies</h2>
      <p>We use only the cookie that keeps you signed in. It belongs to the address you signed in at and is not shared with other sites. We use no tracking or advertising cookies.</p>
      <h2>Children</h2>
      <p>Gentrep is not for people under 18. We do not knowingly collect their data.</p>
      <h2>Changes</h2>
      <p>We post changes here and change the version. For important changes we will email you first.</p>
    </article>
  );
}

/** The notice a registrant sees. The business is the controller; Gentrep runs the service for it. */
export function TenantPrivacyDoc({ name, contactEmail, reg }: { name: string; contactEmail: string | null; reg?: Pick<SiteSettings, "reg_category_label" | "reg_categories" | "reg_show_address" | "reg_show_source"> }) {
  const contact = contactEmail ?? "the contact details on this site";
  // The extra form fields only exist when the business turned them on, so the notice lists only those.
  const extras = [
    reg && reg.reg_categories.length > 0 ? `your choice of ${(reg.reg_category_label || "category").toLowerCase()}` : "",
    reg?.reg_show_address ? "address" : "",
    reg?.reg_show_source ? "where you found us" : "",
  ].filter(Boolean);
  return (
    <article className="sk-prose">
      <h1 className="sk-h2">Privacy notice</h1>
      <p className="sk-muted">Version {NOTICE_VERSION}. Draft.</p>
      <h2>Who we are</h2>
      <p>{name} decides how the details you give on this site are used. Gentrep ({OPERATOR.name}) runs the registration service for {name} and stores your details on its behalf.</p>
      <p>Contact {name}: {contact}.</p>
      <h2>What we collect</h2>
      <Table head={["Data", "Why"]} rows={[
        ["Full name, email address, mobile number, city, and a title if you choose one", "To register you with " + name],
        ...(extras.length ? [[extras.join(", "), "Details " + name + " asks for on the registration form"]] : []),
        ["An invite code of your own, and the code of the person who invited you, if you came through their invite link", "To count who invited whom, and to show each person how many joined with their code"],
        ["A private link to your invite QR page. We keep only a one-way hash of it", "So only you can open your page"],
        ["The time you registered and which version of this notice you saw", "To show your consent"],
        ["IP address and browser, kept in server logs", "To keep the service secure"],
      ]} />
      <p>We do not collect government ID numbers, health data or payment card numbers.</p>
      <h2>Why and our legal basis</h2>
      <p>To manage your registration with {name}. The basis is your consent, which you give by ticking the box on the registration page. You can withdraw it at any time by asking {name} to remove your details.</p>
      <p>We do not sell your data. We do not use it for a new purpose without telling you first.</p>
      <h2>Who receives it</h2>
      <p>{name} and the people who work for it. The service providers that store it or send it for us: Supabase (database), Vercel (hosting), Resend (the email with your private link). They act on our instructions, and some are outside the Philippines. {name} remains responsible for your data wherever it is processed.</p>
      <h2>How long it is kept</h2>
      <p>Until you ask {name} to remove it, or {name} deletes it. [{name} sets a retention period.]</p>
      <h2>How it is protected</h2>
      <p>Your details are kept apart from other sites&apos; data by the database itself, and can be read only by {name}&apos;s administrator. If a breach puts you at risk, you and the National Privacy Commission will be told within the time the law sets.</p>
      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>{RIGHTS.map((r) => <li key={r}>{r}</li>)}</ul>
      <p>To use a right, contact {name} at {contact}.</p>
      <h2>Cookies</h2>
      <p>This site sets one cookie, and only if you open someone&apos;s invite link or scan their invite QR. It is called gs_ref, it holds that person&apos;s six-digit invite code, it lasts 30 days, and it belongs to this site only. It is needed only to credit the person who invited you when you register. It is not used for tracking or advertising. Registering does not require it.</p>
      <h2>Children</h2>
      <p>This site is not for people under 18.</p>
    </article>
  );
}
