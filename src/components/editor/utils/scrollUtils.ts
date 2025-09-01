/**
 * 滚动定位工具
 *
 * 提供平滑滚动到文件位置的功能
 */

import { generateScrollDataAttribute } from "./pathUtils";

/**
 * 滚动选项接口
 */
interface ScrollOptions {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
  offset?: number;
}

/**
 * 默认滚动选项
 */
const DEFAULT_SCROLL_OPTIONS: ScrollOptions = {
  behavior: "smooth",
  block: "center",
  inline: "nearest",
  offset: 0,
};

/**
 * 滚动到指定文件位置
 * @param filePath 文件路径
 * @param options 滚动选项
 * @returns Promise<boolean> 是否成功滚动
 */
export async function scrollToFile(
  filePath: string,
  options: ScrollOptions = {}
): Promise<boolean> {
  const mergedOptions = { ...DEFAULT_SCROLL_OPTIONS, ...options };

  try {
    // 生成数据属性选择器
    const dataAttribute = generateScrollDataAttribute(filePath);
    const selector = `[data-file-path="${filePath}"], [data-scroll-id="${dataAttribute}"]`;

    // 查找目标元素
    const targetElement = document.querySelector(selector);

    if (!targetElement) {
      console.warn(`[ScrollUtils] 未找到目标元素: ${filePath}`);
      return false;
    }

    // 执行滚动
    await scrollToElement(targetElement as HTMLElement, mergedOptions);

    console.log(`[ScrollUtils] 成功滚动到文件: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[ScrollUtils] 滚动失败:`, error);
    return false;
  }
}

/**
 * 滚动到指定元素
 * @param element 目标元素
 * @param options 滚动选项
 * @returns Promise<void>
 */
export async function scrollToElement(
  element: HTMLElement,
  options: ScrollOptions = {}
): Promise<void> {
  const mergedOptions = { ...DEFAULT_SCROLL_OPTIONS, ...options };

  return new Promise((resolve) => {
    // 使用 requestAnimationFrame 确保 DOM 更新完成
    requestAnimationFrame(() => {
      try {
        // 应用偏移量
        if (mergedOptions.offset && mergedOptions.offset !== 0) {
          const elementRect = element.getBoundingClientRect();
          const offsetTop = elementRect.top + window.pageYOffset + mergedOptions.offset;

          window.scrollTo({
            top: offsetTop,
            behavior: mergedOptions.behavior,
          });
        } else {
          // 标准滚动
          element.scrollIntoView({
            behavior: mergedOptions.behavior,
            block: mergedOptions.block,
            inline: mergedOptions.inline,
          });
        }

        // 等待滚动动画完成
        setTimeout(resolve, mergedOptions.behavior === "smooth" ? 500 : 0);
      } catch (error) {
        console.error(`[ScrollUtils] 元素滚动失败:`, error);
        resolve();
      }
    });
  });
}

/**
 * 高亮显示目标元素（添加临时高亮效果）
 * @param filePath 文件路径
 * @param duration 高亮持续时间（毫秒）
 * @returns Promise<boolean> 是否成功高亮
 */
export async function highlightFile(filePath: string, duration: number = 2000): Promise<boolean> {
  try {
    const dataAttribute = generateScrollDataAttribute(filePath);
    const selector = `[data-file-path="${filePath}"], [data-scroll-id="${dataAttribute}"]`;
    const targetElement = document.querySelector(selector) as HTMLElement;

    if (!targetElement) {
      return false;
    }

    // 添加高亮类
    targetElement.classList.add("editor-highlight-flash");

    // 移除高亮类
    setTimeout(() => {
      targetElement.classList.remove("editor-highlight-flash");
    }, duration);

    return true;
  } catch (error) {
    console.error(`[ScrollUtils] 高亮失败:`, error);
    return false;
  }
}

/**
 * 滚动到文件并高亮显示
 * @param filePath 文件路径
 * @param scrollOptions 滚动选项
 * @param highlightDuration 高亮持续时间
 * @returns Promise<boolean> 是否成功
 */
