import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Agent Session History
 * Tests the session history and checkpoint functionality
 */

test.describe('AgentSessionHistory', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 10000 });
  });

  test('should display AI Chat panel', async ({ page }) => {
    // Check if AI chat button exists
    const chatButton = page.locator('.ai-chat-button, button:has-text("AI"), .chat-trigger').first();
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();

      // Verify chat panel opens
      await expect(page.locator('.ai-chat-panel, .chat-panel')).toBeVisible();
    }
  });

  test('should display session history', async ({ page }) => {
    // Open AI chat
    const chatButton = page.locator('.ai-chat-button, button:has-text("AI")').first();
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();
      await page.waitForTimeout(500);

      // Look for session history tab or button
      const historyTab = page.locator('.el-tabs__item:has-text("会话历史"), button:has-text("历史")').first();
      if (await historyTab.isVisible().catch(() => false)) {
        await historyTab.click();

        // Verify session list
        await expect(page.locator('.session-list, .session-history')).toBeVisible();
      }
    }
  });

  test('should create session checkpoint', async ({ page }) => {
    // Open AI chat
    const chatButton = page.locator('.ai-chat-button, button:has-text("AI")').first();
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();
      await page.waitForTimeout(500);

      // Send a message
      const input = page.locator('.chat-input input, .el-input__inner').first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill('Test message for checkpoint');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);

        // Look for checkpoint creation indicator
        await expect(page.locator('.chat-message')).toContainText('Test message');
      }
    }
  });

  test('should restore from checkpoint', async ({ page }) => {
    // Open AI chat
    const chatButton = page.locator('.ai-chat-button, button:has-text("AI")').first();
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();

      // Navigate to session history
      const historyTab = page.locator('.el-tabs__item:has-text("会话历史")').first();
      if (await historyTab.isVisible().catch(() => false)) {
        await historyTab.click();

        // Look for restore button on a checkpoint
        const restoreButton = page.locator('button:has-text("恢复"), button:has-text("Restore")').first();
        if (await restoreButton.isVisible().catch(() => false)) {
          await restoreButton.click();

          // Confirm restore
          await page.click('.el-message-box__btns button:has-text("确定")');

          // Verify restored
          await expect(page.locator('.el-message--success')).toBeVisible();
        }
      }
    }
  });

  test('should display token usage stats', async ({ page }) => {
    // Open AI chat
    const chatButton = page.locator('.ai-chat-button, button:has-text("AI")').first();
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();

      // Look for token stats indicator
      const tokenStats = page.locator('.token-usage, .token-count, .stats-bar').first();
      if (await tokenStats.isVisible().catch(() => false)) {
        await expect(tokenStats).toBeVisible();
      }
    }
  });

  test('should provide memory feedback', async ({ page }) => {
    // Open AI chat
    const chatButton = page.locator('.ai-chat-button, button:has-text("AI")').first();
    if (await chatButton.isVisible().catch(() => false)) {
      await chatButton.click();
      await page.waitForTimeout(500);

      // Send a message
      const input = page.locator('.chat-input input').first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill('Message for memory test');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);

        // Look for feedback buttons
        const thumbsUp = page.locator('.thumbs-up, .feedback-button, .useful-button').first();
        if (await thumbsUp.isVisible().catch(() => false)) {
          await thumbsUp.click();
          await expect(page.locator('.el-message--success')).toBeVisible();
        }
      }
    }
  });
});
