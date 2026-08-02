import { expect, test } from '@playwright/test';
import { installTauriEditorHarness } from './helpers/editorHarness.js';

const NESTED_JSON = `{
  "1": {
    "ChickenNuggets": {
      "0": {
        "IncomeCoins": 15
      },
      "1": {
        "IncomeCoins": 17
      },
      "2": {
        "IncomeCoins": 19
      }
    },
    "Categories": "SIDEDISH",
    "Type": "MEAL"
  },
  "2": {
    "value": 2
  }
}`;

test('folds a JSON object through its matching closing brace', async ({ page }) => {
  await installTauriEditorHarness(page, NESTED_JSON);
  await page.goto('/');

  const editor = page.getByTestId('json-editor');
  await expect(editor.locator('.view-lines')).toBeVisible();

  const lineTwo = page
    .locator('.margin-view-overlays > div')
    .filter({ has: page.locator('.line-numbers', { hasText: /^2$/ }) });
  await lineTwo.locator('.cldr').click();

  const viewLines = editor.locator('.view-lines');
  await expect(viewLines).toContainText('"1": {');
  await expect(viewLines).toContainText('"2": {');
  await expect(viewLines).not.toContainText('"ChickenNuggets": {');
  await expect(viewLines).not.toContainText('"IncomeCoins": 17');
});
