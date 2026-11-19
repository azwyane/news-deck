import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  mainFields: ["browser", "module", "main"],
  legalComments: "none",
});

const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const styles = await Bun.file("src/styles.css").text();
const patchFile = Bun.file("src/patch.css");
const patch = await patchFile.exists() ? await patchFile.text() : "";
const template = await Bun.file("src/index.template.html").text();

if (!template.includes("<!--STYLES-->") || !template.includes("<!--SCRIPT-->")) {
  throw new Error("Template is missing STYLES or SCRIPT placeholders");
}

const icon = template.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1] || "";
const manifest = {
  name: "News Deck",
  short_name: "News Deck",
  description: "Australian news in one deck",
  start_url: ".",
  scope: ".",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0e1117",
  theme_color: "#0e1117",
  icons: icon ? [{ src: icon, sizes: "192x192", type: "image/png", purpose: "any maskable" }] : [],
};
const manifestLink = `<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}">`;
const html = template
  .replace("<!--STYLES-->", `<style>${styles}\n${patch}</style>`)
  .replace("<!--SCRIPT-->", `<script>${script}</script>`)
  .replace("</head>", `${manifestLink}</head>`);
await Bun.write("dist/index.html", html);

console.log(`Built dist/index.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
