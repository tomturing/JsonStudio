import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { parseJsonl } from '../src/lib/services/jsonlParser.js';

const JSONL_DOCUMENT = [
  '{"id":1,"name":"Alice","active":true}',
  '',
  '{"id":2,"name":"Bob","active":false}',
  '{"id":}',
].join('\n');

const PAGINATED_JSONL_DOCUMENT = Array.from({ length: 25 }, (_, index) => JSON.stringify({
  id: index + 1,
  event: `event-${index + 1}`,
})).join('\n');

const LONG_JSONL_DOCUMENT = JSON.stringify({
  id: 1,
  timestamp: '2026-08-01T14:38:37.732Z',
  type: 'session_meta',
  payload: {
    text: 'This payload is deliberately long so the collapsed row must show a shortened JSON preview instead of the complete record.',
    nested: { one: true, two: true, three: ['a', 'b', 'c'] },
  },
});

async function installJsonlHarness(page, content = JSONL_DOCUMENT, language = 'en') {
  const useIndexedDb = content.length > 4 * 1024 * 1024;
  await page.addInitScript(({ tabStateKey, settingsKey, content, language }) => {
    localStorage.setItem(tabStateKey, JSON.stringify({
      tabs: [{
        id: 'jsonl-test-tab',
        filePath: '/tmp/events.jsonl',
        fileName: 'events.jsonl',
        content,
        isModified: false,
        stats: {
          valid: false,
          key_count: 0,
          depth: 0,
          byte_size: content.length,
          format_type: '',
          error_info: null,
        },
        isPinned: false,
        contentVersion: 1,
      }],
      activeTabId: 'jsonl-test-tab',
    }));
    localStorage.setItem(settingsKey, JSON.stringify({
      language,
      showTreeView: true,
      showFolderView: false,
      autoSave: false,
      isDarkMode: false,
    }));

    let callbackId = 0;
    const callbacks = new Map();
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' },
      },
      plugins: {
        path: { sep: '/', delimiter: ':' },
      },
      transformCallback(callback) {
        const id = ++callbackId;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id) {
        callbacks.delete(id);
      },
      runCallback(id, payload) {
        callbacks.get(id)?.(payload);
      },
      convertFileSrc(path) {
        return path;
      },
      async invoke(command) {
        if (command === 'get_pending_files') return [];
        if (command === 'plugin:event|listen') return ++callbackId;
        return null;
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener() {},
    };
  }, {
    tabStateKey: 'jsonstudio_tabs_state',
    settingsKey: 'app-settings',
    content: useIndexedDb ? '' : content,
    language,
  });

  if (useIndexedDb) {
    await page.goto('/');
    await page.evaluate(async ({ tabId, content }) => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('jsonstudio_documents', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('documents');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('documents', 'readwrite');
          transaction.objectStore('documents').put(content, tabId);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }, { tabId: 'jsonl-test-tab', content });
  }
}

async function chooseJsonlOption(view, label, option) {
  await view.getByRole('button', { name: label, exact: true }).click();
  await view.getByRole('option', { name: option, exact: true }).click();
}

