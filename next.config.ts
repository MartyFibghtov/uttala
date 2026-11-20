import type { NextConfig } from "next";

const csp = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "object-src 'none'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) for the Docker image.
  output: "standalone",
  // Native database driver: load it from node_modules instead of bundling it.
  serverExternalPackages: ["@libsql/client", "libsql", "@huggingface/transformers", "onnxruntime-node"],
  // Never ship the local development database or model cache. Native binaries (and the shared libraries
  // next to them, which tracing misses) are named explicitly, for the Linux image and for local macOS runs.
  outputFileTracingExcludes: { "*": [".data/**"] },
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/**",
      "./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v3/darwin/arm64/**",
      "./node_modules/.pnpm/@libsql+linux-x64-gnu@*/**",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
