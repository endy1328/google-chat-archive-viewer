import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("imports a local chat export JSON and renders the conversation", async ({ page }) => {
  await page.goto("/");

  await page.setInputFiles(
    "#file-input",
    path.join(__dirname, "fixtures", "google-chat-export.json")
  );

  await expect(page.getByRole("heading", { name: "Product Launch Room" })).toBeVisible();
  await expect(page.getByText("Archive load ready")).toBeVisible();
  await expect(page.getByText("notes.txt")).toBeVisible();
});
