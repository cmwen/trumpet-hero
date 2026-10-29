import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "offline-shell",
      generateBundle(_, bundle) {
        const assets = [
          "index.html",
          "manifest.webmanifest",
          "icon.svg",
          "pitch-worklet.js",
          "dsp.js",
          ...Object.keys(bundle).filter((x) => !x.endsWith(".map")),
        ];
        const key = createHash("sha256")
          .update(
            assets.join("|") +
              readFileSync("index.html", "utf8") +
              ["manifest.webmanifest", "icon.svg", "pitch-worklet.js", "dsp.js"]
                .map((p) => readFileSync("public/" + p, "utf8"))
                .join("|"),
          )
          .digest("hex")
          .slice(0, 12);
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: `const CACHE='trumpet-hero-${key}';const ASSETS=${JSON.stringify(assets)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([...new Set(ASSETS)].map(p=>new URL(p,self.registration.scope).href)))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('trumpet-hero-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request,{ignoreVary:true});if(hit)return hit;try{return await fetch(e.request);}catch(error){if(e.request.mode==='navigate'){const shell=await c.match(new URL('index.html',self.registration.scope).href);if(shell)return shell;}throw error;}}));});`,
        });
      },
    },
  ],
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
