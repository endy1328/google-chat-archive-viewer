import { describe, expect, it } from "vitest";
import { gzipSync, strToU8, zipSync } from "fflate";

import { readArchiveEntries } from "../archive.js";
import { normalizeImportEntries, toViewerData } from "../parser.js";

describe("archive parsing", () => {
  it("normalizes a chat export from zip", () => {
    const archiveBytes = zipSync({
      "Takeout/Google Chat/Spaces/Product Launch/messages.json": strToU8(
        JSON.stringify({
          name: "Product Launch",
          type: "SPACE",
          participants: [{ name: "You" }, { name: "Mina Kim" }],
          messages: [
            {
              id: "msg-1",
              creator: { name: "Mina Kim" },
              created_at: "2026-05-11T09:00:00Z",
              text: "Archive load ready",
              attachments: [
                {
                  id: "att-1",
                  name: "notes.txt",
                  path: "Takeout/Google Chat/Spaces/Product Launch/files/notes.txt",
                },
              ],
            },
          ],
        })
      ),
      "Takeout/Google Chat/Spaces/Product Launch/files/notes.txt": strToU8("parser-ready"),
    });

    const entries = readArchiveEntries("chat-export.zip", archiveBytes);
    const result = normalizeImportEntries(entries, "chat-export.zip");
    const viewerData = toViewerData(result);

    expect(result.importSession.archiveType).toBe("zip");
    expect(result.conversations).toHaveLength(1);
    expect(result.messages).toHaveLength(1);
    expect(result.attachments).toHaveLength(1);
    expect(viewerData.conversations[0].title).toBe("Product Launch");
    expect(viewerData.conversations[0].messages[0].attachments[0].content).toBe("parser-ready");
  });

  it("normalizes a chat export from tgz", () => {
    const tarBytes = buildTarArchive([
      {
        path: "Takeout/Google Chat/Direct message with Mina/messages.json",
        text: JSON.stringify({
          title: "Mina Kim",
          type: "DIRECT_MESSAGE",
          participants: [{ name: "You" }, { name: "Mina Kim" }],
          messages: [
            {
              id: "msg-1",
              creator: { name: "Mina Kim" },
              created_at: "2026-05-11T09:00:00Z",
              text: "TGZ import works",
            },
          ],
        }),
      },
    ]);

    const entries = readArchiveEntries("chat-export.tgz", gzipSync(tarBytes));
    const result = normalizeImportEntries(entries, "chat-export.tgz");

    expect(result.importSession.archiveType).toBe("tgz");
    expect(result.conversations[0].type).toBe("dm");
    expect(result.messages[0].text).toBe("TGZ import works");
  });
});

function buildTarArchive(files) {
  const chunks = [];

  files.forEach((file) => {
    const content = strToU8(file.text);
    const header = new Uint8Array(512);
    writeAscii(header, 0, 100, file.path);
    writeAscii(header, 100, 8, "0000777");
    writeAscii(header, 108, 8, "0000000");
    writeAscii(header, 116, 8, "0000000");
    writeAscii(header, 124, 12, content.length.toString(8).padStart(11, "0"));
    writeAscii(header, 136, 12, Math.floor(Date.now() / 1000).toString(8).padStart(11, "0"));
    writeAscii(header, 156, 1, "0");
    writeAscii(header, 257, 6, "ustar");
    writeAscii(header, 263, 2, "00");

    for (let index = 148; index < 156; index += 1) {
      header[index] = 32;
    }

    const checksum = header.reduce((sum, value) => sum + value, 0);
    writeAscii(header, 148, 8, checksum.toString(8).padStart(6, "0"));

    chunks.push(header);
    chunks.push(content);

    const padding = (512 - (content.length % 512)) % 512;
    if (padding) chunks.push(new Uint8Array(padding));
  });

  chunks.push(new Uint8Array(1024));
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function writeAscii(buffer, offset, length, value) {
  const encoded = strToU8(value.slice(0, length));
  buffer.set(encoded, offset);
}
