// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const vercel = process.env['VERCEL'] === '1' || process.env['NITRO_PRESET'] === 'vercel';

export default defineConfig({
  nitro: { preset: vercel ? 'vercel' : 'node-server' },
  vite: {
    define: { 'import.meta.env.VITE_IFF_VERCEL': JSON.stringify(vercel ? '1' : '0') },
    optimizeDeps: {
      // Discover shared UI dependencies before serving the first page. Late discovery
      // can leave an open preview mixing old React DOM and new React module URLs.
      include: [
        '@radix-ui/react-slot',
        'class-variance-authority',
        'clsx',
        'tailwind-merge',
        'lucide-react',
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
