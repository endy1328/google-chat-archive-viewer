# Google Takeout Chat Viewer MVP

정적 HTML/CSS/JS 기반의 로컬 전용 뷰어 MVP입니다.

## 테스트 실행

```bash
npm install
npm run test:unit
npm run test:smoke
```

- `test:unit`: parser/archive 정규화와 뷰어 필터, 캐시 복구 로직을 `Vitest`로 검증합니다.
- `test:smoke`: 로컬 정적 서버 위에서 Mock 데이터 로드와 핵심 필터 흐름을 `Playwright`로 검증합니다.
- `Vitest`는 `tests/**/*.test.js`, `Playwright`는 `tests/**/*.spec.js`만 수집하도록 분리했습니다.
- `Playwright`는 기존 로컬 개발 서버와 충돌하지 않도록 전용 포트 `4193`에서 테스트 서버를 띄웁니다.
- 브라우저가 아직 설치되지 않았다면 한 번만 `npx playwright install chromium`를 실행하면 됩니다.

## 포함 기능

- 파일 선택 진입 화면
- 로컬 인덱싱 진행 상태
- 대화 목록/타임라인/상세 패널 3단 레이아웃
- DM/Group/Space 유형 필터
- 메시지/참여자/첨부명 검색
- 시작일/종료일 기간 필터
- 첨부 blob URL 열람
- localStorage 캐시 복원 및 초기화
- Mock 데이터 로드

## 현재 데이터 계약 가정

```json
{
  "conversations": [
    {
      "id": "string",
      "title": "string",
      "type": "dm | group | space",
      "participants": ["string"],
      "lastMessageAt": "ISO-8601",
      "messages": [
        {
          "id": "string",
          "author": "string",
          "timestamp": "ISO-8601",
          "text": "string",
          "attachments": [
            {
              "id": "string",
              "name": "string",
              "mimeType": "string",
              "content": "string"
            }
          ]
        }
      ]
    }
  ]
}
```

`attachments.content`는 MVP 단순화를 위해 문자열 payload를 직접 받는다고 가정했습니다. 실제 parser/indexer가 바이너리 blob, object URL, IndexedDB key를 주는 구조라면 `buildAttachmentLink()`만 교체하면 됩니다.
