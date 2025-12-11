import { test, expect } from '@playwright/test';

test.describe('Bit Flipper number input tests', () => {
  test('inputting zero bits shows no bytes', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('0');
    const bytes = page.locator('.byte');
    const onBits = bytes.locator('.bit.on');
    await expect(onBits).toHaveCount(0);
    await expect(bytes).toHaveCount(1);
  });

  test('inputting negative bits shows no bytes', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('-100');
    const bytes = page.locator('.byte');
    const onBits = bytes.locator('.bit.on');
    await expect(onBits).toHaveCount(0);
    await expect(bytes).toHaveCount(1);
  });

  test('inputting 1 bit shows 1 partial byte', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('1');
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(1, { timeout: 10000 });
    const bitsInByte = bytes.first().locator('.bit.on');
    await expect(bitsInByte).toHaveCount(1);
  });

  test('inputting 7 bits shows 1 partial byte', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('7');
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(1, { timeout: 10000 });
    const bitsInByte = bytes.first().locator('.bit.on');
    await expect(bitsInByte).toHaveCount(7);
  });

  test('inputting non-multiple of 8 bits shows correct bytes and partial byte', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('1030');
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(129, { timeout: 10000 });
    const lastByte = bytes.nth(128);
    const bitsInLastByte = lastByte.locator('.bit.on');
    await expect(bitsInLastByte).toHaveCount(6);
  });

});