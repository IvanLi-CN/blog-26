import { expect, type Locator, type Page } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 闪念页面对象
 * 封装闪念页面的所有交互操作
 */
export class MemosPage extends BasePage {
  // 页面元素选择器
  private readonly selectors = {
    // 快速编辑器
    quickEditor: {
      container: '[data-testid="quick-memo-editor"]',
      textArea: '[data-testid="content-editor"] [contenteditable]',
      textAreaFallback: '.milkdown-editor [contenteditable]',
      textAreaGeneric: '[contenteditable="true"]',
      previewButton: 'button:has-text("预览")',
      attachmentButton: 'button:has-text("📎")',
      publicToggle: '[data-testid="public-toggle"]',
      clearButton: 'button:has-text("清空")',
      publishButton: 'button:has-text("发布")',
      publishButtonWithShortcut: 'button:has-text("发布 ⌘+↵")',
    },

    // 闪念列表
    memosList: {
      container: '[data-testid="memos-list"]',
      memoItem: '[data-testid="memo-item"]',
      memoContent: '.prose',
      memoTags: '.badge',
      memoAttachments: '[data-testid="attachment-grid"]',
      editButton: 'button[title="编辑"], button[title="正在加载..."]',
      deleteButton: 'button[title="删除"], button[title="删除中..."], button[title="正在加载..."]',
      publicBadge: '.badge:has-text("公开")',
      privateBadge: '.badge:has-text("私有")',
    },

    // 编辑抽屉
    editDrawer: {
      container: '.fixed.z-50:has(h3:has-text("编辑 Memo"))',
      textArea: '[data-testid="content-editor"] [contenteditable]',
      textAreaFallback: '.milkdown-editor [contenteditable]',
      textAreaGeneric: '[contenteditable="true"]',
      previewButton: 'button:has-text("预览")',
      attachmentButton: 'button:has-text("📎")',
      publicToggle: '[data-testid="public-toggle"]',
      saveButton: 'button:has-text("保存")',
      cancelButton: 'button:has-text("取消")',
    },

    // 通用元素
    loadingSpinner: '.loading-spinner',
    errorMessage: '.alert-error',
    successMessage: '.alert-success',
    confirmDialog: '.modal-open',
    confirmYes: 'button:has-text("确认")',
    confirmNo: 'button:has-text("取消")',
    attachmentGrid: '[data-testid="attachment-grid"]',
    attachmentItem: '[data-testid="attachment-item"]',
    errorDialog: '.modal.modal-open',
    errorDialogClose:
      '.modal.modal-open .btn:has-text("确定"), .modal.modal-open .btn:has-text("关闭"), .modal.modal-open .btn-circle',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 导航到闪念页面
   */
  async navigate() {
    await this.goto('/memos');
    await this.waitForVisible(this.selectors.quickEditor.container);
  }

  /**
   * 快速编辑器操作
   */
  async fillQuickEditor(content: string) {
    // 尝试多种选择器来找到编辑器
    let editor: any = null;
    const selectors = [
      this.selectors.quickEditor.textArea,
      this.selectors.quickEditor.textAreaFallback,
      this.selectors.quickEditor.textAreaGeneric,
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 5000 });
        editor = this.page.locator(selector).first();
        const isVisible = await editor.isVisible();
        if (isVisible) {
          console.log(`✅ 找到快速编辑器，使用选择器: ${selector}`);
          break;
        }
      } catch {
        console.log(`⚠️ 选择器 ${selector} 未找到快速编辑器`);
        continue;
      }
    }

    if (!editor) {
      throw new Error('无法找到快速编辑器元素');
    }

    // 等待编辑器可交互
    await editor.waitFor({ state: 'visible' });
    await this.page.waitForTimeout(500);

    // 清空并填充内容
    try {
      await editor.click();
    } catch (error) {
      console.warn('⚠️ 快速编辑器直接点击失败，尝试强制点击:', error);
      try {
        await editor.click({ force: true });
      } catch (forceError) {
        console.warn('⚠️ 强制点击失败，尝试 JavaScript 点击:', forceError);
        await editor.evaluate((el) => el.click());
      }
    }
    await this.page.waitForTimeout(200);

    try {
      await editor.fill(content);
    } catch {
      // 如果 fill 失败，使用 type 方法
      await editor.press('Control+a');
      await this.page.waitForTimeout(100);
      await editor.type(content, { delay: 30 });
    }

    await this.page.waitForTimeout(300);
  }

  async togglePreview() {
    await this.page.click(this.selectors.quickEditor.previewButton);
  }

  async setPublicStatus(isPublic: boolean) {
    const toggle = this.page.locator(this.selectors.quickEditor.publicToggle);
    const isChecked = await toggle.isChecked();

    console.log(`🔍 设置公开状态: 当前=${isChecked}, 目标=${isPublic}`);

    if (isChecked !== isPublic) {
      await toggle.click();
      await this.page.waitForTimeout(500); // 等待状态更新

      // 验证状态是否正确更新
      const newStatus = await toggle.isChecked();
      console.log(`✅ 公开状态已更新: ${newStatus}`);

      if (newStatus !== isPublic) {
        console.warn(`⚠️ 公开状态更新失败: 期望=${isPublic}, 实际=${newStatus}`);
      }
    } else {
      console.log(`✅ 公开状态已是目标值: ${isPublic}`);
    }
  }

  async uploadAttachment(filePath: string) {
    console.log(`📎 开始上传附件: ${filePath}`);

    // 记录上传前的附件数量
    const beforeCount = await this.getAttachmentCount();
    console.log(`📊 上传前附件数量: ${beforeCount}`);

    // 点击附件按钮
    await this.page.click(this.selectors.quickEditor.attachmentButton);

    // 等待文件输入框出现并上传文件
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // 等待上传的网络请求
    try {
      console.log('📡 等待上传网络请求...');
      const responsePromise = this.page.waitForResponse(
        (response) => {
          const url = response.url();
          const status = response.status();
          console.log(`📡 上传响应: ${url} - ${status}`);
          return url.includes('/api/trpc/memos.uploadAttachment') && (status === 200 || status === 201);
        },
        { timeout: 30000 }
      );

      const response = await responsePromise;
      console.log(`✅ 上传请求完成: ${response.status()}`);
    } catch (error) {
      console.warn('⚠️ 上传网络请求超时，但继续检查结果:', error);
    }

    // 等待上传完成或失败
    try {
      // 等待上传成功（附件网格出现）或失败（错误对话框出现）
      await Promise.race([
        this.page.waitForSelector(this.selectors.attachmentGrid, { timeout: 15000 }),
        this.page.waitForSelector(this.selectors.errorDialog, { timeout: 15000 }),
      ]);

      // 如果出现错误对话框，关闭它
      const errorDialog = this.page.locator(this.selectors.errorDialog);
      if (await errorDialog.isVisible()) {
        console.warn('附件上传失败，关闭错误对话框');
        const closeButton = this.page.locator(this.selectors.errorDialogClose);
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
        // 等待对话框关闭
        await this.waitForHidden(this.selectors.errorDialog);
      }
    } catch (error) {
      console.warn('等待附件上传结果超时:', error);
    }

    // 等待加载状态结束
    await this.waitForHidden(this.selectors.loadingSpinner);

    // 等待一段时间让附件完全加载
    await this.page.waitForTimeout(2000);

    // 验证上传是否成功
    const afterCount = await this.getAttachmentCount();
    console.log(`📊 上传后附件数量: ${afterCount}`);

    if (afterCount <= beforeCount) {
      console.warn('⚠️ 附件数量未增加，上传可能失败');
    } else {
      console.log('✅ 附件上传成功');
    }
  }

  // 获取当前附件数量的辅助方法
  private async getAttachmentCount(): Promise<number> {
    try {
      const attachmentItems = await this.page.locator('[data-testid="attachment-item"]').count();
      return attachmentItems;
    } catch {
      return 0;
    }
  }

  async clearEditor() {
    await this.page.click(this.selectors.quickEditor.clearButton);
  }

  // 清除本地草稿
  async clearDrafts() {
    await this.page.evaluate(() => {
      localStorage.removeItem('memo-draft');
      localStorage.removeItem('memo-drawer-draft');
    });
    console.log('🗑️ 已清除本地草稿');
  }

  async publishMemo() {
    // 先检查是否有错误对话框，如果有则关闭
    const errorDialog = this.page.locator(this.selectors.errorDialog);
    if (await errorDialog.isVisible()) {
      console.warn('发布前发现错误对话框，尝试关闭');
      const closeButton = this.page.locator(this.selectors.errorDialogClose);
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await this.waitForHidden(this.selectors.errorDialog);
      }
    }

    // 确保没有草稿干扰
    await this.page.evaluate(() => {
      localStorage.removeItem('memo-draft');
    });

    // 等待发布按钮可用
    await this.page.waitForSelector(this.selectors.quickEditor.publishButton + ':not([disabled])', { timeout: 10000 });

    // 记录发布前的闪念数量和状态
    const beforeCount = await this.getMemoCount();
    const publicToggle = this.page.locator(this.selectors.quickEditor.publicToggle);
    const isPublic = await publicToggle.isChecked();
    console.log(`📊 发布前闪念数量: ${beforeCount}`);
    console.log(`📊 发布前公开状态: ${isPublic}`);

    // 点击发布
    try {
      console.log('🚀 开始发布闪念...');

      // 等待网络请求，但使用更宽松的条件
      const responsePromise = this.page.waitForResponse(
        (response) => {
          const url = response.url();
          const status = response.status();
          console.log(`📡 网络响应: ${url} - ${status}`);
          return url.includes('/api/trpc/memos.create') && (status === 200 || status === 201);
        },
        { timeout: 30000 } // 增加超时时间到30秒
      );

      await this.page.click(this.selectors.quickEditor.publishButton);

      const response = await responsePromise;
      console.log(`✅ 发布请求完成: ${response.status()}`);
    } catch (error) {
      console.warn('发布操作可能失败:', error);

      // 检查是否有错误对话框
      if (await errorDialog.isVisible()) {
        const closeButton = this.page.locator(this.selectors.errorDialogClose);
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await this.waitForHidden(this.selectors.errorDialog);
        }
      }

      // 即使网络请求失败，也尝试继续，因为可能是超时但实际成功了
      console.warn('⚠️ 网络请求超时，但继续检查结果');
    }

    // 等待发布完成的各种指示器
    try {
      await this.waitForHidden(this.selectors.loadingSpinner, 5000);
    } catch {
      console.log('⚠️ 加载指示器未消失，但继续执行');
    }

    // 等待一段时间让 WebDAV 保存完成
    await this.page.waitForTimeout(2000);

    // 验证发布是否成功
    const afterCount = await this.getMemoCount();
    console.log(`📊 发布后闪念数量: ${afterCount}`);

    if (afterCount <= beforeCount) {
      console.warn('⚠️ 闪念数量未增加，可能需要刷新页面');
      // 尝试刷新页面
      await this.page.reload({ waitUntil: 'networkidle' });
      await this.page.waitForTimeout(2000);

      const finalCount = await this.getMemoCount();
      console.log(`📊 刷新后闪念数量: ${finalCount}`);
    }
  }

  async publishMemoWithShortcut() {
    // 先聚焦到编辑器
    const editor = this.page.locator(this.selectors.quickEditor.textArea);
    await editor.click();

    // 检测操作系统并使用正确的快捷键
    const userAgent = await this.page.evaluate(() => navigator.userAgent);
    const isMac = userAgent.includes('Mac');

    if (isMac) {
      await this.page.keyboard.press('Meta+Enter');
    } else {
      await this.page.keyboard.press('Control+Enter');
    }

    // 等待发布完成
    await this.waitForHidden(this.selectors.loadingSpinner);
  }

  /**
   * 闪念列表操作
   */
  async getMemoCount(): Promise<number> {
    const memos = this.page.locator(this.selectors.memosList.memoItem);
    return await memos.count();
  }

  async getMemoContent(index: number): Promise<string> {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);
    const content = memo.locator(this.selectors.memosList.memoContent);
    return (await content.textContent()) || '';
  }

  async getMemoTags(index: number): Promise<string[]> {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);
    const tags = memo.locator(this.selectors.memosList.memoTags);
    const tagTexts = await tags.allTextContents();
    return tagTexts.map((tag) => tag.replace('#', ''));
  }

  async isMemoPublic(index: number): Promise<boolean> {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);
    const publicBadge = memo.locator(this.selectors.memosList.publicBadge);
    return await publicBadge.isVisible();
  }

  async editMemo(index: number) {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);

    // 等待水合完成 - 等待编辑按钮的 title 变为 "编辑"
    console.log(`🔍 等待水合完成...`);
    const editButton = memo.locator('button[title="编辑"]');

    try {
      await editButton.waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ 水合完成，编辑按钮可用');
    } catch {
      // 如果等待失败，尝试使用备用选择器
      console.log('⚠️ 等待水合超时，尝试备用选择器...');
      const fallbackButton = memo
        .locator('button')
        .filter({ hasText: /编辑|正在加载/ })
        .first();
      await fallbackButton.waitFor({ state: 'visible', timeout: 5000 });
    }

    // 确保按钮可用
    await expect(editButton).toBeEnabled({ timeout: 5000 });

    console.log(`🔍 点击编辑按钮 (索引: ${index})`);

    // 使用更稳定的点击方法
    try {
      // 方法1: 直接点击
      await editButton.click();
    } catch (error) {
      console.warn('⚠️ 直接点击失败，尝试强制点击:', error);

      // 方法2: 强制点击（忽略拦截）
      try {
        await editButton.click({ force: true });
      } catch (forceError) {
        console.warn('⚠️ 强制点击失败，尝试 JavaScript 点击:', forceError);

        // 方法3: 使用 JavaScript 点击
        await editButton.evaluate((button) => button.click());
      }
    }

    // 等待编辑抽屉打开
    try {
      await this.waitForVisible(this.selectors.editDrawer.container, 10000);
      console.log('✅ 编辑抽屉已打开');
    } catch (error) {
      console.error('❌ 编辑抽屉打开失败:', error);
      // 检查页面状态
      const memoCount = await this.page.locator(this.selectors.memosList.memoItem).count();
      console.log(`   当前页面闪念数量: ${memoCount}`);
      throw error;
    }
  }

  async deleteMemo(index: number) {
    console.log(`🗑️ 开始删除第 ${index} 个闪念...`);

    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);
    const deleteButton = memo.locator(this.selectors.memosList.deleteButton);

    // 确保删除按钮可见
    await deleteButton.waitFor({ state: 'visible', timeout: 5000 });

    // 使用更稳定的点击方法
    try {
      await deleteButton.click();
      console.log('✅ 删除按钮点击成功');
    } catch (error) {
      console.warn('⚠️ 删除按钮直接点击失败，尝试强制点击:', error);
      try {
        await deleteButton.click({ force: true });
        console.log('✅ 强制点击删除按钮成功');
      } catch (forceError) {
        console.warn('⚠️ 强制点击失败，尝试 JavaScript 点击:', forceError);
        await deleteButton.evaluate((button: any) => {
          if (button && typeof button.click === 'function') {
            button.click();
          }
        });
        console.log('✅ JavaScript 点击删除按钮成功');
      }
    }

    // 等待确认对话框
    try {
      await this.waitForVisible(this.selectors.confirmDialog);
      console.log('✅ 确认对话框已出现');

      // 确认删除
      await this.page.click(this.selectors.confirmYes);
      console.log('✅ 确认删除操作');

      // 等待删除完成
      await this.waitForHidden(this.selectors.loadingSpinner);
      console.log('✅ 删除操作完成');
    } catch (dialogError) {
      console.warn('⚠️ 确认对话框处理失败:', dialogError);
      // 尝试其他确认按钮选择器
      try {
        const confirmButtons = [
          'button:has-text("确认")',
          'button:has-text("删除")',
          'button:has-text("是")',
          '.btn-error',
          '.btn-primary',
        ];

        for (const selector of confirmButtons) {
          try {
            const button = this.page.locator(selector);
            if (await button.isVisible()) {
              await button.click();
              console.log(`✅ 使用选择器 ${selector} 确认删除`);
              break;
            }
          } catch {
            continue;
          }
        }
      } catch (fallbackError) {
        console.warn('⚠️ 备用确认方法也失败:', fallbackError);
      }
    }
  }

  /**
   * 编辑抽屉操作
   */
  async fillEditDrawer(content: string) {
    // 尝试多种选择器来找到编辑器
    let editor: any = null;
    const selectors = [
      this.selectors.editDrawer.textArea,
      this.selectors.editDrawer.textAreaFallback,
      this.selectors.editDrawer.textAreaGeneric,
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 5000 });
        editor = this.page.locator(selector).first();
        const isVisible = await editor.isVisible();
        if (isVisible) {
          console.log(`✅ 找到编辑器，使用选择器: ${selector}`);
          break;
        }
      } catch {
        console.log(`⚠️ 选择器 ${selector} 未找到编辑器`);
        continue;
      }
    }

    if (!editor) {
      throw new Error('无法找到编辑器元素');
    }

    // 等待编辑器完全加载和可交互
    await this.page.waitForTimeout(1000);
    await editor.waitFor({ state: 'visible' });

    // 确保编辑器获得焦点
    try {
      await editor.click({ timeout: 5000 });
    } catch (error) {
      console.warn('⚠️ 编辑器直接点击失败，尝试强制点击:', error);
      try {
        await editor.click({ force: true, timeout: 5000 });
      } catch (forceError) {
        console.warn('⚠️ 强制点击失败，尝试 JavaScript 点击:', forceError);
        try {
          await editor.evaluate((el: any) => {
            if (el && typeof el.click === 'function') {
              el.click();
            } else if (el && typeof el.focus === 'function') {
              el.focus();
            }
          });
        } catch (jsError) {
          console.warn('⚠️ JavaScript 点击也失败，继续尝试输入:', jsError);
        }
      }
    }
    await this.page.waitForTimeout(500);

    // 使用更可靠的清空方法
    try {
      // 方法1: 使用键盘快捷键
      await editor.press('Control+a');
      await this.page.waitForTimeout(200);
      await editor.press('Delete');
      await this.page.waitForTimeout(300);
    } catch {
      console.log('⚠️ 键盘清空失败，尝试其他方法');

      // 方法2: 使用 fill 方法
      try {
        await editor.fill('');
        await this.page.waitForTimeout(300);
      } catch {
        console.log('⚠️ fill 方法失败，使用 type 方法');
      }
    }

    // 输入新内容
    await editor.type(content, { delay: 50 });
    await this.page.waitForTimeout(500);

    // 验证内容
    try {
      const finalContent = await editor.textContent();
      console.log(
        `🔍 编辑器内容验证: 期望包含 "${content.substring(0, 20)}...", 实际 "${finalContent?.substring(0, 50)}..."`
      );

      const expectedText = content.split(' - ')[0];
      const hasExpectedContent = finalContent?.includes(expectedText) || false;
      if (!hasExpectedContent) {
        console.warn(`⚠️ 编辑器内容可能未正确设置，但继续执行`);
      }
    } catch {
      console.warn('⚠️ 无法验证编辑器内容，但继续执行');
    }
  }

  async saveEdit() {
    const saveButton = this.page.locator(this.selectors.editDrawer.saveButton);

    // 确保保存按钮可用
    await expect(saveButton).toBeEnabled({ timeout: 5000 });

    // 点击保存按钮并等待网络请求
    console.log('🔍 点击保存按钮...');

    try {
      // 等待保存的网络请求
      const responsePromise = this.page.waitForResponse(
        (response) => {
          const url = response.url();
          const status = response.status();
          console.log(`📡 保存响应: ${url} - ${status}`);
          return url.includes('/api/trpc/memos.update') && (status === 200 || status === 201);
        },
        { timeout: 15000 } // 减少超时时间
      );

      // 使用更安全的点击方式
      try {
        await saveButton.click({ timeout: 5000 });
      } catch (clickError) {
        console.warn('⚠️ 保存按钮点击失败，尝试强制点击:', clickError);
        await saveButton.click({ force: true, timeout: 5000 });
      }

      const response = await responsePromise;
      console.log(`✅ 保存请求完成: ${response.status()}`);

      // 如果保存成功，直接返回，不等待抽屉关闭
      // 因为抽屉关闭可能会导致页面状态变化
      console.log('✅ 保存操作成功，跳过抽屉关闭等待');
      return;
    } catch (error) {
      console.warn('⚠️ 保存网络请求超时，但继续检查结果:', error);
      // 检查页面是否仍然可用
      try {
        await this.page.waitForTimeout(100);
      } catch (_pageError) {
        console.error('❌ 页面已关闭，保存操作失败');
        throw new Error('页面在保存过程中被关闭');
      }
    }

    // 等待保存操作完成（通过等待抽屉关闭）
    try {
      console.log('🔍 等待编辑抽屉关闭...');
      await this.waitForHidden(this.selectors.editDrawer.container, 20000); // 增加等待时间
      console.log('✅ 编辑抽屉已关闭');
    } catch {
      console.warn('❌ 编辑抽屉关闭超时，检查错误状态...');

      // 检查是否有错误对话框
      const errorDialog = this.page.locator('[role="dialog"]:has-text("失败"), .modal:has-text("失败")');
      if (await errorDialog.isVisible()) {
        const errorText = await errorDialog.textContent();
        console.log(`   发现错误对话框: "${errorText}"`);
        throw new Error(`保存失败: ${errorText}`);
      }

      // 检查抽屉是否仍然可见
      const drawerStillVisible = await this.page.locator(this.selectors.editDrawer.container).isVisible();
      console.log(`   抽屉仍然可见: ${drawerStillVisible}`);

      if (drawerStillVisible) {
        // 如果抽屉仍然可见，可能是保存操作仍在进行中
        console.log('   抽屉仍然可见，继续等待...');
        await this.page.waitForTimeout(5000); // 增加等待时间

        // 再次检查抽屉状态
        const finalDrawerVisible = await this.page.locator(this.selectors.editDrawer.container).isVisible();
        if (finalDrawerVisible) {
          console.log('   抽屉仍然可见，保存可能失败');
          throw new Error('保存操作超时，抽屉未关闭');
        }
      }

      console.log('✅ 抽屉最终已关闭');
    }

    // 等待一段时间让 WebDAV 保存完成
    await this.page.waitForTimeout(2000);
  }

  async cancelEdit() {
    console.log('🔍 开始取消编辑操作...');

    try {
      const cancelButton = this.page.locator(this.selectors.editDrawer.cancelButton);
      await cancelButton.waitFor({ state: 'visible', timeout: 5000 });

      console.log('✅ 找到取消按钮，点击取消');
      await cancelButton.click();

      // 等待抽屉关闭
      await this.waitForHidden(this.selectors.editDrawer.container);
      console.log('✅ 编辑抽屉已关闭');
    } catch (error) {
      console.warn('⚠️ 取消按钮点击失败，尝试其他方法:', error);

      // 尝试按 Escape 键
      try {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(1000);
        console.log('✅ 使用 Escape 键取消编辑');
      } catch (escapeError) {
        console.warn('⚠️ Escape 键也失败，强制关闭:', escapeError);
        // 如果都失败了，可能抽屉已经关闭了
      }
    }
  }

  /**
   * 验证方法
   */
  async verifyMemoExists(content: string): Promise<boolean> {
    const memoItems = this.page.locator(this.selectors.memosList.memoItem);
    const count = await memoItems.count();

    // 提取内容的前缀部分用于匹配（去掉时间戳和随机ID）
    const contentPrefix = content.split(' - ')[0];

    for (let i = 0; i < count; i++) {
      const memoContent = await this.getMemoContent(i);
      // 使用前缀匹配，更加健壮
      if (memoContent.includes(contentPrefix)) {
        return true;
      }
    }

    return false;
  }

  async verifyAttachmentExists(index: number, filename: string): Promise<boolean> {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);

    // 调试：输出闪念的完整内容
    const memoText = await memo.textContent();
    console.log(`🔍 检查闪念 ${index} 的附件，闪念内容: "${memoText?.substring(0, 200)}..."`);

    // 尝试多种选择器查找附件
    const attachmentSelectors = [
      '.attachment-grid',
      '[data-testid="attachment-grid"]',
      'img[alt*="' + filename + '"]',
      'img[src*="' + filename + '"]',
    ];

    for (const selector of attachmentSelectors) {
      const attachments = memo.locator(selector);
      const count = await attachments.count();
      console.log(`   选择器 "${selector}": 找到 ${count} 个元素`);

      if (count > 0) {
        const attachmentText = (await attachments.textContent()) || '';
        console.log(`   附件文本内容: "${attachmentText}"`);

        if (attachmentText.includes(filename)) {
          console.log(`   ✅ 在文本中找到文件名: ${filename}`);
          return true;
        }

        // 检查图片的 alt 或 src 属性
        for (let i = 0; i < count; i++) {
          const element = attachments.nth(i);
          const alt = await element.getAttribute('alt');
          const src = await element.getAttribute('src');
          console.log(`   图片 ${i}: alt="${alt}", src="${src}"`);

          if (alt?.includes(filename) || src?.includes(filename)) {
            console.log(`   ✅ 在图片属性中找到文件名: ${filename}`);
            return true;
          }
        }
      }
    }

    console.log(`   ❌ 未找到附件: ${filename}`);
    return false;
  }

  async waitForMemoToAppear(content: string, timeout = 45000) {
    // 先等待闪念列表容器出现
    await this.page.waitForSelector(this.selectors.memosList.container, { timeout: 5000 });

    // 增加调试信息
    console.log(`🔍 等待闪念出现，内容包含: "${content}"`);

    // 多次尝试等待闪念出现
    const maxRetries = 3;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        if (retry > 0) {
          console.log(`🔄 第 ${retry + 1} 次尝试等待闪念出现...`);
          // 刷新页面重新加载数据
          await this.page.reload({ waitUntil: 'networkidle' });
          await this.page.waitForTimeout(2000);
        }

        await this.page.waitForFunction(
          (searchContent) => {
            const memoItems = document.querySelectorAll('[data-testid="memo-item"]');
            console.log(`当前页面有 ${memoItems.length} 个闪念项`);

            for (const item of memoItems) {
              const itemText = item.textContent || '';
              console.log(`检查闪念内容: "${itemText.substring(0, 100)}..."`);
              if (itemText.includes(searchContent)) {
                console.log(`✅ 找到匹配的闪念`);
                return true;
              }
            }
            return false;
          },
          content,
          { timeout: timeout / maxRetries }
        );

        console.log(`✅ 闪念已出现在页面上`);
        return; // 成功找到，退出重试循环
      } catch (error) {
        if (retry === maxRetries - 1) {
          // 最后一次尝试失败，输出调试信息
          const memoItems = await this.page.locator('[data-testid="memo-item"]').all();
          console.log(`❌ 等待闪念超时，当前页面有 ${memoItems.length} 个闪念:`);

          for (let i = 0; i < Math.min(memoItems.length, 5); i++) {
            const itemText = await memoItems[i].textContent();
            console.log(`  ${i + 1}. "${itemText?.substring(0, 100)}..."`);
          }

          // 检查页面是否显示"还没有任何 Memo"
          const noMemoText = await this.page.textContent('body');
          if (noMemoText?.includes('还没有任何 Memo')) {
            console.log('📝 页面显示"还没有任何 Memo"，可能是发布失败或数据未同步');

            // 检查编辑器状态
            const editorContent = await this.page.textContent('[data-testid="content-editor"], .milkdown-editor');
            console.log(`📝 编辑器内容: "${editorContent?.substring(0, 100)}..."`);

            // 检查发布按钮状态
            const publishButton = this.page.locator(this.selectors.quickEditor.publishButton);
            const isEnabled = await publishButton.isEnabled();
            const buttonText = await publishButton.textContent();
            console.log(`📝 发布按钮状态: 启用=${isEnabled}, 文本="${buttonText}"`);
          }

          throw error;
        } else {
          console.log(`⚠️ 第 ${retry + 1} 次尝试失败，继续重试...`);
        }
      }
    }
  }

  /**
   * 拖拽上传文件
   */
  async dragAndDropFileToEditor(filePath: string) {
    // 拖拽到编辑器容器而不是内部的 contenteditable 元素
    // 因为拖拽事件处理器绑定在外层容器上
    const editorContainer = '[data-testid="content-input"]';

    console.log(`📎 开始拖拽文件到编辑器: ${filePath}`);

    // 确保编辑器容器可见
    await this.page.waitForSelector(editorContainer, { timeout: 5000 });

    await this.dragAndDropFile(editorContainer, filePath);

    // 等待上传完成
    await this.waitForHidden(this.selectors.loadingSpinner);

    // 等待附件网格出现
    try {
      await this.page.waitForSelector('[data-testid="attachment-grid"]', { timeout: 10000 });
      console.log('✅ 附件网格已出现');
    } catch {
      console.warn('⚠️ 附件网格未出现，可能上传失败');
    }
  }
}
