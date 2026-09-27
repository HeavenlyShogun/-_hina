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

test('keeps workspace navigation aligned with score sections and supports tab keys', async ({ page }) => {
  await page.goto('/');

  const sectionOrder = await page.locator('#rhythm-controls, #playlist-manager, #editor, #library-and-import')
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(sectionOrder).toEqual(['rhythm-controls', 'playlist-manager', 'editor', 'library-and-import']);

  await page.getByRole('navigation', { name: 'Workspace quick navigation' })
    .getByRole('button', { name: '譜面編輯', exact: true })
    .click();
  await expect(page.locator('#editor')).toBeInViewport();

  const libraryTab = page.getByRole('tab', { name: '內建曲庫' });
  const converterTab = page.getByRole('tab', { name: '檔案轉檔' });
  await libraryTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(converterTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#converter')).toBeVisible();
});
