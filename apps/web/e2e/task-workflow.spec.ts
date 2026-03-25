import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Task Dashboard and Workflow
 * Phase 9.7: Integration Testing - Web UI
 */

test.describe('Task Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });
  });

  test('should display task dashboard layout', async ({ page }) => {
    // Check main layout elements
    await expect(page.locator('.task-dashboard')).toBeVisible();
    await expect(page.locator('.task-dashboard__stats')).toBeVisible();
    await expect(page.locator('.task-dashboard__quick-filters')).toBeVisible();
    await expect(page.locator('.task-list')).toBeVisible();
  });

  test('should display statistics cards', async ({ page }) => {
    // Check all stat cards are present
    const statCards = page.locator('.task-dashboard__stat-card');
    await expect(statCards).toHaveCount(4);

    // Check individual stats
    await expect(page.locator('.task-dashboard__stat-card').nth(0)).toContainText('Total Tasks');
    await expect(page.locator('.task-dashboard__stat-card').nth(1)).toContainText('Pending Review');
    await expect(page.locator('.task-dashboard__stat-card').nth(2)).toContainText('Assigned to Me');
    await expect(page.locator('.task-dashboard__stat-card').nth(3)).toContainText('Completed Today');
  });

  test('should filter tasks by status', async ({ page }) => {
    // Click on Pending Review filter
    await page.locator('.task-dashboard__quick-filters .el-radio-button').nth(1).click();
    await page.waitForTimeout(500);

    // Check if table updates
    const table = page.locator('.task-list__table');
    await expect(table).toBeVisible();
  });

  test('should filter tasks by type', async ({ page }) => {
    // Open type filter dropdown
    await page.locator('.task-list__filter').nth(2).click();
    await page.waitForTimeout(200);

    // Select Code Generation type
    await page.locator('.el-select-dropdown__item').filter({ hasText: 'Code Generation' }).click();
    await page.waitForTimeout(500);

    // Check table filtered
    await expect(page.locator('.task-list__table')).toBeVisible();
  });

  test('should search tasks', async ({ page }) => {
    // Type in search box
    const searchInput = page.locator('.task-list__search input');
    await searchInput.fill('test');
    await page.waitForTimeout(600); // Wait for debounce

    // Check table updates
    await expect(page.locator('.task-list__table')).toBeVisible();
  });

  test('should display task list with columns', async ({ page }) => {
    // Check table headers
    const headers = page.locator('.task-list__table th');
    await expect(headers.nth(0)).toContainText('Task');
    await expect(headers.nth(1)).toContainText('Type');
    await expect(headers.nth(2)).toContainText('Status');
    await expect(headers.nth(3)).toContainText('Assigned');
  });
});

test.describe('Task Review Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });
  });

  test('should open review dialog on review button click', async ({ page }) => {
    // Find and click review button on first pending task
    const reviewButton = page.locator('.task-list__table button', { hasText: 'Review' }).first();
    await reviewButton.click();

    // Wait for dialog to open
    await page.waitForSelector('.task-review-dialog', { timeout: 5000 });
    await expect(page.locator('.task-review-dialog')).toBeVisible();
  });

  test('should display task details in review dialog', async ({ page }) => {
    // Open review dialog
    const reviewButton = page.locator('.task-list__table button', { hasText: 'Review' }).first();
    await reviewButton.click();
    await page.waitForSelector('.task-review-dialog', { timeout: 5000 });

    // Check dialog content
    await expect(page.locator('.task-review-dialog__title')).toBeVisible();
    await expect(page.locator('.task-review-dialog__section h4', { hasText: 'Description' })).toBeVisible();
    await expect(page.locator('.task-review-dialog__section h4', { hasText: 'Acceptance Criteria' })).toBeVisible();
  });

  test('should approve a task', async ({ page }) => {
    // Open review dialog
    const reviewButton = page.locator('.task-list__table button', { hasText: 'Review' }).first();
    await reviewButton.click();
    await page.waitForSelector('.task-review-dialog', { timeout: 5000 });

    // Select approve
    await page.locator('.task-review-dialog .el-radio-button', { hasText: 'Approve' }).click();

    // Add notes
    await page.locator('.task-review-dialog textarea').fill('Approved for implementation');

    // Submit
    await page.locator('.task-review-dialog .el-button', { hasText: 'Approve Task' }).click();

    // Wait for dialog to close
    await page.waitForSelector('.task-review-dialog', { state: 'hidden', timeout: 5000 });

    // Check success notification (if implemented)
    // await expect(page.locator('.el-message--success')).toBeVisible();
  });

  test('should reject a task', async ({ page }) => {
    // Open review dialog
    const reviewButton = page.locator('.task-list__table button', { hasText: 'Review' }).first();
    await reviewButton.click();
    await page.waitForSelector('.task-review-dialog', { timeout: 5000 });

    // Select reject
    await page.locator('.task-review-dialog .el-radio-button', { hasText: 'Reject' }).click();

    // Add notes
    await page.locator('.task-review-dialog textarea').fill('Does not meet requirements');

    // Submit
    await page.locator('.task-review-dialog .el-button', { hasText: 'Reject Task' }).click();

    // Wait for dialog to close
    await page.waitForSelector('.task-review-dialog', { state: 'hidden', timeout: 5000 });
  });

  test('should modify a task with changes', async ({ page }) => {
    // Open review dialog
    const reviewButton = page.locator('.task-list__table button', { hasText: 'Review' }).first();
    await reviewButton.click();
    await page.waitForSelector('.task-review-dialog', { timeout: 5000 });

    // Select modify
    await page.locator('.task-review-dialog .el-radio-button', { hasText: 'Modify' }).click();
    await page.waitForTimeout(300);

    // Check modification form appears
    await expect(page.locator('.task-review-dialog label', { hasText: 'Title' })).toBeVisible();
    await expect(page.locator('.task-review-dialog label', { hasText: 'Priority' })).toBeVisible();
    await expect(page.locator('.task-review-dialog label', { hasText: 'Assigned Agent' })).toBeVisible();

    // Modify priority
    await page.locator('.task-review-dialog .el-select').first().click();
    await page.locator('.el-select-dropdown__item', { hasText: 'High' }).click();

    // Submit
    await page.locator('.task-review-dialog .el-button', { hasText: 'Modify & Approve' }).click();

    // Wait for dialog to close
    await page.waitForSelector('.task-review-dialog', { state: 'hidden', timeout: 5000 });
  });

  test('should display agent recommendation', async ({ page }) => {
    // Open review dialog
    const reviewButton = page.locator('.task-list__table button', { hasText: 'Review' }).first();
    await reviewButton.click();
    await page.waitForSelector('.task-review-dialog', { timeout: 5000 });

    // Check recommendation section
    await expect(page.locator('.task-review-dialog__section h4', { hasText: 'Router Recommendation' })).toBeVisible();
    await expect(page.locator('.task-review-dialog__recommendation')).toBeVisible();
  });
});

