import React, { useState, useEffect, type MouseEventHandler, type KeyboardEventHandler, type ChangeEvent } from 'react';

interface Source {
  permalink: string;
  title: string;
  score?: number;
}

interface Message {
  type: 'user' | 'ai';
  text: string;
  sources?: Source[];
}

interface SearchAndChatProps {
  query: string | null;
  defaultResult: { query: string, answer?: string; sources?: Source[] } | null;
}

const SearchAndChat: React.FC<SearchAndChatProps> = ({ query, defaultResult }) => {
  const [mode, setMode] = useState<'search' | 'chat'>('search');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [searchResults, setSearchResults] = useState<{ query: string; answer?: string; sources?: Source[] } | null>(defaultResult);
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
      await performSearch(input);
    } else if (mode === 'chat') {
      await sendChatMessage(input);
    }
  };

  const sendChatMessage = async (text: string) => {
    const userMessage: Message = { type: 'user', text };
    setMessages(prevMessages => [...prevMessages, userMessage].slice(-10));
    setInput('');

    setLoading(true);
    setError(null);

    try {
      const chatRequestUrl = `/api/chat`;
      const response = await fetch(chatRequestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: input, history: messages }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chat failed');
      }

      const aiMessage: Message = {
        type: 'ai',
        text: data.text || 'No answer received.',
        sources: data.sources || [],
      };
      setMessages(prevMessages => [...prevMessages, aiMessage].slice(-10));

    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  }

  const handleKeyPress: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey || e.ctrlKey || e.altKey) {
        // 如果按下 Shift/Ctrl/Alt + Enter，则换行
        return;
      }
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleModeSwitch: MouseEventHandler<HTMLAnchorElement> = (e) => {
    const newMode = e.currentTarget.textContent === '搜索' ? 'search' : 'chat';
    if (newMode === 'chat' && searchResults && searchResults.answer) {
      const aiMessage: Message = {
        type: 'ai',
        text: searchResults.answer,
        sources: searchResults.sources,
      };
      setMessages((prevMessages) => [aiMessage, ...prevMessages].slice(-10));
    }
    setMode(newMode);
  };

  return (
    <React.Fragment>
      <div className="container mx-auto px-4 py-4" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div id="searchResults" className="space-y-8" style={{ flex: 1 }}>
          {mode === 'search' && (
            <React.Fragment>
              {loading && (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
                </div>
              )}
              {error && (
                <div className="text-center text-red-600 dark:text-red-400">
                  Error: {error}
                </div>
              )}
              {searchResults && (searchResults.answer || (searchResults.sources && searchResults.sources.length > 0)) ? (
                <React.Fragment>
                  {searchResults.answer && (
                    <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-6 mb-8">
                      <h3 className="text-xl font-semibold mb-4">Answer</h3>
                      <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: searchResults.answer }} />
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
                            {source.score ? (
                              <p className="text-sm text-sm text-gray-500 dark:text-gray-400 mb-2">
                                Relevance: {Math.round(source.score * 100)}%
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ) : (searchResults && !loading && !error) && (
                <div className="text-center text-gray-600 dark:text-slate-400">
                  No results found for "{query}"
                </div>
              )}
            </React.Fragment>
          )}
        </div>

        {mode === 'chat' && (
          <div className="chat-history space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center text-gray-600 dark:text-slate-400">
                开始对话吧！
              </div>
            )}
            {loading && mode === 'chat' && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
              </div>
            )}
            {messages.map((msg, index) => (
              <div key={index} className={`chat ${msg.type === 'user' ? 'chat-end' : 'chat-start'}`} >
                <div className={`chat-bubble ${msg.type === 'ai' ? 'chat-bubble-primary' : ''}`} >
                  <div dangerouslySetInnerHTML={{ __html: msg.text }} />
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
            {error && mode === 'chat' && (
              <div className="text-center text-red-600 dark:text-red-400">
                Error: {error}
              </div>
            )}
          </div>
        )}

        <div role="tablist" className="tabs tabs-boxed mx-auto">
          <a
            role="tab"
            className={`tab ${mode === 'search' ? 'tab-active' : ''}`}
            onClick={() => {
              if (mode === 'search') {
                // 如果已经在搜索模式下，则重新执行搜索
                performSearch(query || ''); // 确保 query 不为 null
              } else {
                setMode('search');
              }
            }}
          >
            搜索
          </a>
          <a
            role="tab"
            className={`tab ${mode === 'chat' ? 'tab-active' : ''}`}
            onClick={handleModeSwitch}
          >
            对话
          </a>
        </div>

        <div className="mt-8 flex items-center space-x-4" style={{ marginTop: 'auto' }}>
          <textarea
            className="textarea textarea-bordered w-full"
            placeholder={mode === 'search' ? '输入搜索关键词...' : '输入你的问题...'}
            value={input}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
          />
          <button
            className="btn btn-primary"
            onClick={handleSendMessage}
            disabled={loading || !input.trim()}
          >
            发送
          </button>
        </div>
      </div>
    </React.Fragment>
  );
};

export default SearchAndChat;