export async function scrollToFileAndHighlight(
  filePath: string,
  scrollOptions: ScrollOptions = {},
  highlightDuration: number = 2000
): Promise<boolean> {
  try {
    // 先滚动到位置
    const scrollSuccess = await scrollToFile(filePath, scrollOptions);

    if (scrollSuccess) {
      // 延迟一点时间再高亮，确保滚动完成
      setTimeout(() => {
        highlightFile(filePath, highlightDuration);
      }, 100);
    }

    return scrollSuccess;
  } catch (error) {
    console.error(`[ScrollUtils] 滚动并高亮失败:`, error);
    return false;
  }
}

/**
 * 检查元素是否在视口中
 * @param element 目标元素
 * @returns 是否在视口中
 */
export function isElementInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * 检查文件是否在视口中
 * @param filePath 文件路径
 * @returns 是否在视口中
 */
export function isFileInViewport(filePath: string): boolean {
  try {
    const dataAttribute = generateScrollDataAttribute(filePath);
    const selector = `[data-file-path="${filePath}"], [data-scroll-id="${dataAttribute}"]`;
    const targetElement = document.querySelector(selector) as HTMLElement;

    if (!targetElement) {
      return false;
    }

    return isElementInViewport(targetElement);
  } catch (error) {
    console.error(`[ScrollUtils] 检查视口失败:`, error);
    return false;
  }
}

/**
 * 获取文件树容器元素
 * @returns 文件树容器元素或null
 */
export function getFileTreeContainer(): HTMLElement | null {
  return document.querySelector(".directory-tree-container") as HTMLElement;
}

/**
 * 在文件树容器内滚动到文件
 * @param filePath 文件路径
 * @param options 滚动选项
 * @returns Promise<boolean> 是否成功滚动
 */
export async function scrollToFileInTree(
  filePath: string,
  options: ScrollOptions = {}
): Promise<boolean> {
  try {
    const container = getFileTreeContainer();
    if (!container) {
      console.warn(`[ScrollUtils] 未找到文件树容器`);
      return scrollToFile(filePath, options);
    }

    const dataAttribute = generateScrollDataAttribute(filePath);
    const selector = `[data-file-path="${filePath}"], [data-scroll-id="${dataAttribute}"]`;
    const targetElement = container.querySelector(selector) as HTMLElement;

    if (!targetElement) {
      console.warn(`[ScrollUtils] 在文件树中未找到目标文件: ${filePath}`);
      // 尝试使用不同的路径格式进行查找
      const alternativeSelectors = [
        `[data-file-path="${filePath.replace(/^.*\//, "")}"]`, // 只使用文件名
        `[data-file-path*="${filePath.split("/").pop()}"]`, // 包含文件名的元素
      ];

      for (const altSelector of alternativeSelectors) {
        const altElement = container.querySelector(altSelector) as HTMLElement;
        if (altElement) {
          console.log(`[ScrollUtils] 使用替代选择器找到目标: ${altSelector}`);
          await scrollToElement(altElement, { ...DEFAULT_SCROLL_OPTIONS, ...options });
          return true;
        }
      }

      return false;
    }

    // 在容器内滚动
    const containerRect = container.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const scrollTop =
      targetRect.top - containerRect.top + container.scrollTop - containerRect.height / 2;

    container.scrollTo({
      top: scrollTop,
      behavior: options.behavior || "smooth",
    });

    // 等待滚动完成
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log(`[ScrollUtils] 在文件树中成功滚动到文件: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[ScrollUtils] 文件树滚动失败:`, error);
    return false;
  }
}

/**
 * 防抖滚动函数
 * @param filePath 文件路径
 * @param delay 防抖延迟（毫秒）
 * @param options 滚动选项
 * @returns 防抖后的滚动函数
 */
export function debounceScrollToFile(delay: number = 300, options: ScrollOptions = {}) {
  let timeoutId: NodeJS.Timeout | null = null;

  return (filePath: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      scrollToFileInTree(filePath, options);
    }, delay);
  };
}
