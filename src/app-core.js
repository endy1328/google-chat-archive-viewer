export const CACHE_KEY = "takeout-chat-viewer-cache-v1";

export const mockData = {
  conversations: [
    {
      id: "dm-1",
      title: "Mina Kim",
      type: "dm",
      participants: ["Mina Kim", "You"],
      lastMessageAt: "2026-05-11T12:30:00Z",
      messages: [
        {
          id: "m1",
          author: "Mina Kim",
          timestamp: "2026-05-11T10:00:00Z",
          text: "Takeout JSON 샘플 올렸어요. 첨부 미리보기 확인 부탁해요.",
          attachments: [
            {
              id: "a1",
              name: "handoff-notes.txt",
              mimeType: "text/plain",
              content: "검색 인덱스 MVP 메모",
            },
          ],
        },
        {
          id: "m2",
          author: "You",
          timestamp: "2026-05-11T12:30:00Z",
          text: "확인했어요. 메시지 검색과 파일 상세 패널 같이 묶겠습니다.",
          attachments: [],
        },
      ],
    },
    {
      id: "grp-1",
      title: "Launch Readiness",
      type: "group",
      participants: ["You", "Mina Kim", "Alex Park", "QA Bot"],
      lastMessageAt: "2026-05-10T08:45:00Z",
      messages: [
        {
          id: "m3",
          author: "Alex Park",
          timestamp: "2026-05-09T16:20:00Z",
          text: "인덱싱 상태 UI는 2초 이내면 skeleton 없이 spinner만으로 충분합니다.",
          attachments: [],
        },
        {
          id: "m4",
          author: "QA Bot",
          timestamp: "2026-05-10T08:45:00Z",
          text: "샘플 검증용 CSV는 따로 없고, JSON 계약만 먼저 맞추면 됩니다.",
          attachments: [],
        },
      ],
    },
    {
      id: "sp-1",
      title: "Support Ops Space",
      type: "space",
      participants: ["You", "Ops One", "Ops Two"],
      lastMessageAt: "2026-05-08T05:20:00Z",
      messages: [
        {
          id: "m5",
          author: "Ops One",
          timestamp: "2026-05-08T05:20:00Z",
          text: "5월 장애 요약 문서를 첨부합니다.",
          attachments: [
            {
              id: "a2",
              name: "incident-summary.html",
              mimeType: "text/html",
              content: "<h1>Incident Summary</h1><p>No external upload required.</p>",
            },
          ],
        },
      ],
    },
  ],
};

export function normalizeData(input) {
  const conversations = Array.isArray(input?.conversations) ? input.conversations : [];
  return {
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title || "Untitled conversation",
      type: (conversation.type || "group").toLowerCase(),
      participants: conversation.participants || [],
      lastMessageAt: conversation.lastMessageAt || conversation.messages?.at(-1)?.timestamp || "",
      messages: (conversation.messages || []).map((message) => ({
        id: message.id,
        author: message.author || "Unknown",
        timestamp: message.timestamp,
        text: message.text || "",
        attachments: (message.attachments || []).map((attachment) => ({
          id: attachment.id,
          name: attachment.name || "attachment",
          mimeType: attachment.mimeType || "application/octet-stream",
          content: attachment.content || "",
        })),
      })),
    })),
  };
}

export function getFilteredConversations(data, filters) {
  if (!data) return [];
  return data.conversations.filter((conversation) => {
    if (filters.type !== "all" && conversation.type !== filters.type) return false;

    const matchesDate = conversation.messages.some((message) => {
      const date = message.timestamp.slice(0, 10);
      if (filters.startDate && date < filters.startDate) return false;
      if (filters.endDate && date > filters.endDate) return false;
      return true;
    });
    if (!matchesDate) return false;

    if (!filters.query) return true;

    const haystack = [
      conversation.title,
      conversation.participants.join(" "),
      ...conversation.messages.map((message) => message.text),
      ...conversation.messages.flatMap((message) =>
        message.attachments.map((attachment) => attachment.name),
      ),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(filters.query);
  });
}

export function getVisibleMessages(conversation, filters) {
  if (!conversation) return [];
  return conversation.messages.filter((message) => {
    const date = message.timestamp.slice(0, 10);
    if (filters.startDate && date < filters.startDate) return false;
    if (filters.endDate && date > filters.endDate) return false;
    if (!filters.query) return true;

    const messageHaystack = [
      message.author,
      message.text,
      ...message.attachments.map((attachment) => attachment.name),
    ]
      .join(" ")
      .toLowerCase();

    return messageHaystack.includes(filters.query);
  });
}

export function saveCache(storage, data) {
  storage.setItem(CACHE_KEY, JSON.stringify(data));
}

export function loadCache(storage) {
  const raw = storage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    storage.removeItem(CACHE_KEY);
    return null;
  }
}

export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
