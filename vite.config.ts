import { defineConfig } from "vite";

// base: "./" makes all asset URLs relative, so the build works whether it is
// served from the domain root or from a GitHub Pages project subpath
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
  },
});
