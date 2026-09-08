import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Turbopack on Windows rejects backslash absolute paths. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/")
}

const nextConfig: NextConfig = {
  // Static export (Storybook model) — a pure HTML/JS/CSS tree under `out/`,
  // deployable to any static host (Vercel, Netlify, S3, GitHub Pages). No
  // serverless functions, no runtime file tracing. `next dev` still runs
  // normally; export only affects `next build`.
  output: "export",

  // `next/image` runtime optimization requires a server. Disable for static
  // export — images are served as-is from `public/`.
  images: { unoptimized: true },

  // URLs end with `/` (e.g. `/docs/user-guide/calendar/`). Makes static hosts
  // serve `docs/user-guide/calendar/index.html` correctly.
  trailingSlash: true,

  // `next-mdx-remote/rsc` evals MDX via `new Function(...)` with an injected
  // jsxRuntime loaded from `react/jsx-dev-runtime`. In dev mode React 19.2's
  // dev runtime reads `ReactSharedInternals.recentlyCreatedOwnerStacks`, and
  // that Internals object lives on the app's React copy, not Next's vendored
  // RSC React. Bundling next-mdx-remote through Next's RSC webpack graph
  // crosses that boundary and crashes: "Cannot read properties of undefined
  // (reading 'recentlyCreatedOwnerStacks')". Marking the package as
  // server-external keeps it on Node's normal require chain, so the React it
  // loads matches the one Next's RSC runtime hands it.
  serverExternalPackages: ["next-mdx-remote"],

  // `@shell/*` resolves to this project's root. Inherited from the shell this
  // was forked from, where it distinguished shell files from the consuming
  // registry's; kept so files stay diff-able against upstream.
  turbopack: {
    root: toPosix(HERE),
    resolveAlias: {
      "@shell": toPosix(HERE),
    },
  },

  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@shell": toPosix(HERE),
    }
    return config
  },
}

export default nextConfig
