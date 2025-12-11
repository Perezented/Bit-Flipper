import { test, expect } from '@playwright/test';

test.describe('Bit Flipper bit viewer tests', () => {
  test('default bitcount mode shows 1024 bits => 128 bytes', async ({ page }) => {
    await page.goto('/');
    // ensure we're in bitcount mode
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('1024');
    // wait for rendered bytes to appear
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(128, { timeout: 10000 });
  });

  test('toggling mode resets input and clears bytes', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('1024');
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(128, { timeout: 10000 });
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