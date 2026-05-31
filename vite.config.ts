// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  cloudflare: false,
  plugins: [
    nitro({
      preset: "vercel",
      hooks: {
        "compiled": function() {
          try {
            const src = resolve("node_modules/tslib/tslib.es6.mjs");
            const dest = resolve(".vercel/output/functions/__server.func/node_modules/tslib/tslib.es6.mjs");
            mkdirSync(resolve(".vercel/output/functions/__server.func/node_modules/tslib"), { recursive: true });
            copyFileSync(src, dest);
            console.log("✅ Copied tslib.es6.mjs to serverless function");
          } catch (e) {
            console.error("❌ Failed to copy tslib.es6.mjs:", e);
          }
        }
      }
    })
  ]
});
