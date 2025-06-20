import React, { useState, useEffect, type MouseEventHandler, type KeyboardEventHandler, type ChangeEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// 注意: highlight.js 的样式需要全局引入，或者在这里动态引入
// 例如: import 'highlight.js/styles/github.css';
// 为了简单起见，我们假设样式已在全局（例如 CustomStyles.astro）引入

interface Source {
  permalink: string;
  title: string;
  slug: string;
  score?: number;
}

interface Message {
  type: 'user' | 'ai';
  text: string;
  sources?: Source[];
}

interface SearchAndChatProps {
  query: string | null;
  defaultResult: { query: string; answer?: string; sources?: Source[] } | null;
}

const SearchAndChat: React.FC<SearchAndChatProps> = ({ query, defaultResult }) => {
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [searchResults, setSearchResults] = useState<{ query: string; answer?: string; sources?: Source[] } | null>(
    defaultResult
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && mode === 'search' && query) {
      if (searchResults?.query.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase()) {
        return;
      }
      performSearch(query);
    }
  }, [mode, query]);

  // 当从搜索模式切换到对话模式时，预填入第一条消息
  useEffect(() => {
    if (mode === 'chat' && searchResults && searchResults.answer && messages.length === 0) {
      const aiMessage: Message = {
        type: 'ai',
        text: searchResults.answer,
        sources: searchResults.sources,
      };
      setMessages([aiMessage]);
    }
  }, [mode, searchResults, messages]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const requestUrl = `/api/search?q=${encodeURIComponent(searchQuery)}`;
      const response = await fetch(requestUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      // --- BEGIN FRONTEND REPLACEMENT LOGIC ---
      if (data.answer && data.sources) {
        let finalAnswer = data.answer;
        data.sources.forEach((source: Source) => {
          if (source.slug) {
            const slugRegex = new RegExp(`《(${source.slug})》`, 'g');
            finalAnswer = finalAnswer.replace(slugRegex, `[${source.title}](${source.permalink})`);
          }
        });
        data.answer = finalAnswer;
      }
      // --- END FRONTEND REPLACEMENT LOGIC ---

      setSearchResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to perform search');
      setSearchResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    if (mode === 'search') {
      // 更新 URL 并触发搜索
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('q', input);
      window.history.pushState({}, '', newUrl);
      await performSearch(input);
    } else if (mode === 'chat') {
      await sendChatMessage(input);
    }
    setInput('');
  };

  const sendChatMessage = async (text: string) => {
    const userMessage: Message = { type: 'user', text };
    // 在发送时，保留最近的 9 条消息，为 AI 的回复留出位置
    const currentHistory = messages.slice(-9);
    setMessages([...currentHistory, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    // 立即添加一个空的 AI 消息占位符
    const aiMessagePlaceholder: Message = { type: 'ai', text: '...' };
    setMessages((prev) => [...prev, aiMessagePlaceholder]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, history: currentHistory }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Chat failed');
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          const jsonStr = line.substring('data: '.length);
          const data = JSON.parse(jsonStr);

          if (data.text) {
            const endOfStreamMarker = '__END_OF_STREAM__';
            if (data.text.includes(endOfStreamMarker)) {
              const parts = data.text.split(endOfStreamMarker);
              fullText += parts[0];
              const sources: Source[] = JSON.parse(parts[1]);
              let finalRenderText = fullText.trim();

              sources.forEach((source) => {
                if (source.slug) {
                  // 用 slug 创建一个正则表达式来查找 (slug) 格式的文本
                  const slugRegex = new RegExp(`\\((${source.slug})\\)`, 'g');
                  // 将其替换为完整的 Markdown 链接
                  finalRenderText = finalRenderText.replace(slugRegex, `[${source.title}](${source.permalink})`);
                }
              });

              setMessages((prev) =>
                prev.map((msg, i) =>
                  i === prev.length - 1 ? { ...msg, text: finalRenderText, sources: sources } : msg
                )
              );
            } else {
              fullText += data.text;
              setMessages((prev) => prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, text: fullText } : msg)));
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      setMessages((prev) => prev.slice(0, -1)); // 移除 AI 消息占位符
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleModeSwitch: MouseEventHandler<HTMLAnchorElement> = (e) => {
    const newMode = e.currentTarget.textContent === '搜索' ? 'search' : 'chat';
    setMode(newMode);
  };

  return (
    <React.Fragment>
      <div
        className="container mx-auto px-4 py-4"
        style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)' }}
      >
        <div id="results-or-chat" className="space-y-8" style={{ flex: 1, overflowY: 'auto' }}>
          {mode === 'search' && (
            <React.Fragment>
              {loading && (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                </div>
              )}
              {error && <div className="text-center text-red-600 dark:text-red-400">Error: {error}</div>}
              {searchResults &&
              (searchResults.answer || (searchResults.sources && searchResults.sources.length > 0)) ? (
                <React.Fragment>
                  {searchResults.answer && (
                    <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8">
                      <h3 className="text-xl font-semibold mb-4">Answer</h3>
                      <div className="prose dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{searchResults.answer}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {searchResults.sources && searchResults.sources.length > 0 && (
                    <div>
                      <h3 className="text-xl font-semibold mb-4">Related Articles</h3>
                      <div className="space-y-6">
                        {searchResults.sources.map((source, index) => (
                          <article key={index} className="border border-gray-200 dark:border-slate-700 rounded-xl p-5">
                            <h3 className="text-lg font-semibold mb-2">
                              <a href={source.permalink} className="hover:text-primary">
                                {source.title}
                              </a>
                            </h3>
                            {source.score && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                Relevance: {Math.round(source.score * 100)}%
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ) : (
                searchResults &&
                !loading &&
                !error && (
                  <div className="text-center text-gray-600 dark:text-slate-400">No results found for "{query}"</div>
                )
              )}
            </React.Fragment>
          )}

          {mode === 'chat' && (
            <div className="chat-history space-y-4">
              {messages.map((msg, index) => (
                <div key={index} className={`chat ${msg.type === 'user' ? 'chat-end' : 'chat-start'}`}>
                  <div className={`chat-bubble ${msg.type === 'ai' ? 'chat-bubble-primary' : ''}`}>
                    <div className="prose dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                    {msg.type === 'ai' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                        <p className="text-sm font-semibold mb-2">相关文章:</p>
                        <ul className="list-disc list-inside text-sm">
                          {msg.sources.map((source, srcIndex) => (
                            <li key={srcIndex}>
                              <a href={source.permalink} className="hover:underline">
                                {source.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && messages[messages.length - 1]?.type === 'ai' && (
                <div className="flex justify-center">{/* Placeholder is now part of the message itself */}</div>
              )}
              {error && <div className="text-center text-red-600 dark:text-red-400 mt-4">Error: {error}</div>}
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          <div role="tablist" className="tabs tabs-boxed mx-auto mb-4">
            <a role="tab" className={`tab ${mode === 'search' ? 'tab-active' : ''}`} onClick={() => setMode('search')}>
              搜索
            </a>
            <a role="tab" className={`tab ${mode === 'chat' ? 'tab-active' : ''}`} onClick={handleModeSwitch}>
              对话
            </a>
          </div>

          <div className="flex items-center space-x-4">
            <textarea
              className="textarea textarea-bordered w-full"
              placeholder={mode === 'search' ? '输入搜索关键词...' : '输入你的问题...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
            />
            <button className="btn btn-primary" onClick={handleSendMessage} disabled={loading || !input.trim()}>
              发送
            </button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};

export default SearchAndChat;
