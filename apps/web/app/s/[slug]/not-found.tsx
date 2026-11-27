import Link from "next/link";

// A host that has no site behind it (nosuchsite.gentrep.xyz).
export default function SiteNotFound() {
  return (
    <div className="sky">
      <main className="sk-wrap sk-main" id="main" style={{ paddingTop: 64 }}>
        <div className="sk-status sk-text">
          <h1 className="sk-h2">Site not found</h1>
          <p className="sk-muted">There is no site at this address. Check the spelling, or ask the person who gave you the link.</p>
          <Link href="/" className="sk-btn sk-btn--quiet" style={{ alignSelf: "flex-start" }}>About Gentrep</Link>
        </div>
      </main>
    </div>
  );
}
