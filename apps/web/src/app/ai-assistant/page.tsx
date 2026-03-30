'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'

// ── Types ──

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  confirmAction?: {
    toolName: string
    toolInput: Record<string, unknown>
    description: string
  } | null
}

interface ApiResponse {
  success: boolean
  data?: ChatMessage
  error?: string
}

// ── Constants ──

const STORAGE_KEY = 'lh_ai_chat_history'

const SUGGESTIONS = [
  'VIPタグの友だちにキャンペーンを送って',
  '今月の友だち追加数を教えて',
  '明日10時に全員にお知らせを配信して',
  'フォームの回答一覧を見せて',
  '神谷さんにタグ"VIP"を追加して',
  'シナリオ一覧を教えて',
  'タグ一覧を見せて',
  '流入分析のサマリーを教えて',
]

// ── Markdown-like rendering ──

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let inCodeBlock = false
  let codeContent = ''
  let codeKey = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeKey++}`} className="bg-black/20 rounded-lg p-3 overflow-x-auto text-xs my-2">
            <code>{codeContent}</code>
          </pre>
        )
        codeContent = ''
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="font-bold text-sm mt-3 mb-1">{line.slice(4)}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="font-bold text-base mt-3 mb-1">{line.slice(3)}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="font-bold text-lg mt-3 mb-1">{line.slice(2)}</h1>)
    }
    // List items
    else if (line.match(/^[-*] /)) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="shrink-0">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      )
    }
    // Numbered list
    else if (line.match(/^\d+\. /)) {
      const match = line.match(/^(\d+)\. (.*)/)
      if (match) {
        elements.push(
          <div key={i} className="flex gap-2 ml-2">
            <span className="shrink-0 text-white/50">{match[1]}.</span>
            <span>{renderInline(match[2])}</span>
          </div>
        )
      }
    }
    // Table (simple)
    else if (line.startsWith('|')) {
      // Collect all table lines
      const tableLines: string[] = [line]
      while (i + 1 < lines.length && lines[i + 1].startsWith('|')) {
        i++
        tableLines.push(lines[i])
      }
      elements.push(
        <div key={i} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full">
            <tbody>
              {tableLines.filter(l => !l.match(/^\|[\s-:|]+\|$/)).map((tl, ti) => (
                <tr key={ti} className={ti === 0 ? 'font-bold' : ''}>
                  {tl.split('|').filter(Boolean).map((cell, ci) => (
                    <td key={ci} className="px-2 py-1 border border-white/10">{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />)
    }
    // Normal paragraph
    else {
      elements.push(<p key={i}>{renderInline(line)}</p>)
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeContent) {
    elements.push(
      <pre key={`code-${codeKey}`} className="bg-black/20 rounded-lg p-3 overflow-x-auto text-xs my-2">
        <code>{codeContent}</code>
      </pre>
    )
  }

  return elements
}

function renderInline(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-black/20 px-1 py-0.5 rounded text-xs">{part.slice(1, -1)}</code>
    }
    return part
  })
}

// ── Main component ──

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[]
        setMessages(parsed)
      }
    } catch { /* ignore */ }
  }, [])

  // Save to localStorage when messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    }
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMessage: ChatMessage = { role: 'user', content: text.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetchApi<ApiResponse>('/api/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: apiMessages }),
      })
      if (res.success && res.data) {
        setMessages([...updatedMessages, res.data])
      } else {
        setMessages([...updatedMessages, {
          role: 'assistant',
          content: `エラー: ${res.error || '不明なエラーが発生しました'}`,
        }])
      }
    } catch (err) {
      setMessages([...updatedMessages, {
        role: 'assistant',
        content: `通信エラー: ${err instanceof Error ? err.message : 'APIに接続できません'}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  const handleConfirm = useCallback(async (action: ChatMessage['confirmAction'], confirmed: boolean) => {
    if (!action) return

    if (!confirmed) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'キャンセルしました。' }])
      return
    }

    setLoading(true)
    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetchApi<ApiResponse>('/api/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: apiMessages,
          confirmed: true,
          pendingAction: { toolName: action.toolName, toolInput: action.toolInput },
        }),
      })
      if (res.success && res.data) {
        setMessages(prev => [...prev, res.data!])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `エラー: ${res.error || '実行に失敗しました'}`,
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `通信エラー: ${err instanceof Error ? err.message : 'APIに接続できません'}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [messages])

  const clearChat = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <SparklesIcon />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">AIアシスタント</h1>
            <p className="text-xs text-gray-500">自然言語でCRMを操作</p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          新しい会話
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <SparklesIcon size={32} />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">My Hisho AIアシスタント</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-md">
              LINE CRMの全機能を自然言語で操作できます。友だち管理、配信、分析など何でも聞いてください。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-gray-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex gap-2'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1"
                  style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                  <SparklesIcon size={14} />
                </div>
              )}
              <div>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#06C755] text-white rounded-br-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                }`}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>

                {/* Confirmation buttons */}
                {msg.confirmAction && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1">
                      {msg.confirmAction.description}
                    </div>
                    <button
                      onClick={() => handleConfirm(msg.confirmAction, true)}
                      disabled={loading}
                      className="px-4 py-2 text-xs font-medium text-white bg-[#06C755] rounded-lg hover:bg-[#05b34a] transition-colors disabled:opacity-50"
                    >
                      はい
                    </button>
                    <button
                      onClick={() => handleConfirm(msg.confirmAction, false)}
                      disabled={loading}
                      className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      いいえ
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <SparklesIcon size={14} />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <div className="flex gap-2 items-end max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            disabled={loading}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 max-h-32"
            style={{ minHeight: '44px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
            style={{ background: input.trim() && !loading ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m-7 7l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sparkles Icon ──

function SparklesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  )
}
