"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filters, search text, page and tab live in the URL (playbook: 04 - Frontend Data Rules). */
export function useUrlParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return {
    get: (key: string) => params.get(key),
    set(patch: Record<string, string | null>) {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) (v === null || v === "" ? next.delete(k) : next.set(k, v));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
  };
}
