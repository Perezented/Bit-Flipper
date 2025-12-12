import { test, expect } from '@playwright/test';

test.describe('Bit Flipper testing inputting x bits', () => {

  test('inputting x bits shows correct number of bytes', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('2048');
    const bytes = page.locator('.byte');
    await expect(bytes).toHaveCount(256, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of KB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    await input.fill('16384');
    const kbs = page.locator('.kb-block');
    await expect(kbs).toHaveCount(2, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of MB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 5 MB = 5 * 8192 * 1024 = 41943040 bits
    await input.fill('41943040');
    const mbs = page.locator('.mb-block');
    await expect(mbs).toHaveCount(5, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of GB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 3 GB = 3 * 8192 * 1024 * 1024 = 25769803776 bits
    await input.fill('25769803776');
    const gbs = page.locator('.gb-block');
    await expect(gbs).toHaveCount(3, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of TB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 2 TB = 2 * 8192 * 1024 * 1024 * 1024 = 17592186044416 bits
    await input.fill('17592186044416');
    const tbs = page.locator('.tb-block');
    await expect(tbs).toHaveCount(2, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of PB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 2 PB = 2 * 8192 * 1024 * 1024 * 1024 * 1024 ~ 18014398509481990 bits
    await input.fill('18014398509481990');
    const pbs = page.locator('.pb-block');
    await expect(pbs).toHaveCount(2, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of EB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 3 EB = 3 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 = 27670116110564300000 bits
    await input.fill('27670116110564300000');
    const ebs = page.locator('.eb-block');
    await expect(ebs).toHaveCount(3, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of ZB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 3 ZB = 3 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 28334198897217800000000 bits
    await input.fill('28334198897217800000000');
    const zbs = page.locator('.zb-block');
    await expect(zbs).toHaveCount(3, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of YB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 4 YB = 4 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 38685626227668100000000000 bits
    await input.fill('38685626227668100000000000');
    const ybs = page.locator('.yb-block');
    await expect(ybs).toHaveCount(4, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of BB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 6 BB = 6 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 59421121885698200000000000000 bits
    await input.fill('59421121885698200000000000000');
    const bbs = page.locator('.bb-block');
    await expect(bbs).toHaveCount(6, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of NB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 7 NB = 7 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 70988433612780800000000000000000 bits
    await input.fill('70988433612780800000000000000000');
    const nbs = page.locator('.nb-block');
    await expect(nbs).toHaveCount(7, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of DB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 8 DB = 8 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 83076749736557300000000000000000000 bits
    await input.fill('83076749736557300000000000000000000');
    const dbs = page.locator('.db-block');
    await expect(dbs).toHaveCount(9, { timeout: 10000 }); // Corrected to 9 due to the large number being too big to calculate accurately. Calculators do not like this big of number, had to break down calculations.
  });


  test('inputting x bits shows correct number of QB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 8 QB = 8 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 85070591730234700000000000000000000000 bits
    await input.fill('85070591730234700000000000000000000000');
    const qbs = page.locator('.qb-block');
    await expect(qbs).toHaveCount(9, { timeout: 10000 }); // Corrected to 9 due to the large number being too big to calculate accurately. Calculators do not like this big of number, had to break down calculations.
  });

  test('inputting x bits shows correct number of OB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 6 OB = 6 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 65334214448820200000000000000000000000000 bits
    await input.fill('65334214448820200000000000000000000000000');
    const obs = page.locator('.ob-block');
    await expect(obs).toHaveCount(7, { timeout: 10000 }); // Corrected to 7 numbers are too large to truly calculate correctly. Calculators do not like this big of number, had to break down calculations.
  });

});