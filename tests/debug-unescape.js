// 简单的调试脚本来测试反转义逻辑

function processContent(content) {
  return content
    .replace(/\\#/g, '#') // 反转义标题
    .replace(/!\\\[/g, '![') // 反转义图片开始
    .replace(/\\\]/g, ']') // 反转义右方括号
    .replace(/\\\(/g, '(') // 反转义左圆括号
    .replace(/\\`/g, '`') // 反转义代码
    .replace(/\\\*/g, '*') // 反转义粗体/斜体
    .replace(/\\\_/g, '_') // 反转义下划线
    .replace(/<br\s*\/?>/gi, '\n\n'); // 将HTML换行转换为markdown换行
}

// 测试用例
const testCases = [
  {
    name: '转义的标题',
    input: '\\# 测试标题',
    expected: '# 测试标题',
  },
  {
    name: '转义的Base64图片',
    input:
      '!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)',
    expected:
      '![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)',
  },
  {
    name: '复杂的转义内容',
    input:
      '\\# 简化Base64测试\n\n!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)\n\n测试完成。',
    expected:
      '# 简化Base64测试\n\n![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)\n\n测试完成。',
  },
];

console.log('🧪 测试反转义逻辑...\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log('输入:', JSON.stringify(testCase.input));

  const result = processContent(testCase.input);
  console.log('输出:', JSON.stringify(result));
  console.log('期望:', JSON.stringify(testCase.expected));

  const passed = result === testCase.expected;
  console.log(`结果: ${passed ? '✅ 通过' : '❌ 失败'}`);

  if (!passed) {
    console.log('差异:');
    console.log('  实际:', result);
    console.log('  期望:', testCase.expected);
  }

  console.log('');
});

console.log('🔍 测试完成');
