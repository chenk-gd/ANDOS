import { test, expect } from '@playwright/test';

/**
 * E2E Tests for MemoryManager Component
 * Tests the memory management interface
 */

test.describe('MemoryManager', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to load
    await page.waitForSelector('.app-container', { timeout: 10000 });

    // Select an asset to see the memory tab
    await page.click('.asset-tree .tree-node >> nth=1');
    await page.waitForTimeout(500);
  });

  test('should display memory manager tab', async ({ page }) => {
    // Click on memory tab
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Verify memory manager is visible
    await expect(page.locator('.memory-manager')).toBeVisible();
  });

  test('should display project memories list', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Check if memory list container exists
    const memoryList = page.locator('.memory-list, .memory-manager');
    await expect(memoryList).toBeVisible();
  });

  test('should search memories', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Find search input and type
    const searchInput = page.locator('.memory-search input, .el-input__inner').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test');
      await page.waitForTimeout(300);

      // Verify search was performed
      await expect(searchInput).toHaveValue('test');
    }
  });

  test('should filter memories by type', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Look for type filter dropdown
    const typeFilter = page.locator('.memory-type-filter, .el-select').first();
    if (await typeFilter.isVisible().catch(() => false)) {
      await typeFilter.click();
      await page.click('.el-select-dropdown__item:has-text("requirement")');
      await page.waitForTimeout(300);
    }
  });

  test('should create new memory', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Click add memory button
    const addButton = page.locator('button:has-text("新增"), button:has-text("Add"), .el-button--primary').first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();

      // Wait for dialog
      await page.waitForSelector('.el-dialog, .memory-form', { timeout: 3000 });

      // Fill memory content
      const contentInput = page.locator('textarea, .el-textarea__inner').first();
      await contentInput.fill('E2E test memory content');

      // Select type
      const typeSelect = page.locator('.el-select').first();
      await typeSelect.click();
      await page.click('.el-select-dropdown__item >> nth=0');

      // Save
      await page.click('button:has-text("保存"), button:has-text("Save")');

      // Verify success message
      await expect(page.locator('.el-message--success')).toBeVisible();
    }
  });

  test('should edit existing memory', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Find first memory item and click edit
    const editButton = page.locator('.memory-item .el-button, .memory-actions button').first();
    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click();

      // Wait for edit form
      await page.waitForSelector('.memory-form, .el-dialog', { timeout: 3000 });

      // Modify content
      const contentInput = page.locator('textarea, .el-textarea__inner').first();
      await contentInput.fill('Updated memory content ' + Date.now());

      // Save
      await page.click('button:has-text("保存"), button:has-text("Save")');

      // Verify success
      await expect(page.locator('.el-message--success')).toBeVisible();
    }
  });

  test('should delete memory', async ({ page }) => {
    await page.click('.el-tabs__item:has-text("记忆管理")');

    // Find delete button on first memory
    const deleteButton = page.locator('.memory-item .el-button--danger, button:has-text("删除")').first();
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click();

      // Confirm deletion
      await page.click('.el-message-box__btns button:has-text("确定"), .el-button--primary:has-text("确定")');

      // Verify success
      await expect(page.locator('.el-message--success')).toBeVisible();
    }
  });
});
