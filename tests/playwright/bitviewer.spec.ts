import { test, expect } from '@playwright/test';

test.describe('Bit Viewer basic UI', () => {
  test('default bitcount mode shows 1024 bits => 128 bytes', async ({ page }) => {
    await page.goto('/');
    // the input defaults to bitcount mode
    const input = page.locator('#number-input');
    await input.fill('1024');
    // wait for rendered bytes to appear
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(128, { timeout: 120000 });
  });

  test('chunked rendering shows loader and completes for large inputs', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#number-input');
    // 100000 bits => 12500 bytes which exceeds the chunk threshold
    await input.fill('100000');

    // loader should appear quickly
    const loader = page.locator('#loader');
    await expect(loader).toBeVisible({ timeout: 5000 });

    // finally the loader will hide and the expected number of bytes should be present
    await expect(loader).toBeHidden({ timeout: 120000 });
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(12500, { timeout: 120000 });
  });

  test('modifier shortcut hints visible and arrow modifiers change value', async ({ page }) => {
    await page.goto('/');
    const hint = page.locator('.modifier-tip');
    await expect(hint).toBeVisible();

    const input = page.locator('#number-input');
    await input.fill('0');
    await input.focus();

    // ArrowUp -> +1
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('1');

    // Shift+ArrowUp -> +10
    await page.keyboard.down('Shift');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Shift');
    await expect(input).toHaveValue('11');

    // Ctrl+ArrowUp -> +100
    await page.keyboard.down('Control');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Control');
    await expect(input).toHaveValue('111');

    // Alt+ArrowUp -> +1000
    await page.keyboard.down('Alt');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.up('Alt');
    await expect(input).toHaveValue('1111');
  });
});
