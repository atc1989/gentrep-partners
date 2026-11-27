import { SITE_LIMITS } from "@gs/api/shared";

/** The category options textarea holds one option per line. Trim each line and drop blanks. */
export const parseOptions = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export const optionsToText = (options: string[]): string => options.join("\n");

/** The first problem with the list, in plain words, or null. The database checks the same things. */
export function optionsError(options: string[]): string | null {
  if (options.length > SITE_LIMITS.reg_categories) return `You have ${options.length} options. Use at most ${SITE_LIMITS.reg_categories}.`;
  const long = options.find((o) => o.length > SITE_LIMITS.reg_category);
  if (long) return `"${long.slice(0, 24)}…" is ${long.length} characters. Each option can be up to ${SITE_LIMITS.reg_category}.`;
  const seen = new Set<string>();
  for (const o of options) {
    const key = o.toLowerCase();
    if (seen.has(key)) return `"${o}" is listed more than once. Each option must be different, capital letters do not count.`;
    seen.add(key);
  }
  return null;
}
