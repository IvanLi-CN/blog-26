/**
 * 客户端脚本：处理代码块的折叠/展开交互
 *
 * 此脚本为文章详情页中由 rehypeCollapsibleCode 插件生成的
 * 可折叠代码块提供客户端交互功能。
 *
 * 功能特性：
 * - 自动检测页面中的可折叠代码容器
 * - 处理展开/收起按钮的点击事件
 * - 动态切换按钮文字和图标状态
 * - 在收起时自动滚动到代码块顶部
 *
 * @author Ivan Li
 * @version 1.0.0
 */

/**
 * 初始化所有可折叠代码块的交互功能
 *
 * 此函数会查找页面中所有带有 .collapsible-code-container 类的元素，
 * 并为每个容器绑定展开/收起的交互事件。
 */
function initCollapsibleCode() {
  // 查找所有折叠代码容器
  const containers = document.querySelectorAll('.collapsible-code-container');

  containers.forEach((container) => {
    const button = container.querySelector('.collapsible-code-button') as HTMLButtonElement;
    const previewContainer = container.querySelector('pre') as HTMLElement;
    const fullContainer = container.querySelector('.collapsible-code-full') as HTMLElement;
    const toggleContainer = container.querySelector('.collapsible-code-toggle') as HTMLElement;

    if (!button || !previewContainer || !fullContainer || !toggleContainer) {
      return;
    }

    // 初始状态：显示预览，隐藏完整内容
    let isExpanded = false;

    button.addEventListener('click', () => {
      if (isExpanded) {
        // 收起：显示预览，隐藏完整内容
        previewContainer.style.display = 'block';
        fullContainer.classList.add('hidden');
        isExpanded = false;

        // 更新按钮
        updateButton(button, false, container);

        // 滚动到代码块顶部
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // 展开：隐藏预览，显示完整内容
        previewContainer.style.display = 'none';
        fullContainer.classList.remove('hidden');
        isExpanded = true;

        // 更新按钮
        updateButton(button, true, container);
      }
    });
  });
}

/**
 * 更新折叠/展开按钮的状态
 *
 * @param button - 要更新的按钮元素
 * @param isExpanded - 当前是否为展开状态
 * @param container - 代码容器元素，用于获取总行数信息
 */
function updateButton(button: HTMLButtonElement, isExpanded: boolean, container: Element) {
  const totalLines = container.getAttribute('data-total-lines') || '0';
  const svg = button.querySelector('svg');
  const textNode = button.childNodes[button.childNodes.length - 1];

  if (isExpanded) {
    // 展开状态：显示收起按钮
    button.setAttribute('data-action', 'collapse');
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = '收起';
    }
    if (svg) {
      const path = svg.querySelector('path');
      if (path) {
        path.setAttribute('d', 'M5 15l7-7 7 7'); // 向上箭头
      }
    }
  } else {
    // 折叠状态：显示展开按钮
    button.setAttribute('data-action', 'expand');
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.textContent = `展开全部 (${totalLines} 行)`;
    }
    if (svg) {
      const path = svg.querySelector('path');
      if (path) {
        path.setAttribute('d', 'M19 9l-7 7-7-7'); // 向下箭头
      }
    }
  }
}

// 当 DOM 加载完成时初始化
function init() {
  // 添加一个小延迟确保 DOM 完全渲染
  setTimeout(() => {
    initCollapsibleCode();
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 导出函数以便在其他地方使用
export { initCollapsibleCode };
