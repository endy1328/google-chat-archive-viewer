import { readArchiveEntries } from "./archive.js";
import { normalizeImportEntries } from "./parser.js";

self.addEventListener("message", async (event) => {
  const { fileName, buffer } = event.data;

  try {
    const entries = readArchiveEntries(fileName, buffer);
    const result = normalizeImportEntries(entries, fileName);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "알 수 없는 파싱 오류",
    });
  }
});
