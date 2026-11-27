import type { NextConfig } from "next";

// "/api" (one origin, covered by 'self') or an absolute URL for a separate API host.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const api = apiUrl.startsWith("http") ? apiUrl : "";
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// playbook: 01 - Security Baseline, "Headers (web)". Browsers may only talk to us and Supabase; nothing frames us.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""), // ponytail: nonces if a third-party script is ever added
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self'",
  `connect-src 'self' ${api} ${supabase} ${supabase.replace(/^http/, "ws")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  transpilePackages: ["@gs/api"],
  poweredByHeader: false,
  // Only for local development: forward /api to the API process. On Vercel, vercel.json routes /api to the api service.
  async rewrites() {
    return process.env.API_ORIGIN ? [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN}/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default config;
