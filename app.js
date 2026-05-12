import { createMockImportResult, toViewerData } from "./parser.js";
import { clearDatabase, loadLatestImportResult, saveImportResult } from "./storage.js";

const mockData = {
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
  ],
};

const state = {
  data: null,
  importResult: null,
  selectedConversationId: null,
  previewUrls: [],
  filters: {
    query: "",
    type: "all",
    startDate: "",
    endDate: "",
  },
};

const elements = {
  viewer: document.getElementById("viewer"),
  emptyState: document.getElementById("empty-state"),
  indexingState: document.getElementById("indexing-state"),
  indexingMessage: document.getElementById("indexing-message"),
  fileInput: document.getElementById("file-input"),
  loadMockButton: document.getElementById("load-mock-button"),
  clearCacheButton: document.getElementById("clear-cache-button"),
  searchInput: document.getElementById("search-input"),
  typeFilter: document.getElementById("type-filter"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  conversationCount: document.getElementById("conversation-count"),
  conversationList: document.getElementById("conversation-list"),
  timelineTitle: document.getElementById("timeline-title"),
  messageCount: document.getElementById("message-count"),
  messageList: document.getElementById("message-list"),
  detailPanelContent: document.getElementById("detail-panel-content"),
  conversationTemplate: document.getElementById("conversation-item-template"),
  messageTemplate: document.getElementById("message-item-template"),
};

const parserWorker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

boot();

async function boot() {
  bindEvents();
  const cached = await loadLatestImportResult();
  if (cached) {
    hydrate(cached, "IndexedDB 캐시를 복원했습니다.");
  }
}

function bindEvents() {
  elements.loadMockButton.addEventListener("click", async () => {
    await hydrateImportResult(
      createMockImportResult("mock-data.json", mockData),
      "Mock 데이터를 인덱싱하는 중입니다."
    );
  });

  elements.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      await importFile(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : "파일을 읽는 중 오류가 발생했습니다.");
      resetToEmptyState();
    } finally {
      event.target.value = "";
    }
  });

  elements.clearCacheButton.addEventListener("click", async () => {
    await clearDatabase();
    clearPreviewUrls();
    resetToEmptyState();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    render();
  });

  elements.typeFilter.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    render();
  });

  elements.startDate.addEventListener("change", (event) => {
    state.filters.startDate = event.target.value;
    render();
  });

  elements.endDate.addEventListener("change", (event) => {
    state.filters.endDate = event.target.value;
    render();
  });
}

async function importFile(file) {
  showIndexing(`${file.name}을(를) 인덱싱하는 중입니다.`);
  const buffer = await file.arrayBuffer();
  const importResult = await parseInWorker(file.name, buffer);
  await hydrateImportResult(importResult, `${file.name} 인덱싱 완료`);
}

function parseInWorker(fileName, buffer) {
  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      const { ok, result, error } = event.data;
      parserWorker.removeEventListener("message", handleMessage);
      if (ok) {
        resolve(result);
        return;
      }
      reject(new Error(error));
    };

    parserWorker.addEventListener("message", handleMessage, { once: true });
    parserWorker.postMessage({ fileName, buffer }, [buffer]);
  });
}

async function hydrateImportResult(importResult, message) {
  showIndexing(message);
  await saveImportResult(importResult);
  hydrate(importResult);
}

function hydrate(importResult) {
  state.importResult = importResult;
  state.data = toViewerData(importResult);
  state.selectedConversationId ||= state.data.conversations[0]?.id || null;
  elements.indexingState.classList.add("hidden");
  toggleViewer(Boolean(state.data.conversations.length));
  render();
}

function showIndexing(message) {
  elements.indexingMessage.textContent = message;
  elements.indexingState.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");
}

function toggleViewer(hasData) {
  elements.viewer.classList.toggle("hidden", !hasData);
  elements.emptyState.classList.toggle("hidden", hasData);
}

function resetToEmptyState() {
  state.data = null;
  state.importResult = null;
  state.selectedConversationId = null;
  elements.indexingState.classList.add("hidden");
  toggleViewer(false);
}

function render() {
  clearPreviewUrls();
  const visibleConversations = getFilteredConversations();
  elements.conversationCount.textContent = String(visibleConversations.length);

  if (
    state.selectedConversationId &&
    !visibleConversations.some((conversation) => conversation.id === state.selectedConversationId)
  ) {
    state.selectedConversationId = visibleConversations[0]?.id || null;
  }

  renderConversationList(visibleConversations);
  renderTimeline(visibleConversations.find((conversation) => conversation.id === state.selectedConversationId));
}

