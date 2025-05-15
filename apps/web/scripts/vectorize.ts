import { Settings } from 'llamaindex';
import { configureLlamaIndex } from '../src/lib/vectorizer';
import { processAllContent, updateContentRecord } from '../src/lib/contentProcessor';
import { initializeDB, closeDB } from '../src/lib/db';

async function main() {
  try {
    // 1. 初始化数据库
    await initializeDB();
    console.log('数据库初始化完成');

    // 2. 配置 LlamaIndex
    configureLlamaIndex();
    console.log('LlamaIndex 配置完成');

    // 3. 获取需要处理的内容
    const contents = await processAllContent();
    console.log(`找到 ${contents.length} 个需要处理的文件`);

    // 4. 处理每个文件
    for (const content of contents) {
      try {
        console.log(`正在处理: ${content.filepath}`);
        
        // 提取正文（移除 frontmatter）
        const mainContent = content.rawContent.replace(/^---\n[\s\S]*?\n---/, '').trim();
        
        // 获取向量表示
        const embeddings = await Settings.embedModel.getTextEmbeddings([mainContent]);
        const vector = Buffer.from(new Float32Array(embeddings[0]).buffer);
        
        // 更新数据库记录
        await updateContentRecord(content, vector);
        
        console.log(`✓ 完成: ${content.filepath}`);
      } catch (error) {
        console.error(`处理 ${content.filepath} 时出错:`, error);
      }
    }

    console.log('\n向量化处理完成！');
  } catch (error) {
    console.error('执行过程中出错:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await closeDB();
  }
}

// 执行主函数
main();
