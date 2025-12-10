import { test, expect } from '@playwright/test';

test.describe('Bit Flipper basic UI', () => {
  test('default bitcount mode shows 1024 bits => 128 bytes', async ({ page }) => {
    await page.goto('/');
    // ensure we're in bitcount mode
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('1024');
    // wait for rendered bytes to appear
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(128, { timeout: 120000 });
  });

  test('chunked rendering shows loader and completes for large inputs', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#number-input');
    // treat the input as a bitcount -> large value will render via chunked path
    // ensure we're in bitcount mode
    await page.selectOption('#mode', 'bitcount');
    await input.fill('500000');

    // loader should appear then hide once finished, and we should have the KB
    // groups rendered for this input. (500k bits -> 62500 bytes -> 62 KB groups)
    // Each KB block is now a canvas element (not 8192 DOM cells)
    const loader = page.locator('#loader');
    await expect(loader).toBeVisible({ timeout: 5000 });
    await expect(loader).toBeHidden({ timeout: 120000 });
    const kbs = page.locator('.kb-block');
    await expect(kbs).toHaveCount(62, { timeout: 120000 });

    // Verify that each KB block contains a canvas element (not a grid of cells)
    const canvases = page.locator('.kb-canvas');
    await expect(canvases).toHaveCount(62, { timeout: 5000 });

    // Verify canvas dimensions: 128×64 pixels (1 pixel per bit)
    const firstCanvas = canvases.first();
    const canvasWidth = await firstCanvas.evaluate(el => (el as HTMLCanvasElement).width);
    const canvasHeight = await firstCanvas.evaluate(el => (el as HTMLCanvasElement).height);
    expect(canvasWidth).toBe(128);
    expect(canvasHeight).toBe(64);
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

  test('MB-level canvas renders for large inputs', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 2 MB -> 2 * (8192 bits * 1024 KB) = 16777216 bits
    await input.fill('16777216');
    const loader = page.locator('#loader');
    await expect(loader).toBeVisible({ timeout: 5000 });
    await expect(loader).toBeHidden({ timeout: 120000 });
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(2, { timeout: 120000 });
    const canvases = page.locator('.mb-canvas');
    await expect(canvases).toHaveCount(2, { timeout: 5000 });
    const first = canvases.first();
    const w = await first.evaluate(el => (el as HTMLCanvasElement).width);
    const h = await first.evaluate(el => (el as HTMLCanvasElement).height);
    expect(w).toBe(32);
    expect(h).toBe(32);
  });
});
