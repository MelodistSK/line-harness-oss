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

interface UsageDaily {
  date: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  request_count: number
  tool_calls: number
}

interface UsageMonth {
  month: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  request_count: number
  tool_calls: number
}

interface UsageLog {
  id: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  model: string
  tool_calls: number
  user_message: string | null
  created_at: string
}

// ── Constants ──

const STORAGE_KEY = 'lh_ai_chat_history'
const JPY_RATE = 150

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
    if (inCodeBlock) { codeContent += (codeContent ? '\n' : '') + line; continue }
    if (line.startsWith('### ')) { elements.push(<h3 key={i} className="font-bold text-sm mt-3 mb-1">{line.slice(4)}</h3>) }
    else if (line.startsWith('## ')) { elements.push(<h2 key={i} className="font-bold text-base mt-3 mb-1">{line.slice(3)}</h2>) }
    else if (line.startsWith('# ')) { elements.push(<h1 key={i} className="font-bold text-lg mt-3 mb-1">{line.slice(2)}</h1>) }
    else if (line.match(/^[-*] /)) {
      elements.push(<div key={i} className="flex gap-2 ml-2"><span className="shrink-0">•</span><span>{renderInline(line.slice(2))}</span></div>)
    } else if (line.match(/^\d+\. /)) {
      const match = line.match(/^(\d+)\. (.*)/)
      if (match) elements.push(<div key={i} className="flex gap-2 ml-2"><span className="shrink-0 text-white/50">{match[1]}.</span><span>{renderInline(match[2])}</span></div>)
    } else if (line.startsWith('|')) {
      const tableLines: string[] = [line]
      while (i + 1 < lines.length && lines[i + 1].startsWith('|')) { i++; tableLines.push(lines[i]) }
      elements.push(
        <div key={i} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full"><tbody>
            {tableLines.filter(l => !l.match(/^\|[\s-:|]+\|$/)).map((tl, ti) => (
              <tr key={ti} className={ti === 0 ? 'font-bold' : ''}>
                {tl.split('|').filter(Boolean).map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 border border-white/10">{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody></table>
        </div>
      )
    } else if (line.trim() === '') { elements.push(<div key={i} className="h-2" />) }
    else { elements.push(<p key={i}>{renderInline(line)}</p>) }
  }
  if (inCodeBlock && codeContent) {
    elements.push(<pre key={`code-${codeKey}`} className="bg-black/20 rounded-lg p-3 overflow-x-auto text-xs my-2"><code>{codeContent}</code></pre>)
  }
  return elements
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-black/20 px-1 py-0.5 rounded text-xs">{part.slice(1, -1)}</code>
    return part
  })
}

// ── Format helpers ──

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function fmtCost(usd: number): string {
  return '$' + usd.toFixed(4)
}

function fmtJpy(usd: number): string {
  return Math.round(usd * JPY_RATE).toLocaleString() + ' 円'
}

// ── Usage Dashboard ──

