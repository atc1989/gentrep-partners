import { Elysia, status } from "elysia";
import { anon, userClient } from "./db";
import { allow } from "./limits";

// The gate for every signed-in route, in the order the playbook sets (02 - Auth and Roles, "API auth gate"):
//   1 Bearer header with three base64url parts   2 signature and expiry   3 rate limit per user
//   4 hand the route an RLS-scoped client.
// There is no profile cache and no role read here: each SQL function checks the caller itself, so a
// role or a suspended tenant changes the answer on the very next request.

export const auth = new Elysia({ name: "auth" }).derive({ as: "scoped" }, async ({ headers }) => {
  const token = headers.authorization?.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/)?.[1];
  if (!token) throw status(401, { error: "Sign in to continue." });

  // getClaims throws, instead of returning an error, on undecodable tokens like "abc.def.ghi".
  const { data, error } = await anon.auth.getClaims(token).catch((e: Error) => ({ data: null, error: e }));
  const uid = data?.claims.sub;
  if (error || !uid) throw status(401, { error: "Your session ended. Sign in again." });

  if (!allow(`rate:${uid}`, 300, 60)) throw status(429, { error: "Too many requests. Wait a minute." });

  return { uid, db: userClient(token) };
});
