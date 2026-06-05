import { expect, test } from '@playwright/test';

test('loads the default slim score and starts audible playback state', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#lyre-keyboard')).toBeVisible();
  await expect(page.locator('.lyre-key-button')).toHaveCount(21);
  await expect(page.locator('textarea')).toHaveValue(/surges_slim/);

  await page.getByRole('button', { name: 'Soft Lead' }).click();
  await page.keyboard.down('q');
  await expect(page.locator('.lyre-key-button.playing-active').first()).toBeVisible();
  await page.keyboard.up('q');
  await expect(page.locator('.lyre-key-button.playing-active')).toHaveCount(0);

  await page.locator('#lyre-keyboard div.absolute.inset-x-0.top-0 button').first().click();

  await expect.poll(async () => page.evaluate(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    return AudioContextClass ? 'available' : 'missing';
  })).toBe('available');

  await expect(page.locator('[aria-label="Seek playback timeline"]')).toHaveAttribute('aria-valuenow', /[1-9]\d*/);
  await expect(page.locator('.blend-toggle input')).toBeDisabled();
});
