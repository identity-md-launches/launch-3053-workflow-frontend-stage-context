// Serves ../../dist under a gateway-like subpath (/ipfs/squeekboard/) so the tests catch any
// absolute asset path. Started and stopped by Playwright's webServer for the length of one run.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../../dist/", import.meta.url));
const PREFIX = "/ipfs/squeekboard/";
const PORT = Number(process.env.PORT ?? 4319);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404).end("outside prefix");
    return;
  }
  let rel = normalize(decodeURIComponent(url.pathname.slice(PREFIX.length))).replace(/^(\.\.[/\\])+/, "");
  if (rel === "" || rel === ".") rel = "index.html";
  try {
    const body = await readFile(join(DIST, rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`serving dist at http://127.0.0.1:${PORT}${PREFIX}`));
