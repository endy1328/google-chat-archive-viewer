# Google Chat Archive Viewer

브라우저 로컬 실행만 전제로 한 Google Chat archive viewer MVP입니다. `.zip`, `.tgz`, `.tar`, `.json` 입력을 파싱하고, 정규화된 결과를 IndexedDB에 저장한 뒤 기존 3패널 뷰어에서 탐색합니다.

## 테스트 실행

```bash
npm install
npm run test:unit
npm run test:e2e
```

- `test:unit`: archive 파서, 정규화 로직, IndexedDB 저장/복원 경로를 `Vitest`로 검증합니다.
- `test:e2e`: 실제 브라우저에서 Mock 데이터/로컬 JSON 업로드 플로우를 `Playwright`로 검증합니다.
- `Vitest`는 `tests/**/*.test.js`, `Playwright`는 `tests/**/*.spec.js`만 수집하도록 분리했습니다.
- `Playwright`는 기존 로컬 개발 서버와 충돌하지 않도록 전용 포트 `4193`에서 테스트 서버를 띄웁니다.
- 브라우저가 아직 설치되지 않았다면 한 번만 `npx playwright install chromium`를 실행하면 됩니다.

## 포함 기능

- `.zip`, `.tgz`, `.tar`, `.json` 입력 로드
- Web Worker 기반 archive 파싱
- 정규화된 `conversations/messages/attachments/import_sessions` 세션 저장
- IndexedDB 캐시 복원 및 초기화
- 대화 목록/타임라인/상세 패널 3단 레이아웃
- DM/Group/Space 유형 필터
- 메시지/참여자/첨부명 검색
- 시작일/종료일 기간 필터
- 첨부 blob URL 열람
- Mock 데이터 로드

## 파서 입력 계약

```json
{
  "title": "string",
  "type": "DIRECT_MESSAGE | GROUP | SPACE",
  "participants": [{ "name": "string" }],
  "messages": [
    {
      "id": "string",
      "creator": { "name": "string" },
      "created_at": "ISO-8601 | epoch",
      "text": "string",
      "attachments": [
        {
          "name": "string",
          "path": "archive relative path | optional",
          "mimeType": "string | optional",
          "content": "inline text content | optional"
        }
      ]
    }
  ]
}
```

추가로 이미 정규화된 뷰어 계약 `{ conversations: [...] }` JSON도 직접 열 수 있습니다.

## 출력 계약

```json
{
  "importSession": {
    "id": "string",
    "sourceName": "string",
    "archiveType": "zip | tgz | tar | json",
    "importedAt": "ISO-8601"
  },
  "conversations": [
    {
      "id": "string",
      "importSessionId": "string",
      "title": "string",
      "type": "dm | group | space",
      "participants": ["string"],
      "lastMessageAt": "ISO-8601",
      "sourcePath": "string",
      "rawRef": { "source_path": "string" },
      "parseWarnings": []
    }
  ],
  "messages": [
    {
      "id": "string",
      "conversationId": "string",
      "author": "string",
      "timestamp": "ISO-8601",
      "text": "string",
      "attachmentIds": ["string"],
      "sourcePath": "string",
      "rawRef": { "source_path": "string" },
      "parseWarnings": []
    }
  ],
  "attachments": [
    {
      "id": "string",
      "conversationId": "string",
      "messageId": "string",
      "name": "string",
      "mimeType": "string",
      "size": 0,
      "sourcePath": "string",
      "rawRef": { "source_path": "string" },
      "contentText": "string",
      "binaryBase64": "string"
    }
  ],
  "parseWarnings": [
    {
      "sourcePath": "string",
      "detail": "string"
    }
  ]
}
```
