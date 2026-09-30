import { expect, test } from '@playwright/test';

test('welcome page explains the workspace and entry opens the working app', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /讓每一段旋律/ })).toBeVisible();
  await expect(page.getByText('匯入、整理與轉換樂譜')).toBeVisible();
  await expect(page.getByText('選擇演奏方式，調整音色')).toBeVisible();
  await expect(page.getByText('播放、練習並保存成果')).toBeVisible();

  await page.getByRole('button', { name: '進入音樂宇宙' }).click();
  await page.waitForTimeout(3000);
  expect({ pageErrors, consoleErrors }).toEqual({ pageErrors: [], consoleErrors: [] });
  await expect(page.locator('#lyre-keyboard')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
