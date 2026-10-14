import { copyFile, readFile, writeFile } from "node:fs/promises";

const indexPath = "dist/index.html";
const indexHtml = await readFile(indexPath, "utf8");
const pagesHtml = indexHtml.replace(
  '<meta name="robots" content="index,follow" />',
  '<meta name="robots" content="noindex,follow" />'
);

await writeFile(indexPath, pagesHtml);
await copyFile("dist/index.html", "dist/404.html");
