const DB_NAME = "google-chat-archive-viewe";
const DB_VERSION = 1;
const STORE_IMPORTS = "import_sessions";
const STORE_CONVERSATIONS = "conversations";
const STORE_MESSAGES = "messages";
const STORE_ATTACHMENTS = "attachments";

export async function saveImportResult(importResult) {
  const db = await openDatabase();
  const transaction = db.transaction(
    [STORE_IMPORTS, STORE_CONVERSATIONS, STORE_MESSAGES, STORE_ATTACHMENTS],
    "readwrite"
  );

  await Promise.all([
    clearStore(transaction.objectStore(STORE_IMPORTS)),
    clearStore(transaction.objectStore(STORE_CONVERSATIONS)),
    clearStore(transaction.objectStore(STORE_MESSAGES)),
    clearStore(transaction.objectStore(STORE_ATTACHMENTS)),
  ]);

  transaction.objectStore(STORE_IMPORTS).put(importResult.importSession);
  importResult.conversations.forEach((conversation) =>
    transaction.objectStore(STORE_CONVERSATIONS).put(conversation)
  );
  importResult.messages.forEach((message) =>
    transaction.objectStore(STORE_MESSAGES).put(message)
  );
  importResult.attachments.forEach((attachment) =>
    transaction.objectStore(STORE_ATTACHMENTS).put(attachment)
  );

  await completeTransaction(transaction);
}

export async function loadLatestImportResult() {
  const db = await openDatabase();
  const imports = await requestAll(db.transaction(STORE_IMPORTS, "readonly").objectStore(STORE_IMPORTS));
  if (!imports.length) return null;

  const latestImport = imports.sort(
    (left, right) => new Date(right.importedAt).getTime() - new Date(left.importedAt).getTime()
  )[0];
  const conversationStore = db.transaction(STORE_CONVERSATIONS, "readonly").objectStore(STORE_CONVERSATIONS);
  const messageStore = db.transaction(STORE_MESSAGES, "readonly").objectStore(STORE_MESSAGES);
  const attachmentStore = db.transaction(STORE_ATTACHMENTS, "readonly").objectStore(STORE_ATTACHMENTS);

  const conversations = (await requestAll(conversationStore)).filter(
    (conversation) => conversation.importSessionId === latestImport.id
  );
  const messages = (await requestAll(messageStore)).filter(
    (message) => message.importSessionId === latestImport.id
  );
  const attachments = (await requestAll(attachmentStore)).filter(
    (attachment) => attachment.importSessionId === latestImport.id
  );

  return {
    importSession: latestImport,
    conversations,
    messages,
    attachments,
    parseWarnings: latestImport.parseWarnings || [],
  };
}

export async function clearDatabase() {
  const db = await openDatabase();
  const transaction = db.transaction(
    [STORE_IMPORTS, STORE_CONVERSATIONS, STORE_MESSAGES, STORE_ATTACHMENTS],
    "readwrite"
  );
  await Promise.all([
    clearStore(transaction.objectStore(STORE_IMPORTS)),
    clearStore(transaction.objectStore(STORE_CONVERSATIONS)),
    clearStore(transaction.objectStore(STORE_MESSAGES)),
    clearStore(transaction.objectStore(STORE_ATTACHMENTS)),
  ]);
  await completeTransaction(transaction);
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_IMPORTS)) {
        db.createObjectStore(STORE_IMPORTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        db.createObjectStore(STORE_CONVERSATIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function clearStore(store) {
  return requestToPromise(store.clear());
}

function requestAll(store) {
  return requestToPromise(store.getAll());
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}