function UsageDashboard() {
  const [monthly, setMonthly] = useState<UsageMonth[]>([])
  const [daily, setDaily] = useState<UsageDaily[]>([])
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [logsTotal, setLogsTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [mRes, dRes, lRes] = await Promise.all([
          fetchApi<{ success: boolean; data: UsageMonth[] }>('/api/ai-assistant/usage?period=month'),
          fetchApi<{ success: boolean; data: UsageDaily[] }>('/api/ai-assistant/usage?period=daily'),
          fetchApi<{ success: boolean; data: { logs: UsageLog[]; total: number } }>('/api/ai-assistant/usage/logs?limit=20'),
        ])
        if (mRes.success) setMonthly(mRes.data)
        if (dRes.success) setDaily(dRes.data)
        if (lRes.success) { setLogs(lRes.data.logs); setLogsTotal(lRes.data.total) }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">読み込み中...</div>

  // Current month summary
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonth = monthly.find(m => m.month === currentMonthKey)
  const totalTokens = thisMonth?.total_tokens || 0
  const totalCost = thisMonth?.estimated_cost_usd || 0
  const totalRequests = thisMonth?.request_count || 0
  const totalTools = thisMonth?.tool_calls || 0

  // Daily chart - max value for scaling
  const maxDailyTokens = Math.max(...daily.map(d => d.total_tokens), 1)

  return (
    <div className="space-y-6 p-4 overflow-y-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="今月のトークン" value={fmtTokens(totalTokens)} sub={`入力: ${fmtTokens(thisMonth?.input_tokens || 0)} / 出力: ${fmtTokens(thisMonth?.output_tokens || 0)}`} />
        <SummaryCard label="推定コスト" value={fmtCost(totalCost)} sub={fmtJpy(totalCost)} />
        <SummaryCard label="リクエスト数" value={String(totalRequests)} sub={`ツール呼出: ${totalTools}回`} />
        <SummaryCard label="平均トークン/回" value={totalRequests > 0 ? fmtTokens(Math.round(totalTokens / totalRequests)) : '0'} sub={totalRequests > 0 ? `平均 ${fmtCost(totalCost / totalRequests)}/回` : '-'} />
      </div>

      {/* Daily chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">日別トークン使用量（過去30日）</h3>
        {daily.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">データがありません</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {daily.map((d, i) => {
              const h = Math.max((d.total_tokens / maxDailyTokens) * 100, 2)
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                    {d.date}: {fmtTokens(d.total_tokens)} tokens / {fmtCost(d.estimated_cost_usd)}
                  </div>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${h}%`,
                      background: 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)',
                      minHeight: '2px',
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
        {daily.length > 0 && (
          <div className="flex justify-between mt-1 text-[10px] text-gray-400">
            <span>{daily[0]?.date?.slice(5)}</span>
            <span>{daily[daily.length - 1]?.date?.slice(5)}</span>
          </div>
        )}
      </div>

      {/* Monthly table */}
      {monthly.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">月別推移</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 font-medium">月</th>
                <th className="text-right py-2 font-medium">リクエスト</th>
                <th className="text-right py-2 font-medium">トークン</th>
                <th className="text-right py-2 font-medium">コスト (USD)</th>
                <th className="text-right py-2 font-medium">コスト (JPY)</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-2 font-medium">{m.month}</td>
                  <td className="py-2 text-right">{m.request_count}</td>
                  <td className="py-2 text-right">{fmtTokens(m.total_tokens)}</td>
                  <td className="py-2 text-right">{fmtCost(m.estimated_cost_usd)}</td>
                  <td className="py-2 text-right">{fmtJpy(m.estimated_cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent logs */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">最近のログ（{logsTotal}件中{logs.length}件）</h3>
        {logs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">ログがありません</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-xs py-2 border-b border-gray-50 last:border-0">
                <div className="text-gray-400 shrink-0 w-28">
                  {log.created_at?.replace('T', ' ').slice(0, 16)}
                </div>
                <div className="flex-1 min-w-0 text-gray-600 truncate">
                  {log.user_message || '-'}
                </div>
                <div className="shrink-0 text-right space-y-0.5">
                  <div className="text-gray-700 font-medium">{fmtTokens(log.total_tokens)}</div>
                  <div className="text-gray-400">{fmtCost(log.estimated_cost_usd)}</div>
                </div>
                {log.tool_calls > 0 && (
                  <div className="shrink-0 text-purple-500 bg-purple-50 rounded px-1.5 py-0.5 text-[10px]">
                    {log.tool_calls} tools
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-gray-800 mt-1">{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
    </div>
  )
}

// ── Main component ──

export default function AiAssistantPage() {
  const [tab, setTab] = useState<'chat' | 'usage'>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setMessages(JSON.parse(saved) as ChatMessage[])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

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
      if (res.success && res.data) setMessages([...updatedMessages, res.data])
      else setMessages([...updatedMessages, { role: 'assistant', content: `エラー: ${res.error || '不明なエラーが発生しました'}` }])
    } catch (err) {
      setMessages([...updatedMessages, { role: 'assistant', content: `通信エラー: ${err instanceof Error ? err.message : 'APIに接続できません'}` }])
    } finally { setLoading(false) }
  }, [messages, loading])

  const handleConfirm = useCallback(async (action: ChatMessage['confirmAction'], confirmed: boolean) => {
    if (!action) return
    if (!confirmed) { setMessages(prev => [...prev, { role: 'assistant', content: 'キャンセルしました。' }]); return }
    setLoading(true)
    try {
      const apiMessages = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await fetchApi<ApiResponse>('/api/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: apiMessages, confirmed: true, pendingAction: { toolName: action.toolName, toolInput: action.toolInput } }),
      })
      if (res.success && res.data) setMessages(prev => [...prev, res.data!])
      else setMessages(prev => [...prev, { role: 'assistant', content: `エラー: ${res.error || '実行に失敗しました'}` }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `通信エラー: ${err instanceof Error ? err.message : 'APIに接続できません'}` }])
    } finally { setLoading(false) }
  }, [messages])

  const clearChat = () => { setMessages([]); localStorage.removeItem(STORAGE_KEY) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-4xl mx-auto">
      {/* Header with tabs */}
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
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
          {tab === 'chat' && (
            <button onClick={clearChat} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              新しい会話
            </button>
          )}
        </div>
        <div className="flex px-4 gap-1">
          <button
            onClick={() => setTab('chat')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${tab === 'chat' ? 'bg-white border border-b-0 border-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
          >
            チャット
          </button>
          <button
            onClick={() => setTab('usage')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-colors ${tab === 'usage' ? 'bg-white border border-b-0 border-gray-200 text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
          >
            利用状況
          </button>
        </div>
      </div>

      {tab === 'usage' ? (
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <UsageDashboard />
        </div>
      ) : (
        <>
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
                    <button key={i} onClick={() => sendMessage(s)}
                      className="text-left text-sm px-4 py-3 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all text-gray-700">
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
                    {msg.confirmAction && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex-1">
                          {msg.confirmAction.description}
                        </div>
                        <button onClick={() => handleConfirm(msg.confirmAction, true)} disabled={loading}
                          className="px-4 py-2 text-xs font-medium text-white bg-[#06C755] rounded-lg hover:bg-[#05b34a] transition-colors disabled:opacity-50">
                          はい
                        </button>
                        <button onClick={() => handleConfirm(msg.confirmAction, false)} disabled={loading}
                          className="px-4 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                          いいえ
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

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
                ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..." disabled={loading} rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50 max-h-32"
                style={{ minHeight: '44px' }}
                onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px' }}
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30"
                style={{ background: input.trim() && !loading ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#d1d5db' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m-7 7l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SparklesIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
    </svg>
  )
}