test('renders compact JSONL record numbers and invalid rows', async ({ page }) => {
  await installJsonlHarness(page);
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  await expect(view).toBeVisible();
  await expect(page.getByTestId('editor-jsonl-record-count')).toContainText('3 records');
  await expect(page.getByTestId('editor-line-count')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fold', exact: true })).toBeDisabled();
  await expect(page.locator('body')).toContainText('2 valid');
  await expect(page.locator('body')).toContainText('1 errors');
  await expect(page.locator('body')).toContainText('1 empty');
  await expect(view.locator('.jsonl-item')).toHaveCount(3);
  await expect(view.locator('.jsonl-item').nth(1).locator('.jsonl-line-label')).toHaveText('2');
  const invalidRow = view.locator('.jsonl-item').filter({ hasText: 'Invalid JSON' });
  await invalidRow.locator('.jsonl-row-toggle').click();
  await expect(invalidRow).toContainText('Unexpected');
  await expect(invalidRow).toContainText('Col');
});

test('searches, filters, expands, and switches JSONL source view', async ({ page }) => {
  await installJsonlHarness(page);
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  await expect(view).toBeVisible();

  const search = view.getByRole('textbox', { name: 'Search rows or fields...' });
  await search.fill('Bob');
  await expect(view.locator('.jsonl-item')).toHaveCount(1);
  await expect(view.locator('.jsonl-item')).toContainText('Bob');

  await search.fill('');
  await chooseJsonlOption(view, 'Field', 'name');
  await view.getByLabel('Field value').fill('Alice');
  await expect(view.locator('.jsonl-item')).toHaveCount(1);
  await expect(view.locator('.jsonl-item')).toContainText('Alice');
  await chooseJsonlOption(view, 'Field', 'Choose a field');
  await expect(view.getByLabel('Field value')).toHaveValue('');
  await chooseJsonlOption(view, 'Field', 'name');
  await view.getByLabel('Field value').fill('Alice');
  await chooseJsonlOption(view, 'Field operator', 'contains');
  await view.getByLabel('Field value').fill('li');
  await expect(view.locator('.jsonl-item')).toHaveCount(1);
  await chooseJsonlOption(view, 'Field', 'active');
  await chooseJsonlOption(view, 'Field operator', '!=');
  await view.getByLabel('Field value').fill('true');
  await expect(view.locator('.jsonl-item')).toHaveCount(1);
  await expect(view.locator('.jsonl-item')).toContainText('Bob');
  await chooseJsonlOption(view, 'Field', 'name');
  await chooseJsonlOption(view, 'Field operator', 'not contains');
  await view.getByLabel('Field value').fill('li');
  await expect(view.locator('.jsonl-item')).toHaveCount(1);
  await expect(view.locator('.jsonl-item')).toContainText('Bob');
  await view.getByLabel('Clear field filter').click();
  await expect(view.locator('.jsonl-item')).toHaveCount(3);

  await view.locator('.jsonl-filter-group button').nth(2).click();
  await expect(view.locator('.jsonl-item')).toHaveCount(1);
  await expect(view.locator('.jsonl-item')).toContainText('Invalid JSON');

  await view.locator('.jsonl-filter-group button').first().click();
  const aliceRow = view.locator('.jsonl-item').filter({ hasText: 'Alice' });
  await aliceRow.locator('.jsonl-row-toggle').click();
  await expect(aliceRow.locator('.jsonl-json-key').first()).toHaveText('"id"');
  await expect(aliceRow.locator('.jsonl-json-number').first()).toHaveText('1');

  await view.getByRole('button', { name: 'View source' }).click();
  await expect(page.locator('.jsonl-source-bar')).toContainText('Editing JSONL source');
  await expect(page.locator('[data-testid="json-editor"]')).toBeVisible();
  await page.getByRole('button', { name: 'Back to data view' }).click();
  await expect(page.getByTestId('jsonl-view')).toBeVisible();
});

test('keeps JSONL source one-record-per-line when Monaco paste fires', async ({ page }) => {
  await installJsonlHarness(page, '{"id":1,"name":"Alice"}');
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  await expect(view).toBeVisible();
  await view.getByRole('button', { name: 'View source' }).click();

  const editorSurface = page.locator('[data-testid="json-editor"] .view-lines');
  await expect(editorSurface).toBeVisible();
  await editorSurface.click();
  await page.evaluate(() => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', '{"ignored":true}');
    document.activeElement?.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
  });

  await expect(page.getByTestId('editor-line-count')).toContainText('1 lines');
  await expect(page.getByTestId('editor-jsonl-record-count')).toHaveCount(0);
});

