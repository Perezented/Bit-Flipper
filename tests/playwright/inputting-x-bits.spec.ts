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
    // 2 PB = 2 * 8192 * 1024 * 1024 * 1024 * 1024 = 140737488355328 bits
    await input.fill('140737488355328');
    const pbs = page.locator('.pb-block');
    await expect(pbs).toHaveCount(2, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of EB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 3 EB = 3 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 = 1267650600228229401496703205376 bits
    await input.fill('1267650600228229401496703205376');
    const ebs = page.locator('.eb-block');
    await expect(ebs).toHaveCount(3, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of ZB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 3 ZB = 3 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 1208925819614629174706176 bits
    await input.fill('1208925819614629174706176');
    const zbs = page.locator('.zb-block');
    await expect(zbs).toHaveCount(3, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of YB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 4 YB = 4 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 30442177285728761038084864 bits
    await input.fill('30442177285728761038084864');
    const ybs = page.locator('.yb-block');
    await expect(ybs).toHaveCount(4, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of BB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 6 BB = 6 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 36893488147419103232 bits
    await input.fill('36893488147419103232');
    const bbs = page.locator('.bb-block');
    await expect(bbs).toHaveCount(6, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of NB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 7 NB = 7 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 350168669028215526624401024 bits
    await input.fill('350168669028215526624401024');
    const nbs = page.locator('.nb-block');
    await expect(nbs).toHaveCount(7, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of DB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 8 DB = 8 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 2801349451792764210995528192 bits
    await input.fill('2801349451792764210995528192');
    const dbs = page.locator('.db-block');
    await expect(dbs).toHaveCount(8, { timeout: 10000 });
  });


  test('inputting x bits shows correct number of QB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 2 QB = 2 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 5602698903585528421991056384 bits
    await input.fill('5602698903585528421991056384');
    const qbs = page.locator('.qb-block');
    await expect(qbs).toHaveCount(2, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of OB groups', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 6 OB = 6 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 336161934215131705319463383008 bits
    await input.fill('336161934215131705319463383008');
    const obs = page.locator('.ob-block');
    await expect(obs).toHaveCount(6, { timeout: 10000 });
  });

  test('inputting x bits shows correct number of YB', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#mode', 'bitcount');
    const input = page.locator('#number-input');
    // 7 YB = 7 * 8192 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 * 1024 = 4706825079006843874492463760128 bits
    await input.fill('4706825079006843874492463760128');
    const ybs = page.locator('.yb-block');
    await expect(ybs).toHaveCount(7, { timeout: 10000 });
  });

});