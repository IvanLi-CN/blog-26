#!/usr/bin/env bun

// 设置环境变量
process.env.WEBDAV_URL = "http://localhost:8080";

console.log("🔍 调试 WebDAV 请求...");

// 手动构造 PROPFIND 请求
const url = "http://localhost:8080/blog";
const body = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:displayname/>
    <D:getlastmodified/>
    <D:getcontentlength/>
    <D:resourcetype/>
    <D:getetag/>
  </D:prop>
</D:propfind>`;

const headers = {
  "Content-Type": "application/xml",
  Depth: "1",
};

console.log("请求 URL:", url);
console.log("请求头:", headers);
console.log("请求体长度:", body.length);

try {
  console.log("\n发送 PROPFIND 请求...");
  const response = await fetch(url, {
    method: "PROPFIND",
    headers,
    body,
  });

  console.log("响应状态:", response.status, response.statusText);
  console.log("响应头:", Object.fromEntries(response.headers.entries()));

  if (response.ok) {
    const text = await response.text();
    console.log("响应内容长度:", text.length);
    console.log("响应内容预览:", `${text.substring(0, 200)}...`);
  } else {
    const errorText = await response.text();
    console.log("错误响应:", errorText);
  }
} catch (error) {
  console.error("请求失败:", error);
}

// 测试不同的 Content-Type
console.log("\n🔄 测试不同的 Content-Type...");

const alternativeHeaders = [
  { "Content-Type": "text/xml", Depth: "1" },
  { "Content-Type": "application/xml; charset=utf-8", Depth: "1" },
  { Depth: "1" }, // 不设置 Content-Type
];

for (const [index, testHeaders] of alternativeHeaders.entries()) {
  try {
    console.log(`\n测试 ${index + 1}: ${JSON.stringify(testHeaders)}`);
    const response = await fetch(url, {
      method: "PROPFIND",
      headers: testHeaders,
      body,
    });

    console.log(`结果: ${response.status} ${response.statusText}`);

    if (response.ok) {
      console.log("✅ 成功！");
      break;
    }
  } catch (error) {
    console.log(`❌ 失败: ${error}`);
  }
}
