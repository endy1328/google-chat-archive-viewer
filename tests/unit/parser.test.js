import { describe, expect, it } from "vitest";

import { detectArchiveType, readArchiveEntries } from "../../archive.js";
import { normalizeImportEntries, toViewerData } from "../../parser.js";

describe("archive", () => {
  it("detects supported archive types", () => {
    expect(detectArchiveType("export.zip")).toBe("zip");
    expect(detectArchiveType("export.tar.gz")).toBe("tgz");
    expect(detectArchiveType("messages.json")).toBe("json");
    expect(detectArchiveType("notes.txt")).toBe("unknown");
  });

  it("treats plain JSON files as a single import entry", () => {
    const entries = readArchiveEntries(
      "messages.json",
      new TextEncoder().encode('{"conversations":[]}'),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      path: "messages.json",
      text: '{"conversations":[]}',
    });
  });
});

describe("parser", () => {
  it("normalizes Google Chat-style entries and resolves attachment payloads", () => {
    const importResult = normalizeImportEntries(
      [
        {
          path: "spaces/support-space.json",
          text: JSON.stringify({
            space: { id: "space-1", displayName: "Support Space", type: "ROOM" },
            members: [{ displayName: "Ops One" }, { displayName: "Ops Two" }],
            messages: [
              {
                id: "msg-1",
                creator: { email: "ops-one@example.com" },
                createTime: "2026-05-08T05:20:00Z",
                text_body: "장애 요약 첨부 확인 부탁합니다.",
                attachments: [
                  {
                    id: "att-1",
                    name: "incident-summary.html",
                    resourcePath: "attachments/incident-summary.html",
                  },
                ],
              },
            ],
          }),
        },
        {
          path: "attachments/incident-summary.html",
          text: "<h1>Incident Summary</h1>",
          bytes: new TextEncoder().encode("<h1>Incident Summary</h1>"),
        },
      ],
      "takeout.zip",
    );

    expect(importResult.importSession.archiveType).toBe("zip");
    expect(importResult.conversations).toHaveLength(1);
    expect(importResult.messages).toHaveLength(1);
    expect(importResult.attachments).toHaveLength(1);
    expect(importResult.parseWarnings).toEqual([]);

    expect(importResult.conversations[0]).toMatchObject({
      id: "space-1",
      title: "Support Space",
      type: "space",
      participants: ["Ops One", "Ops Two", "ops-one@example.com"],
    });

    expect(importResult.attachments[0]).toMatchObject({
      id: "att-1",
      mimeType: "text/html",
      sourcePath: "attachments/incident-summary.html",
      contentText: "<h1>Incident Summary</h1>",
    });
  });

  it("converts normalized import results into viewer data sorted by recency", () => {
    const importResult = normalizeImportEntries(
      [
        {
          path: "viewer.json",
          text: JSON.stringify({
            conversations: [
              {
                id: "older",
                title: "Older",
                type: "group",
                participants: ["One"],
                lastMessageAt: "2026-05-01T00:00:00Z",
                messages: [{ id: "m1", author: "One", timestamp: "2026-05-01T00:00:00Z", text: "old" }],
              },
              {
                id: "newer",
                title: "Newer",
                type: "dm",
                participants: ["Two"],
                lastMessageAt: "2026-05-02T00:00:00Z",
                messages: [
                  {
                    id: "m2",
                    author: "Two",
                    timestamp: "2026-05-02T00:00:00Z",
                    text: "new",
                    attachments: [{ id: "a2", name: "note.txt", mimeType: "text/plain", content: "hello" }],
                  },
                ],
              },
            ],
          }),
        },
      ],
      "viewer.json",
    );

    const viewerData = toViewerData(importResult);

    expect(viewerData.conversations.map((conversation) => conversation.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(viewerData.conversations[0].messages[0].attachments[0]).toMatchObject({
      name: "note.txt",
      content: "hello",
    });
  });
});
