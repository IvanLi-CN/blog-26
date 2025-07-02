import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { trpcVanilla } from '~/lib/trpc';

// Interfaces
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
interface SearchUIProps {
  initialQuery: string | null;
}

const SearchUI: React.FC<SearchUIProps> = ({ initialQuery }) => {
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQuery || '');
  const [answer, setAnswer] = useState<string>('');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuery && !answer && !loading) {
      handlePerformSearch(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (mode === 'chat' && answer && messages.length === 0) {
      const aiMessage: Message = {
        type: 'ai',
        text: answer,
        sources: sources,
      };
      setMessages([aiMessage]);
    }
  }, [mode, answer, sources]);

  const handlePerformSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer('');
    setSources([]);

    try {
      // 使用 tRPC 进行搜索
      const result = await trpcVanilla.search.query.query({ query: searchQuery });

      setAnswer(result.answer || '');
      setSources(result.sources || []);
    } catch (error: any) {
      setError(error.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    const currentInput = input;

    if (mode === 'search') {
      setInput('');
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('q', currentInput);
      window.history.pushState({}, '', newUrl);
      await handlePerformSearch(currentInput);
    } else {
      setInput('');
      await handleSendChatMessage(currentInput);
    }
  };

  const handleSendChatMessage = async (text: string) => {
    const userMessage: Message = { type: 'user', text };
    const currentHistory = messages.slice(-9);
    setMessages([...currentHistory, userMessage]);
    setLoading(true);
    setError(null);
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
      if (!response.body) throw new Error('Response body is empty');
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
              setMessages((prev) =>
                prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, text: fullText, sources: sources } : msg))
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
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <main className="flex-grow overflow-y-auto p-4">
        <div className="w-full max-w-4xl mx-auto">
          {mode === 'search' && (
            <React.Fragment>
              {loading && (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                </div>
              )}
              {error && <div className="text-center text-red-600 dark:text-red-400">Error: {error}</div>}
              {answer || sources.length > 0 ? (
                <React.Fragment>
                  {answer && (
                    <div className="bg-base-200 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8">
                      <h3 className="text-xl font-semibold mb-4">Answer</h3>
                      <div className="prose dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                  {sources.length > 0 && (
                    <div>
                      <h3 className="text-xl font-semibold mb-4">Related Articles</h3>
                      <div className="space-y-6">
                        {sources.map((source, index) => (
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
                !loading &&
                !error &&
                initialQuery && (
                  <div className="text-center text-gray-600 dark:text-slate-400">
                    No results found for "{initialQuery}"
                  </div>
                )
              )}
            </React.Fragment>
          )}

          {mode === 'chat' && (
            <div className="chat-history space-y-4">
              {messages.map((msg, index) => (
                <div key={index} className={`chat ${msg.type === 'user' ? 'chat-end' : 'chat-start'}`}>
                  <div className="chat-bubble">
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
      </main>
      <footer className="p-4 border-t border-base-200 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <div role="tablist" className="tabs tabs-boxed mx-auto mb-4">
            <a role="tab" className={`tab ${mode === 'search' ? 'tab-active' : ''}`} onClick={() => setMode('search')}>
              搜索
            </a>
            <a role="tab" className={`tab ${mode === 'chat' ? 'tab-active' : ''}`} onClick={() => setMode('chat')}>
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
          <div className="text-center text-xs text-base-content/50 mt-4">
            <p>
              Copyright &copy; {new Date().getFullYear()} Ivan Li. All rights reserved.
              <br />
              <a target="_blank" rel="nofollow" href="https://beian.miit.gov.cn" className="hover:underline">
                闽ICP备2023000043号
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SearchUI;
