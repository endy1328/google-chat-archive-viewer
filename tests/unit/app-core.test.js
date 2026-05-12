import { describe, expect, it } from "vitest";

import {
  CACHE_KEY,
  escapeHtml,
  getFilteredConversations,
  getVisibleMessages,
  loadCache,
  mockData,
  normalizeData,
  saveCache,
} from "../../src/app-core.js";

describe("app-core", () => {
  it("normalizes missing fields into safe defaults", () => {
    const data = normalizeData({
      conversations: [
        {
          id: "c1",
          messages: [{ id: "m1", timestamp: "2026-05-01T00:00:00Z", attachments: [{}] }],
        },
      ],
    });

    expect(data.conversations[0]).toMatchObject({
      id: "c1",
      title: "Untitled conversation",
      type: "group",
      participants: [],
      lastMessageAt: "2026-05-01T00:00:00Z",
    });
    expect(data.conversations[0].messages[0]).toMatchObject({
      author: "Unknown",
      text: "",
    });
    expect(data.conversations[0].messages[0].attachments[0]).toMatchObject({
      name: "attachment",
      mimeType: "application/octet-stream",
      content: "",
    });
  });

  it("filters conversations by query, type, and date bounds", () => {
    const data = normalizeData(mockData);
    const matches = getFilteredConversations(data, {
      query: "incident-summary",
      type: "space",
      startDate: "2026-05-08",
      endDate: "2026-05-08",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("sp-1");
  });

  it("filters visible messages within a selected conversation", () => {
    const data = normalizeData(mockData);
    const conversation = data.conversations.find((item) => item.id === "dm-1");

    const matches = getVisibleMessages(conversation, {
      query: "handoff-notes",
      type: "all",
      startDate: "",
      endDate: "",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe("m1");
  });

  it("round-trips cached data and clears corrupt entries", () => {
    const storage = createStorage();
    saveCache(storage, mockData);

    expect(loadCache(storage)?.conversations).toHaveLength(3);
    expect(storage.getItem(CACHE_KEY)).toBeTruthy();

    storage.setItem(CACHE_KEY, "{bad json");
    expect(loadCache(storage)).toBeNull();
    expect(storage.getItem(CACHE_KEY)).toBeNull();
  });

  it("escapes HTML before injecting participant chips", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

function createStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}
