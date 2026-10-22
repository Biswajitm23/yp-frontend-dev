import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // react-pdf (pdfjs-dist) optionally requires the native `canvas` module for
  // Node-side rendering; we only render PDFs client-side, so mark it external
  // to keep the bundler from trying to resolve it.
  //
  // `pdf-parse` is a Node-only library used by the /api/cv-extract route to
  // turn an uploaded CV PDF into plain text. Marking it external stops the
  // bundler from trying to statically inline its internals (which reference a
  // debug-only test PDF) so it loads at runtime on the Node.js server.
  serverExternalPackages: ["canvas", "pdf-parse"],
  images: {
    // domains: ["34.41.203.136", "34.42.218.255"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "youngprofessionals.global",
      },
      {
        protocol: "https",
        hostname: "admin.youngprofessionals.global",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      }
    ]
  },
  async headers() {
    return [
      {
        // Universal Links / App Links association files live in
        // public/.well-known/. `assetlinks.json` gets application/json from its
        // extension, but Apple's file is deliberately extension-less, so the
        // static handler can't infer a MIME type for it — iOS rejects the
        // association unless it is served as application/json. Setting it here
        // works because `send` leaves Content-Type alone when it's already set.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
