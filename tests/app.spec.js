import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

test("imports a local chat export zip and renders the conversation", async ({ page }) => {
  await page.goto("/");

  const archiveBytes = zipSync({
    "Takeout/Google Chat/Spaces/Product Launch Room/messages.json": strToU8(
      JSON.stringify({
        name: "Product Launch Room",
        type: "SPACE",
        participants: [{ name: "You" }, { name: "Mina Kim" }],
        messages: [
          {
            id: "msg-1",
            creator: { name: "Mina Kim" },
            created_at: "2026-05-11T09:00:00Z",
            text: "Archive load ready",
            attachments: [
              {
                id: "att-1",
                name: "notes.txt",
                path: "Takeout/Google Chat/Spaces/Product Launch Room/files/notes.txt",
              },
            ],
          },
        ],
      })
    ),
    "Takeout/Google Chat/Spaces/Product Launch Room/files/notes.txt": strToU8("parser-ready"),
  });

  await page.setInputFiles("#file-input", {
    name: "google-chat-export.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archiveBytes),
  });

  await expect(page.getByRole("heading", { name: "Product Launch Room" })).toBeVisible();
  await expect(page.locator("#message-list").getByText("Archive load ready")).toBeVisible();
  await expect(page.getByRole("link", { name: "notes.txt" })).toHaveCount(2);
});
