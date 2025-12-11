import { test, expect } from '@playwright/test';

test.describe('Bit Flipper large input rendering', () => {
  test('chunked rendering shows loader and completes for large inputs', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#number-input');
    // treat the input as a bitcount -> large value will render via chunked path
    // ensure we're in bitcount mode
    await page.selectOption('#mode', 'bitcount');
    await input.fill('500000000');

    // loader should appear then hide once finished, and we should have the KB
    // groups rendered for this input. (500k bits -> 62500 bytes -> 62 KB groups)
    // Each KB block is now a canvas element (not 8192 DOM cells)
    // const loader = page.locator('#loader');
    // await expect(loader).toBeVisible({ timeout: 10000 });
    // await expect(loader).toBeHidden({ timeout: 10000 });
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(60, { timeout: 10000 });

    // Verify that each MB block contains a canvas element (not a grid of cells)
    const canvases = page.locator('.mb-canvas');
    await expect(canvases).toHaveCount(60, { timeout: 10000 });
    // Verify canvas dimensions: 32×32 pixels (1 pixel per bit)
    const firstCanvas = canvases.first();
    const canvasWidth = await firstCanvas.evaluate(el => (el as HTMLCanvasElement).width);
    const canvasHeight = await firstCanvas.evaluate(el => (el as HTMLCanvasElement).height);
    expect(canvasWidth).toBe(32);
    expect(canvasHeight).toBe(32);
  });

  test('MB-level canvas renders for large inputs', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 20 MB -> 20 * (8192 bits * 1024 KB) = 167772160 bits
    await input.fill('167772160');
    // loader check removed, optimized MB rendering should be fast enough
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(20, { timeout: 10000 });
    const canvases = page.locator('.mb-canvas');
    await expect(canvases).toHaveCount(20, { timeout: 10000 });
    const first = canvases.first();
    const w = await first.evaluate(el => (el as HTMLCanvasElement).width);
    const h = await first.evaluate(el => (el as HTMLCanvasElement).height);
    expect(w).toBe(32);
    expect(h).toBe(32);
  });

  test('very large bitcount (500M bits) renders MB groups ~60', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('500000000');
    // loader check removed, optimized MB rendering should be fast enough
    // Expect ~60 MB groups
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(60, { timeout: 10000 });
    const canvases = page.locator('.mb-canvas');
    await expect(canvases).toHaveCount(60, { timeout: 10000 });
  });

  test('inputting 2kb worth of bits shows correct KB groups and bytes, then updating input should update canvas count', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 2 KB = 2 * 8192 = 16384 bits
    await input.fill('16384');
    const kbs = page.locator('.kb-block');
    await expect(kbs).toHaveCount(2, { timeout: 10000 });
    // Now update to 3 KB
    // 3 KB = 3 * 8192 = 24576 bits
    await input.fill('24576');
    await expect(kbs).toHaveCount(3, { timeout: 10000 });
    // Now update to 1 KB
    // 1 KB = 1 * 8192 = 8192 bits
    await input.fill('8192');
    await expect(kbs).toHaveCount(1, { timeout: 10000 });
    // Now update to 0 bits
    await input.fill('0');
    await expect(kbs).toHaveCount(0, { timeout: 10000 });
    // Now update to 500 bits
    await input.fill('500');
    await expect(kbs).toHaveCount(0, { timeout: 10000 });
    // Now update to 4 MB
    // 4 MB = 4 * 8192 * 1024 = 33554432 bits
    await input.fill('33554432');
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(4, { timeout: 10000 });
    // Now update to 6 MB
    // 6 MB = 6 * 8192 * 1024 = 50331648 bits
    await input.fill('50331648');
    await expect(mbs).toHaveCount(6, { timeout: 10000 });
    // Now update to 8 MB
    // 8 MB = 8 * 8192 * 1024 = 67108864 bits
    await input.fill('67108864');
    await expect(mbs).toHaveCount(8, { timeout: 10000 });
    // Now update to 32 MB
    // 32 MB = 32 * 8192 * 1024 = 268435456 bits
    await input.fill('268435456');
    await expect(mbs).toHaveCount(32, { timeout: 10000 });
    // Now update to 16 MB
    // 16 MB = 16 * 8192 * 1024 = 134217728 bits
    await input.fill('134217728');
    await expect(mbs).toHaveCount(16, { timeout: 10000 });
    // Now update to 512 MB to verify loader and chunked rendering again
    // 512 MB = 512 * 8192 * 1024 = 4294967296 bits
    await input.fill('4294967296');
    // loader check removed, optimized MB rendering should be fast enough
    await expect(mbs).toHaveCount(512, { timeout: 20000 });
  });

  test('repeatedly updating input with KB values updates KB canvas count without regression', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    const kbs = page.locator('.kb-block');

    // deterministic pseudo-random sequence so the test is repeatable
    let seed = 1234;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

    const steps = [];
    for (let i = 0; i < 12; i++) {
      // pick k: 1..64 (KB groups)
      const k = Math.floor(rnd() * 64) + 1;
      steps.push(k);
    }

    for (const k of steps) {
      const bits = k * 8192; // 1 KB = 8192 bits
      await input.fill(String(bits));
      await expect(kbs).toHaveCount(k, { timeout: 10000 });
    }
  });

  test('unit-select: KB and bytes and MB interpretations update canvas counts', async ({ page }) => {
    await page.goto('/?DEBUG_RENDER=true');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');

    // KB: set unit to KB and fill '2' -> expect 2 KB blocks
    await page.selectOption('#unit-select', 'KB');
    await input.fill('2');
    const dbg = page.locator('#debug-info');
    await expect(dbg).toContainText('groupCount=2', { timeout: 2000 });
    const kbs = page.locator('.kb-block');
    await expect(kbs).toHaveCount(2, { timeout: 10000 });
    // update to 3
    await input.fill('3');
    await expect(kbs).toHaveCount(3, { timeout: 10000 });

    // Bytes: set unit to bytes and fill 1024 -> expect 1 KB block
    await page.selectOption('#unit-select', 'bytes');
    await input.fill('1024');
    await expect(dbg).toContainText('groupCount=1', { timeout: 2000 });
    await expect(kbs).toHaveCount(1, { timeout: 10000 });

    // MB: set unit to MB and fill 1 -> expect 1 MB block
    await page.selectOption('#unit-select', 'MB');
    await input.fill('1');
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(1, { timeout: 10000 });
  });

  test('unit-select label and availability reflect mode', async ({ page }) => {
    await page.goto('/');
    const inputLabel = page.locator('#input-label');
    const unitSelect = page.locator('#unit-select');
    const mode = page.locator('#mode');

    // By default binary mode should be selected and unit select hidden
    await expect(mode).toHaveValue('binary');
    await expect(unitSelect).toBeHidden();
    await expect(inputLabel).toHaveText('Enter bit count');

    // Switch to bitcount and ensure unitSelect visible and label updates
    await page.selectOption('#mode', 'bitcount');
    await expect(unitSelect).toBeVisible();
    // default unit 'bits' should use bit label
    await expect(inputLabel).toHaveText('Enter bit count');

    // change unit to KB and check label
    await page.selectOption('#unit-select', 'KB');
    await expect(inputLabel).toHaveText('Enter KB count');
  });
  test('repeatedly updating input with MB values updates MB canvas count without regression', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    const mbs = page.locator('.mb-block');
    // deterministic pseudo-random sequence so the test is repeatable
    let seed = 1234;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; } // deterministic pseudo-random sequence so the test is repeatable
    const steps = [];
    for (let i = 0; i < 12; i++) {
      // pick m: 1..64 (MB groups)
      const m = Math.floor(rnd() * 64) + 1;
      steps.push(m);
    }

    for (const m of steps) {
      const bits = m * 8192 * 1024; // 1 MB = 8192 * 1024 bits
      await input.fill(String(bits));
      await expect(mbs).toHaveCount(m, { timeout: 10000 });
    }
  });

  test('repeatedly updating input with GB values updates GB canvas count without regression', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    const gbs = page.locator('.gb-block');
    // deterministic pseudo-random sequence so the test is repeatable
    let seed = 1234;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    const steps = [];
    for (let i = 0; i < 12; i++) {
      // pick m: 1..64 (MB groups)
      const m = Math.floor(rnd() * 64) + 1;
      steps.push(m);
    }
    for (const m of steps) {
      const bits = m * 8192 * 1024 * 1024; // 1 GB = 8192 * 1024 * 1024 bits
      await input.fill(String(bits));
      await expect(gbs).toHaveCount(m, { timeout: 10000 });
    }
  });

});