import { expect, test } from "@playwright/test";

test("mock data load and filters render expected conversation and detail state", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Takeout JSON 또는 Mock 데이터로 시작" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mock 데이터" }).click();

  await expect(page.locator("#viewer")).toBeVisible();
  await expect(page.locator("#conversation-count")).toHaveText("3");
  await expect(page.locator("#timeline-title")).toHaveText("Mina Kim");

  await page.getByPlaceholder("메시지, 첨부명, 참여자 검색").fill("incident-summary");
  await expect(page.locator("#conversation-count")).toHaveText("1");
  await expect(page.locator("#timeline-title")).toHaveText("Support Ops Space");
  await expect(page.locator("#message-count")).toHaveText("1");
  await expect(page.locator(".attachment-link")).toHaveText("incident-summary.html");

  await page.getByLabel("대화 유형").selectOption("space");
  await page.getByLabel("시작일").fill("2026-05-08");
  await page.getByLabel("종료일").fill("2026-05-08");

  await expect(page.locator("#conversation-count")).toHaveText("1");
  await expect(page.locator("#detail-panel-content")).toContainText("첨부 1개");
});
