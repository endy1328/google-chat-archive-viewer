import { detectArchiveType } from "./archive.js";

export function normalizeImportEntries(entries, sourceName) {
  const entryMap = new Map(entries.map((entry) => [entry.path, entry]));
  const warnings = [];

  const jsonEntries = entries.filter((entry) => entry.path.toLowerCase().endsWith(".json"));
  if (!jsonEntries.length) {
    throw new Error("아카이브에서 JSON 파일을 찾지 못했습니다.");
  }

  const parsedJsonEntries = jsonEntries.flatMap((entry) => {
    try {
      return [{ entry, data: JSON.parse(entry.text || "{}") }];
    } catch (error) {
      warnings.push(formatWarning(entry.path, `JSON 파싱 실패: ${error.message}`));
      return [];
    }
  });

  if (!parsedJsonEntries.length) {
    throw new Error("유효한 JSON 데이터를 찾지 못했습니다.");
  }

  const viewerContract = parsedJsonEntries.find(({ data }) => Array.isArray(data.conversations));
  if (viewerContract) {
    return normalizeViewerContract(viewerContract.data, {
      archiveType: detectArchiveType(sourceName),
      sourceName,
      sourcePath: viewerContract.entry.path,
      warnings,
    });
  }

  const conversations = [];
  const messages = [];
  const attachments = [];

  parsedJsonEntries.forEach(({ entry, data }, index) => {
    const conversation = normalizeConversationFile(
      data,
      entry.path,
      entryMap,
      warnings,
      `${sourceName}:${index + 1}`
    );
    if (!conversation) return;

    conversations.push(conversation.conversation);
    messages.push(...conversation.messages);
    attachments.push(...conversation.attachments);
  });

  if (!conversations.length) {
    throw new Error("지원되는 Google Chat 대화 JSON을 찾지 못했습니다.");
  }

  return finalizeImportResult({
    archiveType: detectArchiveType(sourceName),
    sourceName,
    conversations,
    messages,
    attachments,
    warnings,
  });
}

export function createMockImportResult(sourceName, viewerData) {
  return normalizeViewerContract(viewerData, {
    archiveType: "json",
    sourceName,
    sourcePath: sourceName,
    warnings: [],
  });
}

export function toViewerData(importResult) {
  const messageByConversation = groupBy(
    importResult.messages,
    (message) => message.conversationId
  );
  const attachmentsByMessage = groupBy(
    importResult.attachments,
    (attachment) => attachment.messageId
  );

  return {
    conversations: importResult.conversations
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        type: conversation.type,
        participants: conversation.participants,
        lastMessageAt: conversation.lastMessageAt,
        messages: (messageByConversation.get(conversation.id) || [])
          .sort(byTimestamp)
          .map((message) => ({
            id: message.id,
            author: message.author,
            timestamp: message.timestamp,
            text: message.text,
            attachments: (attachmentsByMessage.get(message.id) || []).map((attachment) => ({
              id: attachment.id,
              name: attachment.name,
              mimeType: attachment.mimeType,
              content:
                attachment.contentText ||
                (attachment.binaryBase64 ? decodeBase64ToBytes(attachment.binaryBase64) : ""),
            })),
          })),
      }))
      .sort((left, right) => byTimestampValue(right.lastMessageAt) - byTimestampValue(left.lastMessageAt)),
    parseWarnings: importResult.parseWarnings || [],
    importSession: importResult.importSession,
  };
}

function normalizeViewerContract(input, context) {
  const conversations = [];
  const messages = [];
  const attachments = [];
  const warnings = [...context.warnings];

  (input.conversations || []).forEach((conversation, conversationIndex) => {
    const conversationId = conversation.id || `${context.sourceName}:conversation:${conversationIndex + 1}`;
    const normalizedMessages = (conversation.messages || []).map((message, messageIndex) => {
      const messageId = message.id || `${conversationId}:message:${messageIndex + 1}`;
      const attachmentItems = (message.attachments || []).map((attachment, attachmentIndex) => ({
        id: attachment.id || `${messageId}:attachment:${attachmentIndex + 1}`,
        importSessionId: "",
        conversationId,
        messageId,
        name: attachment.name || "attachment",
        mimeType: attachment.mimeType || "application/octet-stream",
        size: typeof attachment.content === "string" ? attachment.content.length : 0,
        sourcePath: attachment.sourcePath || context.sourcePath,
        rawRef: {
          source_path: attachment.sourcePath || context.sourcePath,
        },
        contentText: attachment.content || "",
        binaryBase64: "",
      }));

      attachments.push(...attachmentItems);

      return {
        id: messageId,
        importSessionId: "",
        conversationId,
        author: message.author || "Unknown",
        timestamp: normalizeTimestamp(message.timestamp) || new Date().toISOString(),
        text: message.text || "",
        attachmentIds: attachmentItems.map((attachment) => attachment.id),
        sourcePath: message.sourcePath || context.sourcePath,
        rawRef: {
          source_path: message.sourcePath || context.sourcePath,
        },
        parseWarnings: [],
      };
    });

    messages.push(...normalizedMessages);
    conversations.push({
      id: conversationId,
      importSessionId: "",
      title: conversation.title || "Untitled conversation",
      type: normalizeConversationType(conversation.type),
      participants: normalizeParticipants(conversation.participants),
      lastMessageAt:
        normalizeTimestamp(conversation.lastMessageAt) ||
        normalizedMessages.at(-1)?.timestamp ||
        "",
      sourcePath: context.sourcePath,
      rawRef: {
        source_path: context.sourcePath,
      },
      parseWarnings: [],
    });
  });

  return finalizeImportResult({
    archiveType: context.archiveType,
    sourceName: context.sourceName,
    conversations,
    messages,
    attachments,
    warnings,
  });
}