function getFilteredConversations() {
  if (!state.data) return [];
  return state.data.conversations.filter((conversation) => {
    if (state.filters.type !== "all" && conversation.type !== state.filters.type) return false;

    const matchesDate = conversation.messages.some((message) => {
      const date = message.timestamp.slice(0, 10);
      if (state.filters.startDate && date < state.filters.startDate) return false;
      if (state.filters.endDate && date > state.filters.endDate) return false;
      return true;
    });
    if (!matchesDate) return false;

    if (!state.filters.query) return true;

    const haystack = [
      conversation.title,
      conversation.participants.join(" "),
      ...conversation.messages.map((message) => message.text),
      ...conversation.messages.flatMap((message) => message.attachments.map((attachment) => attachment.name)),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(state.filters.query);
  });
}

function renderConversationList(conversations) {
  elements.conversationList.innerHTML = "";

  if (!conversations.length) {
    elements.conversationList.textContent = "필터에 맞는 대화가 없습니다.";
    return;
  }

  conversations.forEach((conversation) => {
    const node = elements.conversationTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle("active", conversation.id === state.selectedConversationId);
    node.querySelector(".conversation-title").textContent = conversation.title;
    node.querySelector(".conversation-type").textContent = conversation.type;
    node.querySelector(".conversation-meta").textContent = [
      conversation.participants.join(", "),
      formatDateTime(conversation.lastMessageAt),
    ].join(" • ");
    node.querySelector(".conversation-preview").textContent =
      conversation.messages.at(-1)?.text || "메시지 없음";
    node.addEventListener("click", () => {
      state.selectedConversationId = conversation.id;
      render();
    });
    elements.conversationList.appendChild(node);
  });
}

function renderTimeline(conversation) {
  if (!conversation) {
    elements.timelineTitle.textContent = "대화를 선택하세요";
    elements.messageCount.textContent = "0";
    elements.messageList.className = "message-list empty-copy";
    elements.messageList.textContent = "검색 결과 또는 선택된 대화가 없습니다.";
    elements.detailPanelContent.className = "detail-content empty-copy";
    elements.detailPanelContent.textContent = "대화를 선택하면 상세 정보가 표시됩니다.";
    return;
  }

  const visibleMessages = conversation.messages.filter((message) => {
    const date = message.timestamp.slice(0, 10);
    if (state.filters.startDate && date < state.filters.startDate) return false;
    if (state.filters.endDate && date > state.filters.endDate) return false;
    if (!state.filters.query) return true;

    const messageHaystack = [
      message.author,
      message.text,
      ...message.attachments.map((attachment) => attachment.name),
    ]
      .join(" ")
      .toLowerCase();

    return messageHaystack.includes(state.filters.query);
  });

  elements.timelineTitle.textContent = conversation.title;
  elements.messageCount.textContent = String(visibleMessages.length);
  elements.messageList.className = "message-list";
  elements.messageList.innerHTML = "";

  if (!visibleMessages.length) {
    elements.messageList.className = "message-list empty-copy";
    elements.messageList.textContent = "이 대화에는 현재 필터에 맞는 메시지가 없습니다.";
  }

  visibleMessages.forEach((message) => {
    const node = elements.messageTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".message-author").textContent = message.author;
    node.querySelector(".message-time").textContent = formatDateTime(message.timestamp);
    node.querySelector(".message-text").textContent = message.text || "(텍스트 없음)";
    const attachmentRoot = node.querySelector(".message-attachments");

    message.attachments.forEach((attachment) => {
      attachmentRoot.appendChild(buildAttachmentLink(attachment));
    });

    elements.messageList.appendChild(node);
  });

  renderDetailPanel(conversation, visibleMessages);
}

function renderDetailPanel(conversation, visibleMessages) {
  const attachments = visibleMessages.flatMap((message) => message.attachments);
  const warnings = state.data?.parseWarnings || [];
  const session = state.data?.importSession;

  elements.detailPanelContent.className = "detail-content";
  elements.detailPanelContent.innerHTML = `
    <div class="meta-list">
      ${conversation.participants.map((name) => `<span class="meta-chip">${escapeHtml(name)}</span>`).join("")}
    </div>
    <p class="detail-copy">총 메시지 ${conversation.messages.length}개 / 현재 결과 ${visibleMessages.length}개</p>
    <p class="detail-copy">첨부 ${attachments.length}개</p>
    ${
      session
        ? `<p class="detail-copy">세션 ${escapeHtml(session.sourceName)} • ${escapeHtml(session.archiveType)}</p>`
        : ""
    }
    ${
      warnings.length
        ? `<p class="detail-copy">파싱 경고 ${warnings.length}개</p>`
        : "<p class=\"detail-copy\">파싱 경고 없음</p>"
    }
    <div class="attachment-list"></div>
  `;

  const attachmentRoot = elements.detailPanelContent.querySelector(".attachment-list");
  if (!attachments.length) {
    attachmentRoot.textContent = "현재 필터에 표시할 첨부가 없습니다.";
    return;
  }

  attachments.forEach((attachment) => {
    attachmentRoot.appendChild(buildAttachmentLink(attachment));
  });
}

function buildAttachmentLink(attachment) {
  const blob = new Blob([attachment.content], { type: attachment.mimeType });
  const url = URL.createObjectURL(blob);
  state.previewUrls.push(url);
  const link = document.createElement("a");
  link.className = "attachment-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = attachment.name;
  return link;
}

function clearPreviewUrls() {
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
}

function formatDateTime(value) {
  if (!value) return "시간 정보 없음";
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
