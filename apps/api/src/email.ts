import { env } from "./env";

// One mail path for everything the platform sends: the sign-up link and the password reset link.
// Production sends with Resend. Local development prints or keeps the message (EMAIL_MODE, local only).

export type Mail = { to: string; subject: string; text: string };

/** Messages kept in memory when EMAIL_MODE=memory. Tests read them. */
export const outbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  if (env.EMAIL_MODE === "memory") {
    outbox.push(mail);
    return;
  }
  if (env.EMAIL_MODE === "console") {
    console.log(`\n[mail] to ${mail.to}\n${mail.subject}\n${mail.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Status only: the body can echo the address and the link.
    console.error("resend failed", res.status);
    throw new Error("mail not sent");
  }
}

/** The token goes after # so it never reaches a server log or a Referer header. */
export const confirmMail = (to: string, businessName: string, link: string): Mail => ({
  to,
  subject: `Confirm your email to open ${businessName}`,
  text: `Hello,\n\nConfirm your email to open the site for ${businessName}:\n\n${link}\n\nThe link works once and expires in 1 hour. If you did not ask for this, ignore this email.\n\nGentrep`,
});

/** Sent after every registration, including a repeat one, so the page never says whether the address was already known. */
export const memberMail = (to: string, siteName: string, link: string): Mail => ({
  to,
  subject: `Your invite QR for ${siteName}`,
  text: `Hello,\n\nThanks for registering with ${siteName}. This is your personal page. It has your QR code and your invite link to share:\n\n${link}\n\nKeep this email. Anyone who has this link can open your page, so send people the invite link that is on the page, not this one. If you did not register, ignore this email.\n\n${siteName}\nSent through Gentrep`,
});

export const resetMail =(to: string, link: string): Mail => ({
  to,
  subject: "Reset your Gentrep password",
  text: `Hello,\n\nUse this link to choose a new password:\n\n${link}\n\nThe link works once and expires in 1 hour. If you did not ask for this, ignore this email.\n\nGentrep`,
});