function normalizeConversationFile(data, sourcePath, entryMap, warnings, fallbackId) {
  const messageRecords = extractMessages(data);
  if (!messageRecords.length) {
    warnings.push(formatWarning(sourcePath, "메시지 배열을 찾지 못해 건너뜀"));
    return null;
  }

  const participantNames = new Set(normalizeParticipants(extractParticipants(data)));
  const conversationId = extractFirstString([
    data.id,
    data.conversation_id,
    data.conversation?.id,
    data.space?.id,
    fallbackId,
  ]);
  const title =
    extractFirstString([
      data.title,
      data.name,
      data.displayName,
      data.conversation?.name,
      data.conversation?.title,
      data.space?.displayName,
      inferTitleFromPath(sourcePath),
    ]) || "Untitled conversation";
  const type = normalizeConversationType(
    extractFirstString([data.type, data.conversation?.type, data.space?.type, inferTypeFromPath(sourcePath)])
  );

  const normalizedMessages = [];
  const normalizedAttachments = [];

  messageRecords.forEach((message, messageIndex) => {
    const messageId =
      extractFirstString([message.id, message.message_id, message.name]) ||
      `${conversationId}:message:${messageIndex + 1}`;
    const author =
      extractFirstString([
        message.author,
        message.sender?.name,
        message.sender?.email,
        message.creator?.name,
        message.creator?.email,
        message.user?.name,
      ]) || "Unknown";
    participantNames.add(author);

    const timestamp =
      normalizeTimestamp(
        extractFirstString([
          message.timestamp,
          message.created_at,
          message.created_date,
          message.createTime,
          message.sent_at,
        ])
      ) || new Date(0).toISOString();
    const text = extractMessageText(message);
    const attachmentList = extractAttachments(message).map((attachment, attachmentIndex) =>
      normalizeAttachment(
        attachment,
        attachmentIndex,
        messageId,
        conversationId,
        sourcePath,
        entryMap,
        warnings
      )
    );

    normalizedAttachments.push(...attachmentList);
    normalizedMessages.push({
      id: messageId,
      importSessionId: "",
      conversationId,
      author,
      timestamp,
      text,
      attachmentIds: attachmentList.map((attachment) => attachment.id),
      sourcePath,
      rawRef: {
        source_path: sourcePath,
      },
      parseWarnings: [],
    });
  });

  return {
    conversation: {
      id: conversationId,
      importSessionId: "",
      title,
      type,
      participants: [...participantNames],
      lastMessageAt: normalizedMessages.at(-1)?.timestamp || "",
      sourcePath,
      rawRef: {
        source_path: sourcePath,
      },
      parseWarnings: [],
    },
    messages: normalizedMessages,
    attachments: normalizedAttachments,
  };
}

function normalizeAttachment(
  attachment,
  attachmentIndex,
  messageId,
  conversationId,
  sourcePath,
  entryMap,
  warnings
) {
  const attachmentId =
    extractFirstString([attachment.id, attachment.attachment_id, attachment.name]) ||
    `${messageId}:attachment:${attachmentIndex + 1}`;
  const pathHint = extractFirstString([
    attachment.path,
    attachment.file_path,
    attachment.source_path,
    attachment.export_path,
    attachment.resourcePath,
  ]);
  const referencedEntry = resolveAttachmentEntry(pathHint, entryMap);
  const mimeType =
    extractFirstString([attachment.mimeType, attachment.mime_type, attachment.contentType]) ||
    inferMimeType(attachment.name || pathHint || "");
  const contentText = attachment.content || attachment.text || referencedEntry?.text || "";
  const binaryBase64 =
    referencedEntry && !contentText ? encodeBase64(referencedEntry.bytes) : "";

  if (pathHint && !referencedEntry && !contentText) {
    warnings.push(formatWarning(sourcePath, `첨부 원본을 찾지 못함: ${pathHint}`));
  }

  return {
    id: attachmentId,
    importSessionId: "",
    conversationId,
    messageId,
    name: attachment.name || fileNameFromPath(pathHint) || "attachment",
    mimeType,
    size: referencedEntry?.bytes?.length || contentText.length || 0,
    sourcePath: referencedEntry?.path || pathHint || sourcePath,
    rawRef: {
      source_path: referencedEntry?.path || pathHint || sourcePath,
    },
    contentText,
    binaryBase64,
  };
}

