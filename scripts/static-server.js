import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const rawPath = request.url === "/" ? "/index.html" : request.url;
    const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
    const targetPath = join(ROOT, safePath);
    const body = await readFile(targetPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(targetPath)] || "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(PORT, () => {
  console.log(`Static server listening on http://127.0.0.1:${PORT}`);
});
