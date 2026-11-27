import { env } from "./env";

// A person's private invite link needs no login. The token is HMAC(LINK_SECRET, email), so a repeat registration
// derives the same token and the page never has to say whether the email was already known. The database stores only
// sha256(token): reading the table cannot rebuild a link. (docs/THREAT_MODEL.md T24, T28)
//
// ponytail: email only, so one person has the same token in every tenant they join. Lookups always name the tenant.
// Mix the tenant into the HMAC if that ever matters.

const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** 43 characters of base64url: 32 bytes. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = async (token: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(token)));

export async function memberToken(email: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.LINK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(email.trim().toLowerCase()));
  const token = Buffer.from(sig).toString("base64url");
  return { token, hash: await hashToken(token) };
}