function finalizeImportResult({ archiveType, sourceName, conversations, messages, attachments, warnings }) {
  const importSessionId = buildImportSessionId(sourceName);
  const taggedConversations = conversations.map((conversation) => ({
    ...conversation,
    importSessionId,
  }));
  const taggedMessages = messages.map((message) => ({
    ...message,
    importSessionId,
  }));
  const taggedAttachments = attachments.map((attachment) => ({
    ...attachment,
    importSessionId,
  }));

  return {
    importSession: {
      id: importSessionId,
      sourceName,
      archiveType,
      importedAt: new Date().toISOString(),
      conversationCount: taggedConversations.length,
      messageCount: taggedMessages.length,
      attachmentCount: taggedAttachments.length,
      parseWarnings: warnings,
    },
    conversations: taggedConversations.sort(
      (left, right) => byTimestampValue(right.lastMessageAt) - byTimestampValue(left.lastMessageAt)
    ),
    messages: taggedMessages.sort(byTimestamp),
    attachments: taggedAttachments,
    parseWarnings: warnings,
  };
}

function buildImportSessionId(sourceName) {
  const stamp = Date.now().toString(36);
  const safeName = sourceName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return `import-${safeName || "takeout"}-${stamp}`;
}

function extractMessages(data) {
  if (Array.isArray(data.messages)) return data.messages;
  if (Array.isArray(data.events)) return data.events;
  if (Array.isArray(data.chat_messages)) return data.chat_messages;
  return [];
}

function extractParticipants(data) {
  return (
    data.participants ||
    data.members ||
    data.users ||
    data.conversation?.participants ||
    data.space?.members ||
    []
  );
}

function normalizeParticipants(participants) {
  return [...new Set((participants || []).map(normalizeParticipantName).filter(Boolean))];
}

function normalizeParticipantName(participant) {
  if (typeof participant === "string") return participant;
  return extractFirstString([
    participant.name,
    participant.displayName,
    participant.email,
    participant.formattedName,
  ]);
}

function extractMessageText(message) {
  if (typeof message.text === "string") return message.text;
  if (typeof message.text_body === "string") return message.text_body;
  if (typeof message.formattedText === "string") return message.formattedText;
  if (Array.isArray(message.segments)) {
    return message.segments
      .map((segment) => segment.text || segment.link?.text || "")
      .join("")
      .trim();
  }
  return "";
}

function extractAttachments(message) {
  return message.attachments || message.files || message.attachment_metadata || [];
}

function resolveAttachmentEntry(pathHint, entryMap) {
  if (!pathHint) return null;
  if (entryMap.has(pathHint)) return entryMap.get(pathHint);

  const normalizedHint = pathHint.replace(/^\.?\//, "");
  if (entryMap.has(normalizedHint)) return entryMap.get(normalizedHint);

  const match = [...entryMap.values()].find(
    (entry) => entry.path.endsWith(`/${normalizedHint}`) || fileNameFromPath(entry.path) === fileNameFromPath(normalizedHint)
  );
  return match || null;
}

function normalizeConversationType(value) {
  const lowered = String(value || "group").toLowerCase();
  if (lowered.includes("dm") || lowered.includes("direct")) return "dm";
  if (lowered.includes("space") || lowered.includes("room")) return "space";
  return "group";
}

function inferTitleFromPath(sourcePath) {
  return fileNameFromPath(sourcePath).replace(/\.json$/i, "").replace(/[-_]/g, " ");
}

function inferTypeFromPath(sourcePath) {
  const lowered = sourcePath.toLowerCase();
  if (lowered.includes("direct")) return "dm";
  if (lowered.includes("space")) return "space";
  return "group";
}

function inferMimeType(fileName) {
  const lowered = fileName.toLowerCase();
  if (lowered.endsWith(".html")) return "text/html";
  if (lowered.endsWith(".txt")) return "text/plain";
  if (lowered.endsWith(".json")) return "application/json";
  if (lowered.endsWith(".png")) return "image/png";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function normalizeTimestamp(value) {
  if (!value) return "";
  if (typeof value === "number") {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return new Date(trimmed.length <= 10 ? numeric * 1000 : numeric).toISOString();
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function extractFirstString(values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function formatWarning(sourcePath, detail) {
  return {
    sourcePath,
    detail,
  };
}

function fileNameFromPath(path = "") {
  return path.split("/").filter(Boolean).at(-1) || "";
}

function encodeBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function decodeBase64ToUtf8(value) {
  return new TextDecoder().decode(decodeBase64ToBytes(value));
}

function decodeBase64ToBytes(value) {
  if (!value) return new Uint8Array();
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function groupBy(items, getKey) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
    return map;
  }, new Map());
}

function byTimestamp(left, right) {
  return byTimestampValue(left.timestamp) - byTimestampValue(right.timestamp);
}

function byTimestampValue(value) {
  return value ? new Date(value).getTime() : 0;
}
