// One-time setup: makes the first super admin. There is no sign-up screen for super admins anywhere.
//   cd apps/api && bun scripts/create-super-admin.ts owner@yourdomain.com
// It creates the account (or finds it), marks it as a platform admin, and prints a one-time link to choose a
// password. The link is a secret: open it once yourself, then close the terminal. On first sign-in you set up the
// authenticator app (the second factor is required before anything opens).
import { must, serviceClient } from "../src/db";
import { siteOrigin } from "../src/env";
import { isEmail } from "../src/shared";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!isEmail(email)) {
  console.error("Usage: bun scripts/create-super-admin.ts <email>");
  process.exit(1);
}

const svc = serviceClient();
let userId: string | undefined;

const created = await svc.auth.admin.createUser({ email, email_confirm: true });
if (created.data.user) {
  userId = created.data.user.id;
} else if (/already|registered|exists/i.test(created.error?.message ?? "")) {
  for (let page = 1; !userId && page <= 20; page++) {
    const list = await svc.auth.admin.listUsers({ page, perPage: 200 });
    userId = list.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (list.error || list.data.users.length < 200) break;
  }
  if (!userId) throw new Error("That email exists but could not be found. Check the Supabase dashboard.");
} else {
  throw new Error(`Could not create the account: ${created.error?.message}`);
}

must(await svc.rpc("bootstrap_platform_admin", { p_user: userId }));

const link = await svc.auth.admin.generateLink({ type: "recovery", email });
if (link.error || !link.data.properties) throw new Error(`Could not make the password link: ${link.error?.message}`);
const { hashed_token, verification_type } = link.data.properties;

console.log(`\n${email} is now a super admin.\n\nOpen this link once to choose a password (it expires in 1 hour):\n\n${siteOrigin(null)}/auth/confirm#token_hash=${encodeURIComponent(hashed_token)}&type=${verification_type}\n`);
