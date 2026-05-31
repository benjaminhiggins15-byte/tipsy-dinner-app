// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { copyFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

export default defineConfig({
  cloudflare: false,
  plugins: [
    nitro({
      preset: "vercel",
      hooks: {
        "compiled": function() {
          // Fix 1: Copy missing tslib ESM entry point
          try {
            const src = resolve("node_modules/tslib/tslib.es6.mjs");
            const dest = resolve(".vercel/output/functions/__server.func/node_modules/tslib/tslib.es6.mjs");
            mkdirSync(resolve(".vercel/output/functions/__server.func/node_modules/tslib"), { recursive: true });
            copyFileSync(src, dest);
            console.log("✅ Copied tslib.es6.mjs");
          } catch (e) {
            console.error("❌ Failed to copy tslib.es6.mjs:", e);
          }

          // Fix 2: Create missing config.json
          try {
            const config = {
              version: 3,
              routes: [
                {
                  src: "/assets/(.*)",
                  headers: { "cache-control": "public, max-age=31536000, immutable" }
                },
                { handle: "filesystem" },
                { src: "/(.*)", dest: "/__server" }
              ]
            };
            writeFileSync(
              resolve(".vercel/output/config.json"),
              JSON.stringify(config, null, 2)
            );
            console.log("✅ Created config.json");
          } catch (e) {
            console.error("❌ Failed to create config.json:", e);
          }

          // Fix 3: Create missing .vc-config.json
          try {
            const vcConfig = {
              handler: "index.mjs",
              launcherType: "Nodejs",
              shouldAddHelpers: false,
              supportsResponseStreaming: true,
              runtime: "nodejs24.x"
            };
            writeFileSync(
              resolve(".vercel/output/functions/__server.func/.vc-config.json"),
              JSON.stringify(vcConfig, null, 2)
            );
            console.log("✅ Created .vc-config.json");
          } catch (e) {
            console.error("❌ Failed to create .vc-config.json:", e);
          }
        }
      }
    })
  ]
});
