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
      textArea: '.milkdown-editor textarea, .milkdown-editor [contenteditable]',
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
      memoAttachments: '.attachment-grid',
      editButton: 'button:has-text("编辑")',
      deleteButton: 'button:has-text("删除")',
      publicBadge: '.badge:has-text("公开")',
      privateBadge: '.badge:has-text("私有")',
    },

    // 编辑抽屉
    editDrawer: {
      container: '.drawer-open',
      textArea: '.milkdown-editor textarea, .milkdown-editor [contenteditable]',
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
    await this.waitForVisible(this.selectors.quickEditor.textArea);
    await this.page.fill(this.selectors.quickEditor.textArea, content);
  }

  async togglePreview() {
    await this.page.click(this.selectors.quickEditor.previewButton);
  }

  async setPublicStatus(isPublic: boolean) {
    const toggle = this.page.locator(this.selectors.quickEditor.publicToggle);
    const isChecked = await toggle.isChecked();

    if (isChecked !== isPublic) {
      await toggle.click();
    }
  }

  async uploadAttachment(filePath: string) {
    // 点击附件按钮
    await this.page.click(this.selectors.quickEditor.attachmentButton);

    // 等待文件输入框出现并上传文件
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // 等待上传完成
    await this.waitForHidden(this.selectors.loadingSpinner);
  }

  async clearEditor() {
    await this.page.click(this.selectors.quickEditor.clearButton);
  }

  async publishMemo() {
    // 等待发布按钮可用
    await this.page.waitForSelector(this.selectors.quickEditor.publishButton + ':not([disabled])');

    // 点击发布
    await this.clickAndWaitForNetwork(this.selectors.quickEditor.publishButton, '/api/trpc/memos.create');

    // 等待发布完成
    await this.waitForHidden(this.selectors.loadingSpinner);
  }

  async publishMemoWithShortcut() {
    await this.page.keyboard.press('Meta+Enter'); // macOS
    // 或者 await this.page.keyboard.press('Control+Enter'); // Windows/Linux

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
    await memo.locator(this.selectors.memosList.editButton).click();

    // 等待编辑抽屉打开
    await this.waitForVisible(this.selectors.editDrawer.container);
  }

  async deleteMemo(index: number) {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);
    await memo.locator(this.selectors.memosList.deleteButton).click();

    // 等待确认对话框
    await this.waitForVisible(this.selectors.confirmDialog);

    // 确认删除
    await this.page.click(this.selectors.confirmYes);

    // 等待删除完成
    await this.waitForHidden(this.selectors.loadingSpinner);
  }

  /**
   * 编辑抽屉操作
   */
  async fillEditDrawer(content: string) {
    await this.waitForVisible(this.selectors.editDrawer.textArea);
    await this.page.fill(this.selectors.editDrawer.textArea, content);
  }

  async saveEdit() {
    await this.clickAndWaitForNetwork(this.selectors.editDrawer.saveButton, '/api/trpc/memos.update');
    await this.waitForHidden(this.selectors.editDrawer.container);
  }

  async cancelEdit() {
    await this.page.click(this.selectors.editDrawer.cancelButton);
    await this.waitForHidden(this.selectors.editDrawer.container);
  }

  /**
   * 验证方法
   */
  async verifyMemoExists(content: string): Promise<boolean> {
    const memoItems = this.page.locator(this.selectors.memosList.memoItem);
    const count = await memoItems.count();

    for (let i = 0; i < count; i++) {
      const memoContent = await this.getMemoContent(i);
      if (memoContent.includes(content)) {
        return true;
      }
    }

    return false;
  }

  async verifyAttachmentExists(index: number, filename: string): Promise<boolean> {
    const memo = this.page.locator(this.selectors.memosList.memoItem).nth(index);
    const attachments = memo.locator(this.selectors.memosList.memoAttachments);
    const attachmentText = (await attachments.textContent()) || '';
    return attachmentText.includes(filename);
  }

  async waitForMemoToAppear(content: string, timeout = 10000) {
    await this.page.waitForFunction(
      (searchContent) => {
        const memoItems = document.querySelectorAll('[data-testid="memo-item"]');
        for (const item of memoItems) {
          if (item.textContent?.includes(searchContent)) {
            return true;
          }
        }
        return false;
      },
      content,
      { timeout }
    );
  }

  /**
   * 拖拽上传文件
   */
  async dragAndDropFileToEditor(filePath: string) {
    await this.dragAndDropFile(this.selectors.quickEditor.textArea, filePath);

    // 等待上传完成
    await this.waitForHidden(this.selectors.loadingSpinner);
  }
}
