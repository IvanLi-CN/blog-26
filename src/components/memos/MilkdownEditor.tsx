import { Crepe } from '@milkdown/crepe';
import { getMarkdown, replaceAll } from '@milkdown/utils';
import { useEffect, useRef } from 'react';

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

interface MilkdownEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
}

export function MilkdownEditor({
  content,
  onChange,
  placeholder = '写下你的想法...',
  className = '',
}: MilkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const lastContentRef = useRef<string>(content);

  useEffect(() => {
    if (!editorRef.current) return;

    const initEditor = async () => {
      try {
        const crepe = new Crepe({
          root: editorRef.current!,
          defaultValue: content,
        });

        // 添加监听器
        crepe.on((listener) => {
          listener.markdownUpdated((_, markdown) => {
            lastContentRef.current = markdown;
            onChange(markdown);
          });
        });

        // 创建编辑器
        await crepe.create();
        crepeRef.current = crepe;
        lastContentRef.current = content;
      } catch (error) {
        console.error('Failed to create Milkdown editor:', error);
      }
    };

    initEditor();

    return () => {
      if (crepeRef.current) {
        crepeRef.current.destroy();
        crepeRef.current = null;
      }
    };
  }, []);

  // 处理外部内容变化
  useEffect(() => {
    if (crepeRef.current && lastContentRef.current !== content) {
      try {
        // 使用 Milkdown 的 action API 来设置内容
        crepeRef.current.editor.action(replaceAll(content));
        lastContentRef.current = content;
      } catch (error) {
        console.error('Failed to set markdown:', error);
        // 如果设置失败，尝试重新创建编辑器
        if (editorRef.current) {
          crepeRef.current.destroy();
          const newCrepe = new Crepe({
            root: editorRef.current,
            defaultValue: content,
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
          });
        }
      }
    }
  }, [content, onChange, placeholder]);

  return <div ref={editorRef} className={`milkdown-editor ${className}`} />;
}