test('paginates JSONL records at ten rows and jumps from the bottom controls', async ({ page }) => {
  await installJsonlHarness(page, PAGINATED_JSONL_DOCUMENT);
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  const pagination = view.getByTestId('jsonl-pagination');
  await chooseJsonlOption(view, 'Field', 'event');
  const fieldSelect = view.getByRole('button', { name: 'Field', exact: true });
  const operatorSelect = view.getByRole('button', { name: 'Field operator', exact: true });
  const [fieldSelectBox, fieldArrowBox, operatorSelectBox, operatorArrowBox] = await Promise.all([
    fieldSelect.boundingBox(),
    fieldSelect.locator('svg').boundingBox(),
    operatorSelect.boundingBox(),
    operatorSelect.locator('svg').boundingBox(),
  ]);
  expect(fieldSelectBox).not.toBeNull();
  expect(fieldArrowBox).not.toBeNull();
  expect(operatorSelectBox).not.toBeNull();
  expect(operatorArrowBox).not.toBeNull();
  if (fieldSelectBox && fieldArrowBox && operatorSelectBox && operatorArrowBox) {
    expect(fieldArrowBox.x + fieldArrowBox.width).toBeGreaterThanOrEqual(fieldSelectBox.x + fieldSelectBox.width - 12);
    expect(operatorArrowBox.x + operatorArrowBox.width).toBeGreaterThanOrEqual(
      operatorSelectBox.x + operatorSelectBox.width - 12,
    );
  }
  await view.getByLabel('Clear field filter').click();
  const paginationIsAfterList = await view.evaluate((root) => {
    const list = root.querySelector('[data-testid="jsonl-record-list"]');
    const pageBar = root.querySelector('[data-testid="jsonl-pagination"]');
    return Boolean(list && pageBar && (list.compareDocumentPosition(pageBar) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(paginationIsAfterList).toBe(true);
  await expect(pagination.locator('.jsonl-page-current-prefix')).toHaveCount(0);
  await expect(pagination.locator('.jsonl-page-current-suffix')).toHaveText('Page');
  await expect(pagination.locator('.jsonl-page-separator')).toHaveText('/');
  await expect(pagination.getByLabel('Page number')).toHaveValue('1');
  await expect(pagination.getByTestId('jsonl-page-total')).toHaveText('3');
  const compactEnglishStatus = await pagination.locator('.jsonl-page-status').evaluate((element) => {
    const input = element.querySelector('input');
    const separator = element.querySelector('.jsonl-page-separator')?.textContent?.trim() ?? '';
    const total = element.querySelector('.jsonl-page-total')?.textContent?.trim() ?? '';
    const suffix = element.querySelector('.jsonl-page-current-suffix')?.textContent ?? '';
    return `${input?.value ?? ''} ${separator} ${total}${suffix}`;
  });
  expect(compactEnglishStatus).toBe('1 / 3 Page');
  await expect(view.locator('.jsonl-item')).toHaveCount(10);
  await expect(view.locator('.jsonl-item').first().locator('.jsonl-line-label')).toHaveText('1');
  await expect(view.locator('.jsonl-item').last().locator('.jsonl-line-label')).toHaveText('10');
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await expect(pagination.getByRole('button', { name: 'Next' })).toBeEnabled();
  await expect(pagination.getByRole('button', { name: 'Next' })).not.toHaveClass(/is-primary/);

  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(pagination.getByLabel('Page number')).toHaveValue('2');
  await expect(view.locator('.jsonl-item').first().locator('.jsonl-line-label')).toHaveText('11');

  await pagination.getByLabel('Page number').fill('3');
  await pagination.getByLabel('Page number').press('Enter');
  await expect(pagination.getByLabel('Page number')).toHaveValue('3');
  await expect(view.locator('.jsonl-item')).toHaveCount(5);
  await expect(view.locator('.jsonl-item').first().locator('.jsonl-line-label')).toHaveText('21');

  const pageSize = pagination.getByTestId('jsonl-page-size');
  await expect(pagination.locator('.jsonl-page-size-label')).toHaveCount(0);
  const [searchBox, fieldFilterBox, controlsBox, pageSizeControlBox] = await Promise.all([
    view.locator('.jsonl-search').boundingBox(),
    view.locator('.jsonl-field-filter').boundingBox(),
    view.locator('.jsonl-controls').boundingBox(),
    pageSize.boundingBox(),
  ]);
  expect(searchBox).not.toBeNull();
  expect(fieldFilterBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(pageSizeControlBox).not.toBeNull();
  if (searchBox && fieldFilterBox && controlsBox && pageSizeControlBox) {
    expect(searchBox.width).toBeLessThan(300);
    expect(fieldFilterBox.width).toBeLessThan(360);
    expect(fieldFilterBox.x).toBeGreaterThan(searchBox.x + searchBox.width + 80);
    expect(fieldFilterBox.x + fieldFilterBox.width).toBeGreaterThanOrEqual(
      controlsBox.x + controlsBox.width - 20,
    );
    expect(pageSizeControlBox.width).toBeLessThanOrEqual(56);
  }
  await expect(pageSize).toHaveText('10');
  await pageSize.click();
  const pageSizeMenu = pagination.getByRole('listbox', { name: 'Rows per page', exact: true });
  await expect(pageSizeMenu).toBeVisible();
  const [pageSizeBox, pageSizeMenuBox] = await Promise.all([
    pageSize.boundingBox(),
    pageSizeMenu.boundingBox(),
  ]);
  expect(pageSizeBox).not.toBeNull();
  expect(pageSizeMenuBox).not.toBeNull();
  if (pageSizeBox && pageSizeMenuBox) {
    expect(pageSizeMenuBox.y + pageSizeMenuBox.height).toBeLessThanOrEqual(pageSizeBox.y + 1);
  }
  await pageSizeMenu.getByRole('option', { name: '25 / page', exact: true }).click();
  await expect(pageSize).toHaveText('25');
  await expect(pagination.getByLabel('Page number')).toHaveValue('1');
  await expect(pagination.getByTestId('jsonl-page-total')).toHaveText('1');
  await expect(view.locator('.jsonl-item')).toHaveCount(25);

  await expect(view).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(view.locator('.jsonl-record-list')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(pagination).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('uses compact Chinese pagination labels', async ({ page }) => {
  await installJsonlHarness(page, PAGINATED_JSONL_DOCUMENT, 'zh');
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  const pagination = view.getByTestId('jsonl-pagination');
  const status = pagination.locator('.jsonl-page-status');

  await expect(status.locator('.jsonl-page-current-prefix')).toHaveCount(0);
  await expect(status.locator('.jsonl-page-current-suffix')).toHaveText('页');
  await expect(pagination.getByTestId('jsonl-page-total')).toHaveText('3');
  await expect(pagination.locator('.jsonl-page-size-label')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('jsonl.pageCurrentSuffix');

  const compactStatus = await status.evaluate((element) => {
    const input = element.querySelector('input');
    const separator = element.querySelector('.jsonl-page-separator')?.textContent?.trim() ?? '';
    const total = element.querySelector('.jsonl-page-total')?.textContent?.trim() ?? '';
    const suffix = element.querySelector('.jsonl-page-current-suffix')?.textContent?.trim() ?? '';
    return `${input?.value ?? ''} ${separator} ${total}${suffix}`;
  });
  expect(compactStatus).toBe('1 / 3页');
});

test('shows a shortened JSON preview and expands the complete record', async ({ page }) => {
  await installJsonlHarness(page, LONG_JSONL_DOCUMENT);
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  const row = view.locator('.jsonl-item').first();
  const preview = row.locator('.jsonl-preview');
  await expect(preview).toContainText('…');
  await expect(row.locator('.jsonl-detail')).toHaveCount(0);

  await row.locator('.jsonl-row-toggle').click();
  await expect(row.locator('.jsonl-detail')).toContainText('"timestamp"');
  await expect(row.locator('.jsonl-detail')).toContainText('2026-08-01T14:38:37.732Z');
  await expect(row.locator('.jsonl-detail')).toContainText('"nested"');
  await expect(row.locator('.jsonl-detail-heading')).toHaveCount(0);
  await expect(row.locator('.jsonl-detail')).not.toContainText('chars');
  await expect(row.locator('.jsonl-detail')).not.toContainText('Record 1');
  const tree = row.getByTestId('jsonl-json-tree');
  await expect(row.locator('.jsonl-json-viewer > .jsonl-json-toolbar')).toHaveCount(0);
  const toolbar = tree.locator('.jsonl-json-tree > .jsonl-json-toolbar');
  await expect(toolbar).toHaveCount(1);
  await expect(toolbar).toHaveCSS('border-top-width', '0px');
  await expect(toolbar).toHaveCSS('box-shadow', 'none');
  await expect(tree.locator('.jsonl-json-tree')).toHaveCSS('padding-top', '7px');
  const [treeBox, toolbarBox] = await Promise.all([
    tree.locator('.jsonl-json-tree').boundingBox(),
    toolbar.boundingBox(),
  ]);
  expect(treeBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  if (treeBox && toolbarBox) {
    expect(toolbarBox.y).toBeLessThanOrEqual(treeBox.y + 10);
    expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(treeBox.x + treeBox.width);
  }
  await expect(tree.locator('[data-path="$"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.locator('[data-path="$/payload"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.locator('[data-path="$/payload/nested"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(tree.locator('.jsonl-json-string')).toHaveCount(3);
  await tree.locator('[data-path="$/payload/nested"] .jsonl-json-toggle').click();
  await expect(tree.locator('[data-path="$/payload/nested"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(tree).toContainText('"one"');
  await tree.getByRole('button', { name: 'Collapse all' }).click();
  await expect(tree.locator('[data-path="$"]')).toHaveAttribute('aria-expanded', 'false');
  await tree.getByRole('button', { name: 'Expand all' }).click();
  await expect(tree).toContainText('"three"');
});

test('renders the supplied real rollout JSONL with pagination and expansion', async ({ page }) => {
  const realPath = process.env.JSONL_REAL_FILE;
  test.skip(!realPath, 'Set JSONL_REAL_FILE to run the real rollout JSONL validation.');

  const realContent = fs.readFileSync(realPath, 'utf8');
  const realDocument = parseJsonl(realContent);
  await installJsonlHarness(page, realContent);
  await page.goto('/');

  const view = page.getByTestId('jsonl-view');
  await expect(page.getByTestId('editor-jsonl-record-count')).toContainText(
    `${realDocument.summary.recordCount} records`,
  );
  await expect(view.getByLabel('Page number')).toHaveValue('1');
  await expect(view.getByTestId('jsonl-page-total')).toHaveText(
    String(Math.ceil(realDocument.summary.recordCount / 10)),
  );
  await expect(view.locator('.jsonl-item')).toHaveCount(10);
  await expect(view.locator('.jsonl-preview').first()).toContainText('timestamp');

  await chooseJsonlOption(view, 'Field', 'type');
  await view.getByLabel('Field value').fill('session_meta');
  const sessionMetaCount = realDocument.rows.filter(
    (row) => row.kind === 'valid' && row.value?.type === 'session_meta',
  ).length;
  await expect(view.locator('.jsonl-item')).toHaveCount(sessionMetaCount);
  await expect(view.locator('.jsonl-item').first()).toContainText('session_meta');

  await view.locator('.jsonl-row-toggle').first().click();
  await expect(view.locator('.jsonl-detail').first()).toContainText('"timestamp"');
  await expect(view.locator('.jsonl-detail').first()).toContainText('"type"');
});
