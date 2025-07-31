import { type Locator, type Page } from '@playwright/test';

/**
 * 页面对象基类
 * 提供通用的页面操作方法
 */
export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * 导航到指定URL
   */
  async goto(url: string) {
    await this.page.goto(url);
    await this.waitForPageLoad();
  }

  /**
   * 等待页面加载完成
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 等待元素可见
   */
  async waitForVisible(selector: string, timeout = 5000) {
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
  }

  /**
   * 等待元素隐藏
   */
  async waitForHidden(selector: string, timeout = 5000) {
    await this.page.waitForSelector(selector, { state: 'hidden', timeout });
  }

  /**
   * 点击元素并等待网络请求完成
   */
  async clickAndWaitForNetwork(selector: string, urlPattern?: string) {
    const responsePromise = urlPattern
      ? this.page.waitForResponse((response) => response.url().includes(urlPattern))
      : this.page.waitForResponse((response) => response.status() === 200);

    await this.page.click(selector);
    await responsePromise;
  }

  /**
   * 填写表单字段
   */
  async fillForm(fields: Record<string, string>) {
    for (const [selector, value] of Object.entries(fields)) {
      await this.page.fill(selector, value);
    }
  }

  /**
   * 上传文件
   */
  async uploadFile(selector: string, filePath: string) {
    await this.page.setInputFiles(selector, filePath);
  }

  /**
   * 获取元素文本
   */
  async getText(selector: string): Promise<string> {
    return (await this.page.textContent(selector)) || '';
  }

  /**
   * 检查元素是否存在
   */
  async isElementVisible(selector: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(selector, { state: 'visible', timeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 滚动到元素
   */
  async scrollToElement(selector: string) {
    await this.page.locator(selector).scrollIntoViewIfNeeded();
  }

  /**
   * 等待并点击元素
   */
  async waitAndClick(selector: string, timeout = 5000) {
    await this.waitForVisible(selector, timeout);
    await this.page.click(selector);
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * 获取当前URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * 截图
   */
  async screenshot(name: string) {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true,
    });
  }

  /**
   * 等待特定文本出现
   */
  async waitForText(text: string, timeout = 5000) {
    await this.page.waitForFunction((searchText) => document.body.textContent?.includes(searchText), text, { timeout });
  }

  /**
   * 模拟键盘快捷键
   */
  async pressShortcut(shortcut: string) {
    await this.page.keyboard.press(shortcut);
  }

  /**
   * 拖拽文件到元素
   */
  async dragAndDropFile(targetSelector: string, filePath: string) {
    // 创建文件输入元素
    await this.page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      input.id = 'drag-drop-file-input';
      document.body.appendChild(input);
    });

    // 设置文件
    await this.page.setInputFiles('#drag-drop-file-input', filePath);

    // 模拟拖拽事件
    await this.page.evaluate((selector) => {
      const input = document.getElementById('drag-drop-file-input') as HTMLInputElement;
      const target = document.querySelector(selector);

      if (input && target && input.files) {
        const file = input.files[0];
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const dropEvent = new DragEvent('drop', {
          dataTransfer,
          bubbles: true,
          cancelable: true,
        });

        target.dispatchEvent(dropEvent);
      }
    }, targetSelector);

    // 清理临时元素
    await this.page.evaluate(() => {
      const input = document.getElementById('drag-drop-file-input');
      if (input) {
        input.remove();
      }
    });
  }
}
