import { describe, expect, it } from "bun:test";
import { extractTextContent } from "./utils";

describe("extractTextContent", () => {
  it("should handle string input", () => {
    expect(extractTextContent("hello world")).toBe("hello world");
  });

  it("should handle number input", () => {
    expect(extractTextContent(42)).toBe("42");
  });

  it("should handle null and undefined", () => {
    expect(extractTextContent(null)).toBe("");
    expect(extractTextContent(undefined)).toBe("");
  });

  it("should handle array of strings", () => {
    expect(extractTextContent(["hello", " ", "world"])).toBe("hello world");
  });

  it("should handle array of mixed types", () => {
    expect(extractTextContent(["hello", 42, " world"])).toBe("hello42 world");
  });

  it("should handle React element-like objects", () => {
    const reactElement = {
      props: {
        children: "hello from react",
      },
    };
    expect(extractTextContent(reactElement)).toBe("hello from react");
  });

  it("should handle hast text nodes", () => {
    const textNode = {
      type: "text",
      value: "hello from hast",
    };
    expect(extractTextContent(textNode)).toBe("hello from hast");
  });

  it("should handle hast element nodes", () => {
    const elementNode = {
      type: "element",
      children: [
        { type: "text", value: "hello" },
        { type: "text", value: " world" },
      ],
    };
    expect(extractTextContent(elementNode)).toBe("hello world");
  });

  it("should handle highlight.js span elements", () => {
    const spanElement = {
      tagName: "span",
      children: [
        { type: "text", value: "const" },
        { type: "text", value: " x = 42;" },
      ],
    };
    expect(extractTextContent(spanElement)).toBe("const x = 42;");
  });

  it("should handle complex nested structures", () => {
    const complexStructure = [
      { type: "text", value: "// 使用 async/await\n" },
      {
        type: "element",
        tagName: "span",
        children: [{ type: "text", value: "async" }],
      },
      { type: "text", value: " " },
      {
        type: "element",
        tagName: "span",
        children: [{ type: "text", value: "function" }],
      },
      {
        type: "text",
        value:
          " processData() {\n  try {\n    const data = await fetchData();\n    return await processResult(data);\n  } catch (error) {\n    console.error('处理失败:', error);\n  }\n}",
      },
    ];

    const result = extractTextContent(complexStructure);
    expect(result).toContain("// 使用 async/await");
    expect(result).toContain("async function processData()");
    expect(result).toContain("console.error('处理失败:', error);");
    expect(result).not.toContain("[object Object]");
  });

  it("should handle objects with value property", () => {
    const objWithValue = { value: "test value" };
    expect(extractTextContent(objWithValue)).toBe("test value");
  });

  it("should handle objects with data property", () => {
    const objWithData = { data: "test data" };
    expect(extractTextContent(objWithData)).toBe("test data");
  });

  it("should return empty string for unhandleable objects", () => {
    const unhandleableObj = { someProperty: "value" };
    expect(extractTextContent(unhandleableObj)).toBe("");
  });

  it("should handle objects with custom toString", () => {
    const objWithToString = {
      toString: () => "custom string",
    };
    expect(extractTextContent(objWithToString)).toBe("custom string");
  });

  it("should not return [object Object] for plain objects", () => {
    const plainObj = { key: "value" };
    const result = extractTextContent(plainObj);
    expect(result).not.toBe("[object Object]");
    expect(result).toBe("");
  });

  it("should handle deeply nested arrays", () => {
    const deeplyNested = [
      "start",
      ["nested1", ["deeply nested", { type: "text", value: " text" }]],
      "end",
    ];
    expect(extractTextContent(deeplyNested)).toBe("startnested1deeply nested textend");
  });
});
