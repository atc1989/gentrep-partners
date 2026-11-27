import type { ReactNode } from "react";

// Sign-in links land here. The site may not exist yet (it opens when the link is used), so no site lookup.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="sky">{children}</div>;
}
