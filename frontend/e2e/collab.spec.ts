import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2EState = {
  elementsCount: number;
  viewport: { x: number; y: number; zoom: number };
  followTargetClientId: string | null;
  voteActive: boolean;
  timerRunning: boolean;
  voteRemaining: number;
};

async function openCollabPage(context: BrowserContext, room: string, username: string) {
  const page = await context.newPage();
  await page.goto(
    `/?collab=mock&room=${encodeURIComponent(room)}&latency=20&jitter=10&username=${encodeURIComponent(username)}&e2e=1`,
  );
  await page.waitForFunction(() => {
    const host = window as typeof window & { __canvasE2E?: { getState: () => unknown } };
    return typeof host.__canvasE2E?.getState === "function";
  });
  return page;
}

async function getState(page: Page): Promise<E2EState> {
  return page.evaluate(() => {
    const host = window as typeof window & { __canvasE2E?: { getState: () => E2EState } };
    return host.__canvasE2E!.getState();
  });
}

async function addNote(page: Page, x = 320, y = 260) {
  await page.getByLabel("Square note tool (N)").click();
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x, y } });
}

test("join tardif recoit les elements existants", async ({ browser }) => {
  const room = `e2e-join-${Date.now()}`;
  const contextA = await browser.newContext();
  const pageA = await openCollabPage(contextA, room, "Alice");

  await addNote(pageA);
  await expect.poll(() => getState(pageA).then((s) => s.elementsCount)).toBe(1);

  const pageB = await openCollabPage(contextA, room, "Bob");

  await expect.poll(() => getState(pageB).then((s) => s.elementsCount)).toBe(1);

  await contextA.close();
});

test("follow synchronise vue/zoom puis s'arrete sur mouvement manuel", async ({ browser }) => {
  const room = `e2e-follow-${Date.now()}`;
  const contextA = await browser.newContext();
  const pageA = await openCollabPage(contextA, room, "Alice");
  const pageB = await openCollabPage(contextA, room, "Bob");

  await expect(pageB.locator('.connected-user.user-btn[title^="Alice -"]')).toBeVisible();
  await pageB.locator('.connected-user.user-btn[title^="Alice -"]').click();
  await pageB.getByRole("button", { name: "Suivre cet utilisateur" }).click();

  const canvasA = pageA.locator("canvas");
  await canvasA.hover({ position: { x: 400, y: 280 } });
  await pageA.mouse.wheel(0, -480);

  await expect.poll(async () => (await getState(pageB)).viewport.zoom).toBeGreaterThan(1);

  const beforePanZoom = (await getState(pageB)).viewport.zoom;
  const canvasBBox = await pageB.locator("canvas").boundingBox();
  if (!canvasBBox) throw new Error("Canvas not found");

  await pageB.keyboard.down("Space");
  await pageB.mouse.move(canvasBBox.x + 320, canvasBBox.y + 260);
  await pageB.mouse.down({ button: "left" });
  await pageB.mouse.move(canvasBBox.x + 380, canvasBBox.y + 300);
  await pageB.mouse.up({ button: "left" });
  await pageB.keyboard.up("Space");

  await expect.poll(async () => (await getState(pageB)).followTargetClientId).toBeNull();
  await expect.poll(async () => (await getState(pageB)).viewport.zoom).toBeCloseTo(beforePanZoom, 2);

  await contextA.close();
});

test("session vote + timer partagee entre onglets", async ({ browser }) => {
  const room = `e2e-vote-${Date.now()}`;
  const contextA = await browser.newContext();
  const pageA = await openCollabPage(contextA, room, "Alice");
  const pageB = await openCollabPage(contextA, room, "Bob");

  await addNote(pageA, 360, 280);
  await expect.poll(() => getState(pageB).then((s) => s.elementsCount)).toBe(1);

  await pageA.getByRole("button", { name: "Vote" }).click();
  const voteMenu = pageA.locator('[aria-label="Vote"]');
  await voteMenu.locator('label:has-text("Tous les objets") input[type="radio"]').check();

  const numbers = voteMenu.locator('input[type="number"]');
  await numbers.nth(0).fill("1");
  await numbers.nth(1).fill("1");

  await voteMenu.locator('label:has-text("Ajouter un timer") input[type="checkbox"]').check();
  await numbers.nth(2).fill("0");
  await numbers.nth(3).fill("5");

  await voteMenu.getByRole("button", { name: "Valider" }).click();

  await expect(pageA.locator(".vote-panel")).toBeVisible();
  await expect(pageB.locator(".vote-panel")).toBeVisible();
  await expect(pageA.locator(".canvas-timer")).toBeVisible();
  await expect(pageB.locator(".canvas-timer")).toBeVisible();

  await expect.poll(() => getState(pageB).then((s) => s.voteActive)).toBe(true);
  await expect.poll(() => getState(pageB).then((s) => s.timerRunning)).toBe(true);

  await contextA.close();
});
