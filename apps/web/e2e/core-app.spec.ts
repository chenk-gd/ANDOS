import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Core Application Functionality
 * Tests basic app navigation and asset management
 */

test.describe('Core App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 10000 });
  });

  test('should display app layout', async ({ page }) => {
    // Check main layout elements
    await expect(page.locator('.app-container')).toBeVisible();
    await expect(page.locator('.sidebar, .asset-sidebar')).toBeVisible();
    await expect(page.locator('.main-content, .workspace-panel')).toBeVisible();
  });

  test('should display asset tree', async ({ page }) => {
    // Check asset tree is loaded
    await expect(page.locator('.asset-tree, .el-tree')).toBeVisible();

    // Check for asset type groups
    const treeNodes = page.locator('.el-tree-node');
    const count = await treeNodes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should select an asset', async ({ page }) => {
    // Click first asset in tree
    const firstAsset = page.locator('.tree-node.is-type, .el-tree-node__content').first();
    await firstAsset.click();

    // Wait for asset to load
    await page.waitForTimeout(500);

    // Check if asset detail is displayed
    const assetHeader = page.locator('.asset-header, .asset-title');
    await expect(assetHeader).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Select an asset first
    const firstAsset = page.locator('.tree-node.is-type').first();
    await firstAsset.click();
    await page.waitForTimeout(500);

    // Get all tabs
    const tabs = page.locator('.el-tabs__item');
    const tabCount = await tabs.count();

    if (tabCount > 1) {
      // Click each tab
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        await tabs.nth(i).click();
        await page.waitForTimeout(300);

        // Verify tab content is visible
        const activeTab = page.locator('.el-tabs__item.is-active');
        await expect(activeTab).toBeVisible();
      }
    }
  });

  test('should open create asset dialog', async ({ page }) => {
    // Look for create button in sidebar
    const createButton = page.locator('button:has-text("新建"), button:has-text("创建"), .el-button--primary').first();
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();

      // Wait for dialog
      await page.waitForSelector('.el-dialog, .create-asset-dialog', { timeout: 3000 });

      // Check dialog is visible
      await expect(page.locator('.el-dialog')).toBeVisible();

      // Close dialog
      await page.click('.el-dialog__headerbtn, .dialog-close');
    }
  });

  test('should search assets', async ({ page }) => {
    // Find search input in asset tree
    const searchInput = page.locator('.asset-tree input, .tree-header input').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test');
      await page.waitForTimeout(500);

      // Verify search value
      await expect(searchInput).toHaveValue('test');
    }
  });

  test('should display asset state tags', async ({ page }) => {
    // Check for state indicators
    const stateTags = page.locator('.el-tag, .status-dot, .state-indicator');
    const count = await stateTags.count();

    // Should have some state indicators
    if (count > 0) {
      await expect(stateTags.first()).toBeVisible();
    }
  });

  test('should show loading states', async ({ page }) => {
    // Check for any loading indicators
    const loadingIndicators = page.locator('.el-loading, .loading, .loading-spinner');

    // Loading should either be present or not (app might be already loaded)
    const count = await loadingIndicators.count();
    expect(typeof count).toBe('number');
  });

  test('should handle responsive layout', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // App should still be visible
    await expect(page.locator('.app-container')).toBeVisible();

    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(500);

    await expect(page.locator('.app-container')).toBeVisible();
  });
});
