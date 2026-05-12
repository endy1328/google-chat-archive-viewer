import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { clearDatabase, loadLatestImportResult, saveImportResult } from "../storage.js";

describe("indexeddb storage", () => {
  it("persists and restores the latest import result", async () => {
    await clearDatabase();

    const importResult = {
      importSession: {
        id: "import-1",
        sourceName: "sample.zip",
        archiveType: "zip",
        importedAt: "2026-05-12T00:00:00Z",
        conversationCount: 1,
        messageCount: 1,
        attachmentCount: 1,
        parseWarnings: [{ sourcePath: "messages.json", detail: "sample warning" }],
      },
      conversations: [
        {
          id: "conv-1",
          importSessionId: "import-1",
          title: "Launch",
          type: "group",
          participants: ["You"],
          lastMessageAt: "2026-05-12T00:00:00Z",
          sourcePath: "messages.json",
          rawRef: { source_path: "messages.json" },
          parseWarnings: [],
        },
      ],
      messages: [
        {
          id: "msg-1",
          importSessionId: "import-1",
          conversationId: "conv-1",
          author: "You",
          timestamp: "2026-05-12T00:00:00Z",
          text: "hello",
          attachmentIds: ["att-1"],
          sourcePath: "messages.json",
          rawRef: { source_path: "messages.json" },
          parseWarnings: [],
        },
      ],
      attachments: [
        {
          id: "att-1",
          importSessionId: "import-1",
          conversationId: "conv-1",
          messageId: "msg-1",
          name: "notes.txt",
          mimeType: "text/plain",
          size: 5,
          sourcePath: "files/notes.txt",
          rawRef: { source_path: "files/notes.txt" },
          contentText: "hello",
          binaryBase64: "",
        },
      ],
      parseWarnings: [{ sourcePath: "messages.json", detail: "sample warning" }],
    };

    await saveImportResult(importResult);
    const restored = await loadLatestImportResult();

    expect(restored.importSession.sourceName).toBe("sample.zip");
    expect(restored.conversations).toHaveLength(1);
    expect(restored.messages).toHaveLength(1);
    expect(restored.attachments).toHaveLength(1);
    expect(restored.parseWarnings).toEqual([{ sourcePath: "messages.json", detail: "sample warning" }]);
  });
});
