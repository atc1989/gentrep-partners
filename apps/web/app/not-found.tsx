import Link from "next/link";
import { PlatformPage } from "@/components/sky/platform";

export default function NotFound() {
  return (
    <div className="sky">
      <PlatformPage>
        <div className="sk-status" style={{ marginTop: 32 }}>
          <h1 className="sk-h2">Page not found</h1>
          <p className="sk-muted">The page you wanted does not exist.</p>
          <Link href="/" className="sk-btn sk-btn--primary" style={{ alignSelf: "flex-start" }}>Go to the home page</Link>
        </div>
      </PlatformPage>
    </div>
  );
}
