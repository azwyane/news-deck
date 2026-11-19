import { watch } from "node:fs";

const rebuild = () => {
  const result = Bun.spawnSync(["bun", "run", "scripts/build.ts"], { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) console.error("Build failed");
};

rebuild();
Bun.serve({
  port: Number(process.env.PORT || 3000),
  fetch: () => new Response(Bun.file("dist/index.html"), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }),
});
console.log(`Dev server: http://localhost:${process.env.PORT || 3000}`);

let timer: ReturnType<typeof setTimeout> | undefined;
watch("src", { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});
