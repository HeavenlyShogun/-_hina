import { expect, test } from '@playwright/test';

test('keeps rhythm controls responsive and locks instrument changes during playback', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#lyre-keyboard')).toBeVisible();
  await expect(page.locator('.instrument-btn').first()).toBeVisible();

  const beatGridSelect = page.locator('#rhythm-controls select').nth(2);
  const bpmSlider = page.locator('#rhythm-controls input[type="range"]').first();

  for (const value of ['4', '8', '16', '32', '12', '24', '16']) {
    await beatGridSelect.selectOption(value);
  }

  for (const value of [20, 300, 42.5, 260, 90]) {
    await bpmSlider.evaluate((slider, nextValue) => {
      slider.value = String(nextValue);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  await expect(beatGridSelect).toHaveValue('16');
  await expect(page.locator('#lyre-keyboard')).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue(/surges_slim/);

  await page.getByRole('button', { name: 'Soft Lead' }).click();
  await page.locator('#lyre-keyboard div.absolute.inset-x-0.top-0 button').first().click();

  await expect(page.locator('[aria-label="Seek playback timeline"]')).toHaveAttribute('aria-valuenow', /[1-9]\d*/);
  await expect(page.locator('.blend-toggle input')).toBeDisabled();
  await expect(page.locator('.instrument-btn').first()).toBeDisabled();
});
