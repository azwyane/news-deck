import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const source = readFileSync("reference/original.html", "utf8");
const styleStart = source.indexOf("<style>");
const styleEnd = source.indexOf("</style>");
if (styleStart < 0 || styleEnd < 0) throw new Error("Original HTML has no <style> block");

mkdirSync("src", { recursive: true });
writeFileSync("src/styles.css", source.slice(styleStart + "<style>".length, styleEnd));

const head = source.slice(0, styleStart);
const template = `${head}<!--STYLES--></head>
<body>
<div id="app"></div>
<!--SCRIPT-->
</body>
</html>
`;
writeFileSync("src/index.template.html", template);

console.log("Extracted src/styles.css and src/index.template.html from reference/original.html");