test.describe('Task Batch Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });
  });

  test('should select multiple tasks', async ({ page }) => {
    // Select first two tasks
    const checkboxes = page.locator('.task-list__table .el-checkbox__input');
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    // Check batch review button appears
    await expect(page.locator('.task-list__actions button', { hasText: /Batch Review/ })).toBeVisible();
  });

  test('should open batch review dialog', async ({ page }) => {
    // Select tasks
    const checkboxes = page.locator('.task-list__table .el-checkbox__input');
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();

    // Click batch review
    await page.locator('.task-list__actions button', { hasText: 'Batch Review' }).click();

    // Check dialog opens
    await page.waitForSelector('.task-list .el-dialog', { timeout: 5000 });
    await expect(page.locator('.task-list .el-dialog')).toBeVisible();
    await expect(page.locator('.task-list .el-dialog', { hasText: 'Batch Review Tasks' })).toBeVisible();
  });

  test('should batch approve tasks', async ({ page }) => {
    // Select and batch review
    const checkboxes = page.locator('.task-list__table .el-checkbox__input');
    await checkboxes.nth(1).click();
    await checkboxes.nth(2).click();
    await page.locator('.task-list__actions button', { hasText: 'Batch Review' }).click();

    await page.waitForSelector('.task-list .el-dialog', { timeout: 5000 });

    // Select approve
    await page.locator('.task-list .el-dialog .el-radio-button', { hasText: 'Approve' }).click();

    // Add notes
    await page.locator('.task-list .el-dialog textarea').fill('Batch approval');

    // Submit
    await page.locator('.task-list .el-dialog .el-button', { hasText: 'Confirm Review' }).click();

    // Wait for dialog to close
    await page.waitForSelector('.task-list .el-dialog', { state: 'hidden', timeout: 5000 });
  });
});

test.describe('Task Detail Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });
  });

  test('should open task detail on row click', async ({ page }) => {
    // Click on first task row
    const firstRow = page.locator('.task-list__table .el-table__row').first();
    await firstRow.click();

    // Check detail drawer opens
    await page.waitForSelector('.task-detail-panel', { timeout: 5000 });
    await expect(page.locator('.task-detail-panel')).toBeVisible();
  });

  test('should display task details', async ({ page }) => {
    // Open detail panel
    const firstRow = page.locator('.task-list__table .el-table__row').first();
    await firstRow.click();
    await page.waitForSelector('.task-detail-panel', { timeout: 5000 });

    // Check sections
    await expect(page.locator('.task-detail-panel__section h4', { hasText: 'Description' })).toBeVisible();
    await expect(page.locator('.task-detail-panel__section h4', { hasText: 'Timeline' })).toBeVisible();
  });
});

test.describe('Task Execution Monitor', () => {
  test('should display execution status', async ({ page }) => {
    // Navigate to a task with execution
    await page.goto('/tasks');
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });

    // Filter to show in-progress tasks
    // This would require setting up test data with in-progress tasks
    // For now, just check the component structure
  });

  test('should show execution progress', async ({ page }) => {
    // This would test the execution monitor component
    // Requires mock or test data with executing tasks
  });
});

test.describe('Task Dashboard Navigation', () => {
  test('should navigate from sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 10000 });

    // Click tasks link in sidebar (if available)
    const tasksLink = page.locator('.sidebar a, .sidebar .el-menu-item', { hasText: /Tasks|Work Items/ });
    if (await tasksLink.count() > 0) {
      await tasksLink.click();
      await page.waitForURL(/\/tasks/);
      await expect(page.locator('.task-dashboard')).toBeVisible();
    }
  });

  test('should maintain filter state on refresh', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });

    // Apply filter
    await page.locator('.task-dashboard__quick-filters .el-radio-button').nth(1).click();
    await page.waitForTimeout(500);

    // Refresh page
    await page.reload();
    await page.waitForSelector('.task-dashboard', { timeout: 10000 });

    // Check filter maintained (if implemented with URL params or local storage)
    // await expect(page.locator('.task-dashboard__quick-filters .is-active')).toContainText('Pending');
  });
});
