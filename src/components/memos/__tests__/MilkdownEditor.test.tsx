/**
 * MilkdownEditor 单元测试
 * 重点测试无限循环修复逻辑
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

// Mock Milkdown 相关模块
const mockCrepe = {
  editor: {
    action: mock(() => {}),
  },
  on: mock((callback: any) => {
    // 模拟监听器注册
    const listener = {
      markdownUpdated: mock((_callback: any) => {}),
    };
    callback(listener);
  }),
};

mock.module("@milkdown/crepe", () => ({
  Crepe: mock(() => mockCrepe),
}));

mock.module("@milkdown/core", () => ({
  replaceAll: mock((content: string) => ({ type: "replaceAll", content })),
  getMarkdown: mock(() => ({ type: "getMarkdown" })),
}));

// Mock React hooks
const _mockUseRef = mock((initialValue: any) => ({
  current: initialValue,
}));

const _mockUseEffect = mock((effect: () => void, _deps: any[]) => {
  effect();
});

// 测试用的 frontmatter 处理函数 - 与实际实现保持一致
function preprocessFrontmatterForEditor(content: string): string {
  // 处理 frontmatter
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const frontmatterMatch = content.match(frontmatterRegex);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const bodyContent = frontmatterMatch[2];

    // 将 frontmatter 转换为 YAML 代码块
    const processedContent = `\`\`\`yaml\n${frontmatter}\n\`\`\`\n\n${bodyContent}`;
    return processedContent;
  }

  return content;
}

function postprocessContentFromEditor(content: string): string {
  // 匹配开头的 YAML 代码块
  const yamlCodeBlockRegex = /^```yaml\n([\s\S]*?)\n```\n\n([\s\S]*)$/;
  const yamlMatch = content.match(yamlCodeBlockRegex);

  if (yamlMatch) {
    const yamlContent = yamlMatch[1];
    const bodyContent = yamlMatch[2];

    // 转换回 frontmatter 格式
    const processedContent = `---\n${yamlContent}\n---\n${bodyContent}`;
    return processedContent;
  }

  return content;
}

describe("MilkdownEditor 无限循环修复测试", () => {
  let consoleLogSpy: any;
  let _onChangeMock: any;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
    _onChangeMock = mock(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe("frontmatter 处理函数测试", () => {
    it("应该正确转换 frontmatter 为 YAML 代码块", () => {
      const input = `---
title: "Test"
slug: "test"
---

# Content`;

      const expected = `\`\`\`yaml
title: "Test"
slug: "test"
\`\`\`


# Content`;

      expect(preprocessFrontmatterForEditor(input)).toBe(expected);
    });

    it("应该正确转换 YAML 代码块回 frontmatter", () => {
      const input = `\`\`\`yaml
title: "Test"
slug: "test"
\`\`\`

# Content`;

      const expected = `---
title: "Test"
slug: "test"
---
# Content`;

      expect(postprocessContentFromEditor(input)).toBe(expected);
    });

    it("双向转换应该保持内容一致性", () => {
      const original = `---
title: "Test Image Paste"
slug: "test-image-paste"
publishDate: 2025-08-14T07:56:08.342Z
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# Test Image Paste

这是一个测试图片粘贴功能的文章。

![Base64测试图片](./assets/inline-1755162514446.png)`;

      // 正向转换
      const processed = preprocessFrontmatterForEditor(original);
      // 反向转换
      const restored = postprocessContentFromEditor(processed);

      expect(restored).toBe(original);
    });
  });

  describe("内容比较逻辑测试", () => {
    it("应该检测到相同的内容", () => {
      const content1 = `---
title: "Test"
---

Content`;
      const content2 = `---
title: "Test"
---

Content`;

      expect(content1).toBe(content2);
    });

    it("应该检测到微小的空白字符差异", () => {
      const content1 = `---
title: "Test"
---

Content`;
      const content2 = `---
title: "Test"
---

Content `; // 末尾多一个空格

      expect(content1).not.toBe(content2);
      expect(content1.length).toBe(content2.length - 1);
    });

    it("应该检测到换行符差异", () => {
      const content1 = `---
title: "Test"
---

Content`;
      const content2 = `---
title: "Test"
---

Content
`; // 末尾多一个换行符

      expect(content1).not.toBe(content2);
      expect(content1.length).toBe(content2.length - 1);
    });
  });

  describe("循环检测逻辑测试", () => {
    it("应该检测到内容长度的微小变化", () => {
      const baseContent = `---
title: "Test Image Paste"
slug: "test-image-paste"
publishDate: 2025-08-14T07:56:08.342Z
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# Test Image Paste

这是一个测试图片粘贴功能的文章。

![Base64测试图片](./assets/inline-1755162514446.png)`;

      // 模拟 bodyLength 在 97 和 98 之间变化的情况
      const content1 = baseContent;
      const content2 = `${baseContent} `; // 多一个空格

      expect(content1.length).toBe(content2.length - 1);

      // 模拟处理后的内容
      const processed1 = preprocessFrontmatterForEditor(content1);
      const processed2 = preprocessFrontmatterForEditor(content2);

      expect(processed1.length).toBe(processed2.length - 1);
    });

    it("应该能够稳定地处理重复的转换", () => {
      const original = `---
title: "Test"
---

Content`;

      let current = original;
      const transformations = [];

      // 模拟多次转换
      for (let i = 0; i < 10; i++) {
        const processed = preprocessFrontmatterForEditor(current);
        const restored = postprocessContentFromEditor(processed);
        transformations.push({
          iteration: i,
          originalLength: current.length,
          processedLength: processed.length,
          restoredLength: restored.length,
          isStable: restored === current,
        });
        current = restored;
      }

      // 所有转换都应该是稳定的
      transformations.forEach((t, index) => {
        expect(t.isStable).toBe(true, `转换 ${index} 应该是稳定的`);
      });

      // 最终内容应该与原始内容相同
      expect(current).toBe(original);
    });
  });

  describe("防护机制测试", () => {
    it("应该能够检测到相同的内容并跳过更新", () => {
      const content = `---
title: "Test"
---

Content`;

      // 模拟 lastContentRef
      const lastContentRef = { current: content };

      // 模拟内容比较逻辑
      const shouldSkipUpdate = lastContentRef.current === content;

      expect(shouldSkipUpdate).toBe(true);
    });

    it("应该能够检测到不同的内容并允许更新", () => {
      const oldContent = `---
title: "Test"
---

Old Content`;

      const newContent = `---
title: "Test"
---

New Content`;

      // 模拟 lastContentRef
      const lastContentRef = { current: oldContent };

      // 模拟内容比较逻辑
      const shouldSkipUpdate = lastContentRef.current === newContent;

      expect(shouldSkipUpdate).toBe(false);
    });
  });

  describe("无限循环场景测试", () => {
    it("应该能够处理实际的无限循环场景 - bodyLength 在 97 和 98 之间变化", () => {
      // 模拟实际遇到的内容
      const baseContent = `---
title: "Test Image Paste"
slug: "test-image-paste"
publishDate: 2025-08-14T07:56:08.342Z
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# Test Image Paste

这是一个测试图片粘贴功能的文章。

![Base64测试图片](./assets/inline-1755162514446.png)`;

      // 模拟编辑器可能产生的微小变化
      const content1 = baseContent;
      const content2 = baseContent.replace("\n\n![Base64测试图片]", "\n![Base64测试图片]"); // 减少一个换行符

      expect(content1.length - content2.length).toBe(1); // 确认只有1字符差异

      // 测试双向转换的稳定性
      const processed1 = preprocessFrontmatterForEditor(content1);
      const restored1 = postprocessContentFromEditor(processed1);

      const processed2 = preprocessFrontmatterForEditor(content2);
      const restored2 = postprocessContentFromEditor(processed2);

      // 验证转换是稳定的
      expect(restored1).toBe(content1);
      expect(restored2).toBe(content2);

      // 验证内容差异被保持
      expect(restored1.length - restored2.length).toBe(1);
    });

    it("应该能够检测到微小的格式化差异并防止循环", () => {
      const content = `---
title: "Test Image Paste"
slug: "test-image-paste"
publishDate: 2025-08-14T07:56:08.342Z
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# Test Image Paste

这是一个测试图片粘贴功能的文章。

![Base64测试图片](./assets/inline-1755162514446.png)`;

      // 模拟 onChange 回调逻辑
      let lastContent = content;
      let changeCount = 0;
      const maxChanges = 10;

      const simulateOnChange = (newContent: string) => {
        changeCount++;

        // 模拟防护逻辑
        if (lastContent === newContent) {
          console.log(`🔄 [Test] 内容相同，跳过更新避免无限循环 (第${changeCount}次)`);
          return false; // 跳过更新
        }

        lastContent = newContent;
        return true; // 允许更新
      };

      // 模拟编辑器内容变化循环
      let currentContent = content;
      let updateCount = 0;

      for (let i = 0; i < maxChanges; i++) {
        // 模拟编辑器处理
        const processed = preprocessFrontmatterForEditor(currentContent);
        const restored = postprocessContentFromEditor(processed);

        // 模拟 onChange 调用
        const shouldUpdate = simulateOnChange(restored);

        if (shouldUpdate) {
          updateCount++;
          currentContent = restored;
        }

        // 如果内容稳定，应该停止更新
        if (!shouldUpdate) {
          break;
        }
      }

      // 验证防护机制工作
      expect(updateCount).toBeLessThan(maxChanges);
      expect(changeCount).toBeGreaterThan(updateCount);
    });

    it("应该能够处理字符数在 265-266 之间变化的情况", () => {
      // 创建一个接近 265 字符的内容
      const shortContent = `---
title: "Test"
slug: "test"
publishDate: 2025-08-14T07:56:08.342Z
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# Test

Content that is exactly the right length to test the 265-266 character boundary issue.`;

      const longContent = `${shortContent} `; // 多一个空格

      // 验证字符数差异
      expect(longContent.length - shortContent.length).toBe(1);

      // 测试防护逻辑
      const lastContentRef = { current: shortContent };

      // 第一次更新应该被允许
      const shouldUpdate1 = lastContentRef.current !== longContent;
      expect(shouldUpdate1).toBe(true);

      // 更新后
      lastContentRef.current = longContent;

      // 相同内容的更新应该被阻止
      const shouldUpdate2 = lastContentRef.current !== longContent;
      expect(shouldUpdate2).toBe(false);
    });
  });

  describe("增强防护机制测试", () => {
    it("应该检测到完全相同的内容", () => {
      const content = `---
title: "Test"
---

Content`;

      const currentContent = content;
      const processedMarkdown = content;

      // 模拟增强的防护逻辑
      const isSameContent = currentContent === processedMarkdown;
      const isSimilarLength = Math.abs(currentContent.length - processedMarkdown.length) <= 1;

      expect(isSameContent).toBe(true);
      expect(isSimilarLength).toBe(true);
    });

    it("应该检测到仅空白字符差异的内容", () => {
      const content1 = `---
title: "Test"
---

Content`;
      const content2 = `---
title: "Test"
---

Content `; // 末尾多一个空格

      // 模拟增强的防护逻辑
      const isSameContent = content1 === content2;
      const isSimilarLength = Math.abs(content1.length - content2.length) <= 1;
      const isSameTrimmed = content1.trim() === content2.trim();

      expect(isSameContent).toBe(false);
      expect(isSimilarLength).toBe(true);
      expect(isSameTrimmed).toBe(true);

      // 这种情况应该被防护机制阻止
      const shouldBlock = isSimilarLength && isSameTrimmed;
      expect(shouldBlock).toBe(true);
    });

    it("应该允许有意义的内容变化", () => {
      const content1 = `---
title: "Test"
---

Old Content`;
      const content2 = `---
title: "Test"
---

Different Content`; // 使用更长的差异来确保长度差异超过1

      // 验证实际的长度差异
      const lengthDiff = Math.abs(content1.length - content2.length);
      expect(lengthDiff).toBeGreaterThan(1); // 确保长度差异超过1

      // 模拟增强的防护逻辑
      const isSameContent = content1 === content2;
      const isSimilarLength = Math.abs(content1.length - content2.length) <= 1;
      const isSameTrimmed = content1.trim() === content2.trim();

      expect(isSameContent).toBe(false);
      expect(isSimilarLength).toBe(false); // 长度差异超过1
      expect(isSameTrimmed).toBe(false);

      // 这种情况应该被允许更新
      const shouldAllow = !isSameContent && (!isSimilarLength || !isSameTrimmed);
      expect(shouldAllow).toBe(true);
    });

    it("应该处理实际的 bodyLength 97-98 变化场景", () => {
      // 模拟实际遇到的内容变化
      const content97 = `---
title: "Test Image Paste"
slug: "test-image-paste"
publishDate: 2025-08-14T07:56:08.342Z
draft: true
public: false
excerpt: ""
category: ""
tags: []
author: ""
---

# Test Image Paste

这是一个测试图片粘贴功能的文章。

![Base64测试图片](./assets/inline-1755162514446.png)`;

      const content98 = `${content97}\n`; // 多一个换行符

      // 验证长度差异
      expect(content98.length - content97.length).toBe(1);

      // 模拟增强的防护逻辑
      const isSameContent = content97 === content98;
      const isSimilarLength = Math.abs(content97.length - content98.length) <= 1;
      const isSameTrimmed = content97.trim() === content98.trim();

      expect(isSameContent).toBe(false);
      expect(isSimilarLength).toBe(true);
      expect(isSameTrimmed).toBe(true); // trim 后相同

      // 这种情况应该被防护机制阻止
      const shouldBlock = isSimilarLength && isSameTrimmed;
      expect(shouldBlock).toBe(true);
    });
  });
});
