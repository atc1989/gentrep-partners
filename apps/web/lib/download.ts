import { API_URL } from "./config";
import { getSupabase } from "./supabase";

/** Fetches a CSV with the signed-in token (a plain link could not send the Bearer header) and saves it. */
export async function downloadCsv(path: string, filename: string) {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch(`${API_URL}${path}`, { headers: data.session ? { authorization: `Bearer ${data.session.access_token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "The export failed. Try again.");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
