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

test('switches between solo, band, and orchestra performance modes', async ({ page }) => {
  await page.goto('/');

  const soloMode = page.getByRole('button', { name: '獨奏 Solo', exact: true });
  const bandMode = page.getByRole('button', { name: '樂團 Band', exact: true });
  const orchestraMode = page.getByRole('button', { name: '管弦樂團 Orchestra', exact: true });

  await expect(soloMode).toHaveAttribute('aria-pressed', 'true');
  await bandMode.click();
  await expect(bandMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Blend', { exact: true })).toBeVisible();
  await orchestraMode.click();
  await expect(orchestraMode).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('依 MIDI 軌道原始樂器演奏')).toBeVisible();
  await soloMode.click();
  await expect(soloMode).toHaveAttribute('aria-pressed', 'true');
});

test('automatically starts playback when advancing to the next library score', async ({ page }) => {
  await page.goto('/');

  const nextButton = page.getByRole('button', { name: 'Next' });
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});
