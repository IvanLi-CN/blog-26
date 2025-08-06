import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/utils';
import { useEffect, useRef } from 'react';
import { isExternalUrl, isOptimizedImageUrl, resolveRelativePath } from '../../utils/path-resolver';

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

interface MilkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  'data-testid'?: string;
  // 新增：图片上传处理函数
  onImageUpload?: (file: File) => Promise<string>;
}

// 转换图片路径用于编辑器显示
function convertImagePathForEditor(imagePath: string): string {
  // 如果已经是完整的 URL、base64图片或已经是文件代理路径，直接返回
  if (
    imagePath &&
    (isExternalUrl(imagePath) ||
      imagePath.startsWith('data:') ||
      imagePath.startsWith('/files/') ||
      isOptimizedImageUrl(imagePath))
  ) {
    return imagePath;
  }

  // 如果是相对路径，转换为 WebDAV 文件代理路径
  if (imagePath) {
    // 对于Memos，使用统一的路径解析逻辑
    const articleDir = 'Memos/'; // Memos文章都在Memos目录下
    const resolvedPath = resolveRelativePath(imagePath, articleDir);

    // 使用 WebDAV 文件代理路径（Memos 图片存储在 WebDAV）
    return `/files/webdav/${resolvedPath}`;
  }

  return imagePath;
}

// 预处理内容，转换图片路径
function preprocessContentForEditor(content: string): string {
  // 匹配 Markdown 图片语法：![alt](src)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  return content.replace(imageRegex, (match, alt, src) => {
    const convertedSrc = convertImagePathForEditor(src);
    console.log('🖼️ [MilkdownEditor] 转换图片路径:', {
      original: src,
      converted: convertedSrc,
    });
    return `![${alt}](${convertedSrc})`;
  });
}

export function MilkdownEditor({
  content,
  onChange,
  placeholder = '写下你的想法...',
  className = '',
  'data-testid': dataTestId,
  onImageUpload,
}: MilkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const lastContentRef = useRef<string>(content);
  const onImageUploadRef = useRef(onImageUpload);

  // 更新 onImageUpload 引用
  useEffect(() => {
    onImageUploadRef.current = onImageUpload;
  }, [onImageUpload]);

  useEffect(() => {
    if (!editorRef.current) return;

    const initEditor = async () => {
      try {
        console.log('🚀 [MilkdownEditor] 开始初始化 Crepe 编辑器...');

        // 预处理内容，转换图片路径
        const processedContent = preprocessContentForEditor(content);
        console.log('📝 [MilkdownEditor] 预处理内容:', {
          originalLength: content.length,
          processedLength: processedContent.length,
          hasImages: processedContent.includes('!['),
        });

        // 配置 Crepe 编辑器
        const crepeConfig = {
          root: editorRef.current!,
          defaultValue: processedContent,
          features: {
            [CrepeFeature.ImageBlock]: true, // 启用图片块功能
          },
          featureConfigs: {
            // 配置图片块功能（处理 UI 按钮上传）
            [CrepeFeature.ImageBlock]: {
              onUpload: async (file: File) => {
                console.log('📸 [MilkdownEditor] ImageBlock 检测到图片上传:', {
                  fileName: file.name,
                  fileSize: file.size,
                  fileType: file.type,
                  timestamp: new Date().toISOString(),
                });

                if (!onImageUploadRef.current) {
                  console.warn('⚠️ [MilkdownEditor] 未提供 onImageUpload 处理函数，使用默认处理');
                  const localUrl = URL.createObjectURL(file);
                  console.log('🔗 [MilkdownEditor] 创建本地预览 URL:', localUrl);
                  return localUrl;
                }

                try {
                  console.log('⬆️ [MilkdownEditor] ImageBlock 开始上传图片到服务器...');
                  const uploadedUrl = await onImageUploadRef.current(file);
                  console.log('✅ [MilkdownEditor] ImageBlock 图片上传成功:', {
                    originalFileName: file.name,
                    uploadedUrl,
                  });
                  return uploadedUrl;
                } catch (error) {
                  console.error('❌ [MilkdownEditor] ImageBlock 图片上传失败:', {
                    fileName: file.name,
                    error: error.message,
                    stack: error.stack,
                  });

                  const fallbackUrl = URL.createObjectURL(file);
                  console.log('🔄 [MilkdownEditor] ImageBlock 使用本地 URL 作为备用:', fallbackUrl);
                  return fallbackUrl;
                }
              },
            },
          },
        };

        console.log('⚙️ [MilkdownEditor] Crepe 配置:', crepeConfig);

        const crepe = new Crepe(crepeConfig);

        // 添加监听器
        crepe.on((listener) => {
          listener.markdownUpdated((_, markdown) => {
            console.log('📝 [MilkdownEditor] Markdown 内容更新:', {
              length: markdown.length,
              hasImages: markdown.includes('!['),
              timestamp: new Date().toISOString(),
            });
            lastContentRef.current = markdown;
            onChange(markdown);
          });
        });

        // 创建编辑器
        console.log('🔨 [MilkdownEditor] 创建编辑器实例...');
        await crepe.create();
        crepeRef.current = crepe;
        lastContentRef.current = content;

        console.log('✅ [MilkdownEditor] 编辑器初始化完成');
      } catch (error) {
        console.error('❌ [MilkdownEditor] 编辑器初始化失败:', {
          error: error.message,
          stack: error.stack,
        });
      }
    };

    initEditor();

    return () => {
      console.log('🧹 [MilkdownEditor] 清理编辑器...');
      if (crepeRef.current) {
        crepeRef.current.destroy();
        crepeRef.current = null;
      }
    };
  }, []); // 移除依赖项，只在组件挂载时初始化一次

  // 处理外部内容变化
  useEffect(() => {
    if (crepeRef.current && lastContentRef.current !== content) {
      try {
        console.log('🔄 [MilkdownEditor] 更新编辑器内容:', {
          oldLength: lastContentRef.current.length,
          newLength: content.length,
        });

        // 预处理内容，转换图片路径
        const processedContent = preprocessContentForEditor(content);

        // 使用 Milkdown 的 action API 来设置内容
        crepeRef.current.editor.action(replaceAll(processedContent));
        lastContentRef.current = content;

        console.log('✅ [MilkdownEditor] 内容更新成功');
      } catch (error) {
        console.error('❌ [MilkdownEditor] 内容更新失败:', error);
        // 如果设置失败，尝试重新创建编辑器
        if (editorRef.current) {
          console.log('🔄 [MilkdownEditor] 尝试重新创建编辑器...');
          crepeRef.current.destroy();
          const processedContent = preprocessContentForEditor(content);
          const newCrepe = new Crepe({
            root: editorRef.current,
            defaultValue: processedContent,
            features: {
              [CrepeFeature.ImageBlock]: true,
            },
            featureConfigs: {
              [CrepeFeature.ImageBlock]: {
                onUpload: async (file: File) => {
                  if (onImageUploadRef.current) {
                    return await onImageUploadRef.current(file);
                  }
                  return URL.createObjectURL(file);
                },
              },
            },
          });
          newCrepe.on((listener) => {
            listener.markdownUpdated((_, markdown) => {
              lastContentRef.current = markdown;
              onChange(markdown);
            });
          });
          newCrepe.create().then(() => {
            crepeRef.current = newCrepe;
            lastContentRef.current = content;
            console.log('✅ [MilkdownEditor] 编辑器重新创建成功');
          });
        }
      }
    }
  }, [content, onChange, placeholder]);

  return <div ref={editorRef} className={`milkdown-editor ${className}`} data-testid={dataTestId} />;
}
