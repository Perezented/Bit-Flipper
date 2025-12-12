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

  test('input is truncated based on mode (bitcount)', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // create a value longer than the limit (42 for bitcount)
    const longVal = '9'.repeat(50);
    await input.fill(longVal);
    const val = await input.inputValue();
    // Expect the input value length to be at most 42
    expect(val.length).toBeLessThanOrEqual(42);
  });

  test('input is truncated based on mode (binary)', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'binary');
    const input = page.locator('#number-input');
    // create a value longer than the limit (90 for binary)
    const longVal = '9'.repeat(100);
    await input.fill(longVal);
    const val = await input.inputValue();
    // Expect the input value length to be at most 90
    expect(val.length).toBeLessThanOrEqual(90);
  });

  test('input gets truncated when switching to a shorter max-length mode', async ({ page }) => {
    await page.goto('/');
    // start in binary mode and set a value shorter than 90 but longer than 42
    await page.selectOption('#mode', 'binary');
    const input = page.locator('#number-input');
    const longBinaryValue = '9'.repeat(70);
    await input.fill(longBinaryValue);
    // now switch to bitcount -> should apply 42 length and truncate existing value
    await page.selectOption('#mode', 'bitcount');
    const val = await input.inputValue();
    expect(val.length).toBeLessThanOrEqual(42);
  });

  test('bitcount unit MB sets maxlength and truncates', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    await page.selectOption('#unit-select', 'MB');
    const input = page.locator('#number-input');
    // Ensure maxlength attribute set
    const maxLenAttr = await input.getAttribute('maxlength');
    expect(Number(maxLenAttr)).toBeLessThanOrEqual(36);
    // Fill a long value and ensure it gets truncated to <=36
    const longVal = '9'.repeat(50);
    await input.fill(longVal);
    const val = await input.inputValue();
    expect(val.length).toBeLessThanOrEqual(36);
  });

  test('bitcount unit GB sets maxlength and truncates', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    await page.selectOption('#unit-select', 'GB');
    const input = page.locator('#number-input');
    const maxLenAttr = await input.getAttribute('maxlength');
    expect(Number(maxLenAttr)).toBeLessThanOrEqual(33);
    const longVal = '9'.repeat(50);
    await input.fill(longVal);
    const val = await input.inputValue();
    expect(val.length).toBeLessThanOrEqual(33);
  });

  test('bitcount unit TB sets maxlength and truncates', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    await page.selectOption('#unit-select', 'TB');
    const input = page.locator('#number-input');
    const maxLenAttr = await input.getAttribute('maxlength');
    expect(Number(maxLenAttr)).toBeLessThanOrEqual(30);
    const longVal = '9'.repeat(50);
    await input.fill(longVal);
    const val = await input.inputValue();
    expect(val.length).toBeLessThanOrEqual(30);
  });

});