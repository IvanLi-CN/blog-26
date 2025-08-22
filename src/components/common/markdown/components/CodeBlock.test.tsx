import { describe, expect, test } from "bun:test";
import { countLines, extractTextContent } from "../utils";

describe("CodeBlock functionality", () => {
  const shortCode = 'console.log("hello");';
  const longCode = Array(35).fill('console.log("line");').join("\n");

  test("should extract text content from simple string", () => {
    const result = extractTextContent(shortCode);
    expect(result).toBe(shortCode);
  });

  test("should extract text content from complex children", () => {
    const complexChildren = [
      { type: "text", value: "// Comment\n" },
      {
        type: "element",
        tagName: "span",
        children: [{ type: "text", value: "const" }],
      },
      { type: "text", value: " x = 42;" },
    ];

    const result = extractTextContent(complexChildren);
    expect(result).toContain("// Comment");
    expect(result).toContain("const");
    expect(result).toContain(" x = 42;");
    expect(result).not.toContain("[object Object]");
  });

  test("should count lines correctly", () => {
    expect(countLines(shortCode)).toBe(1);
    expect(countLines(longCode)).toBe(35);
    expect(countLines("line1\nline2\nline3")).toBe(3);
  });

  test("should handle empty and null content", () => {
    expect(extractTextContent("")).toBe("");
    expect(extractTextContent(null)).toBe("");
    expect(extractTextContent(undefined)).toBe("");
  });

  test("should extract text from rehype-highlight structure", () => {
    // Simulate the structure that rehype-highlight might produce
    const highlightStructure = [
      { type: "text", value: "async " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "function" }],
      },
      { type: "text", value: " processData() {\n  " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "try" }],
      },
      { type: "text", value: " {\n    " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "const" }],
      },
      { type: "text", value: " data = " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "await" }],
      },
      { type: "text", value: " fetchData();\n    " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "return" }],
      },
      { type: "text", value: " " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "await" }],
      },
      { type: "text", value: " processResult(data);\n  } " },
      {
        type: "element",
        tagName: "span",
        properties: { className: ["hljs-keyword"] },
        children: [{ type: "text", value: "catch" }],
      },
      { type: "text", value: " (error) {\n    console.error('处理失败:', error);\n  }\n}" },
    ];

    const result = extractTextContent(highlightStructure);
    expect(result).toContain("async function processData()");
    expect(result).toContain("try {");
    expect(result).toContain("const data = await fetchData();");
    expect(result).toContain("return await processResult(data);");
    expect(result).toContain("catch (error)");
    expect(result).toContain("console.error('处理失败:', error);");
    expect(result).not.toContain("[object Object]");
  });

  test("should handle mixed content types", () => {
    const mixedContent = [
      "plain text",
      42,
      { type: "text", value: " from hast" },
      null,
      undefined,
      { someProperty: "should be ignored" },
      { value: "should be extracted" },
    ];

    const result = extractTextContent(mixedContent);
    expect(result).toContain("plain text");
    expect(result).toContain("42");
    expect(result).toContain(" from hast");
    expect(result).toContain("should be extracted");
    expect(result).not.toContain("[object Object]");
    expect(result).not.toContain("should be ignored");
  });
});
