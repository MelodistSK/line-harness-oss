'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api, fetchApi } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'
import MediaUrlInput from '@/components/media-url-input'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chat {
  id: string
  friendId: string
  friendName: string
  friendPictureUrl: string | null
  operatorId: string | null
  status: 'unread' | 'in_progress' | 'resolved'
  notes: string | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

interface ChatMessage {
  id: string
  direction: 'incoming' | 'outgoing'
  messageType: string
  content: string
  createdAt: string
}

interface ChatDetail extends Chat {
  friendName: string
  friendPictureUrl: string | null
  messages?: ChatMessage[]
}

interface CarouselCard {
  title: string
  text: string
  imageUrl: string
  buttons: Array<{ label: string; type: 'message' | 'uri'; value: string }>
}

interface QuickReplyItem {
  label: string
  type: 'message' | 'uri'
  value: string
}

interface FormData { id: string; name: string; description: string | null }
interface TemplateData { id: string; name: string; category: string; messageType: string; messageContent: string }

type StatusFilter = 'all' | 'unread' | 'in_progress' | 'resolved'

const statusConfig: Record<Chat['status'], { label: string; className: string }> = {
  unread: { label: '未読', className: 'bg-red-100 text-red-700' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '解決済', className: 'bg-green-100 text-green-700' },
}

const statusFilters: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全て' },
  { key: 'unread', label: '未読' },
  { key: 'in_progress', label: '対応中' },
  { key: 'resolved', label: '解決済' },
]

const MESSAGE_TYPES = [
  { value: 'text', label: 'テキスト' },
  { value: 'image', label: '画像' },
  { value: 'flex', label: 'Flex' },
  { value: 'carousel', label: 'カルーセル' },
  { value: 'video', label: '動画' },
  { value: 'form', label: 'フォーム' },
  { value: 'booking', label: '予約' },
]

function formatDatetime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID || '').trim()

function generateFormFlex(form: FormData): string {
  const liffUrl = `https://liff.line.me/${LIFF_ID}?page=form&id=${form.id}`
  return JSON.stringify({
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: form.name, weight: 'bold', size: 'lg', wrap: true },
      ...(form.description ? [{ type: 'text', text: form.description, color: '#666666', size: 'sm', wrap: true, margin: 'md' }] : []),
    ] },
    footer: { type: 'box', layout: 'vertical', contents: [
      { type: 'button', action: { type: 'uri', label: 'フォームに回答する', uri: liffUrl }, style: 'primary', color: '#06C755' },
    ] },
  }, null, 2)
}

function generateBookingFlex(serviceId?: string, serviceName?: string): string {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://line-harness-mamayoro.s-kamiya.workers.dev').trim()
  const liffUrl = serviceId ? `${apiUrl}/liff/booking?serviceId=${serviceId}` : `${apiUrl}/liff/booking`
  const title = serviceName ? `${serviceName}のご予約` : 'ご予約はこちら'
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
        { type: 'text', text: 'ご都合の良い日時をお選びください', color: '#666666', size: 'sm', wrap: true, margin: 'md' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'button', action: { type: 'uri', label: '予約する', uri: liffUrl }, style: 'primary', color: '#06C755' },
      ],
    },
  }, null, 2)
}

function buildFinalContent(messageType: string, content: string, qrItems: QuickReplyItem[]): string {
  const hasQR = qrItems.length > 0
  if (messageType === 'text') {
    if (hasQR) return JSON.stringify({ _text: content, _quickReply: qrItems })
    return content
  }
  if (hasQR) {
    try { const parsed = JSON.parse(content); return JSON.stringify({ ...parsed, _quickReply: qrItems }) } catch {}
  }
  return content
}

function getFinalMessageType(uiType: string): string {
  return uiType === 'form' ? 'flex' : uiType === 'booking' ? 'flex' : uiType
}

const ccPrompts = [
  { title: 'チャット対応テンプレート', prompt: 'チャット対応で使えるテンプレートメッセージを作成してください。' },
  { title: '未対応チャット確認', prompt: '未対応のチャットを確認し、対応優先度を整理してください。' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

interface FriendItem { id: string; displayName: string; pictureUrl: string | null; isFollowing: boolean }
interface MessageLog { id: string; direction: 'incoming' | 'outgoing'; messageType: string; content: string; createdAt: string }

function DirectMessagePanel({ friendId, friend, onBack }: {
  friendId: string; friend: FriendItem | null; onBack: () => void; onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loadingMessages, setLoadingMessages] = useState(true)

  useEffect(() => {
    setLoadingMessages(true)
    fetchApi<{ success: boolean; data: MessageLog[] }>(`/api/friends/${friendId}/messages`)
      .then(res => { if (res.success) setMessages(res.data) })
      .catch(() => {})
      .finally(() => setLoadingMessages(false))
  }, [friendId])

  const handleSend = async () => {
    if (!message.trim() || sending) return
    setSending(true)
    try {
      await fetchApi(`/api/friends/${friendId}/messages`, { method: 'POST', body: JSON.stringify({ content: message, messageType: 'text' }) })
      setMessages(prev => [...prev, { id: crypto.randomUUID(), direction: 'outgoing', messageType: 'text', content: message, createdAt: new Date().toISOString() }])
      setMessage('')
    } catch (err) { alert(`送信エラー: ${err instanceof Error ? err.message : String(err)}`) }
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-gray-200 flex items-center gap-3">
        <button onClick={onBack} className="lg:hidden text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        {friend?.pictureUrl ? <img src={friend.pictureUrl} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"><span className="text-gray-500 text-xs">{(friend?.displayName || '?').charAt(0)}</span></div>}
        <div><p className="text-sm font-bold text-gray-900">{friend?.displayName || '不明'}</p><p className="text-xs text-gray-400">メッセージ履歴</p></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingMessages ? <p className="text-center text-gray-400 text-sm">読み込み中...</p> : messages.length === 0 ? <p className="text-center text-gray-400 text-sm">メッセージ履歴がありません</p> : messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[75%] rounded-2xl px-4 py-2" style={msg.direction === 'outgoing' ? { backgroundColor: '#06C755', color: 'white' } : { backgroundColor: 'white', color: '#111827' }}>
              <p className="text-sm whitespace-pre-wrap break-words">{msg.messageType === 'text' ? msg.content : `[${msg.messageType}]`}</p>
              <p className="text-xs mt-1" style={msg.direction === 'outgoing' ? { color: 'rgba(255,255,255,0.7)' } : { color: '#9ca3af' }}>{new Date(msg.createdAt).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input type="text" value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} placeholder="メッセージを入力..." className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <button onClick={handleSend} disabled={!message.trim() || sending} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>{sending ? '...' : '送信'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Carousel Builder (compact) ────────────────────────────────────────────────

function CarouselBuilder({ cards, onChange }: { cards: CarouselCard[]; onChange: (c: CarouselCard[]) => void }) {
  const addCard = () => onChange([...cards, { title: '', text: '', imageUrl: '', buttons: [] }])
  const removeCard = (i: number) => onChange(cards.filter((_, idx) => idx !== i))
  const updateCard = (i: number, patch: Partial<CarouselCard>) => onChange(cards.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const addButton = (ci: number) => { if (cards[ci].buttons.length >= 3) return; updateCard(ci, { buttons: [...cards[ci].buttons, { label: '', type: 'message', value: '' }] }) }
  const updateButton = (ci: number, bi: number, patch: Partial<CarouselCard['buttons'][0]>) => updateCard(ci, { buttons: cards[ci].buttons.map((b, idx) => idx === bi ? { ...b, ...patch } : b) })
  const removeButton = (ci: number, bi: number) => updateCard(ci, { buttons: cards[ci].buttons.filter((_, idx) => idx !== bi) })

  return (
    <div className="space-y-2">
      {cards.map((card, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1.5 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-500">カード {i + 1}</span>
            <button onClick={() => removeCard(i)} className="text-[10px] text-red-400 hover:text-red-600">削除</button>
          </div>
          <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="タイトル" value={card.title} onChange={e => updateCard(i, { title: e.target.value })} />
          <input className="w-full border border-gray-300 rounded px-2 py-1 text-xs" placeholder="説明文" value={card.text} onChange={e => updateCard(i, { text: e.target.value })} />
          <MediaUrlInput accept="image" placeholder="画像URL (省略可)" value={card.imageUrl} onChange={url => updateCard(i, { imageUrl: url })} />
          <div className="space-y-1">
            {card.buttons.map((btn, bi) => (
              <div key={bi} className="flex gap-1 items-center">
                <input className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-[10px]" placeholder="ラベル" value={btn.label} onChange={e => updateButton(i, bi, { label: e.target.value })} />
                <select className="border border-gray-300 rounded px-1 py-0.5 text-[10px]" value={btn.type} onChange={e => updateButton(i, bi, { type: e.target.value as 'message' | 'uri' })}>
                  <option value="message">テキスト</option><option value="uri">URL</option>
                </select>
                <input className="flex-1 border border-gray-300 rounded px-1.5 py-0.5 text-[10px]" placeholder={btn.type === 'uri' ? 'https://...' : '送信テキスト'} value={btn.value} onChange={e => updateButton(i, bi, { value: e.target.value })} />
                <button onClick={() => removeButton(i, bi)} className="text-red-400 text-[10px] px-0.5">✕</button>
              </div>
            ))}
            {card.buttons.length < 3 && <button onClick={() => addButton(i)} className="text-[10px] text-green-600">+ ボタン</button>}
          </div>
        </div>
      ))}
      <button onClick={addCard} disabled={cards.length >= 10} className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-40">+ カード追加</button>
    </div>
  )
}

// ── Quick Reply Editor ────────────────────────────────────────────────────────

// ── Chat Message Composer ─────────────────────────────────────────────────────

function ChatComposer({ onSend, sending }: { onSend: (msgType: string, content: string) => Promise<void>; sending: boolean }) {
  const [msgType, setMsgType] = useState('text')
  const [content, setContent] = useState('')
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([{ title: '', text: '', imageUrl: '', buttons: [] }])
  const [formsList, setFormsList] = useState<FormData[]>([])
  const [selectedFormId, setSelectedFormId] = useState('')
  const [templatesList, setTemplatesList] = useState<TemplateData[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [bookingServices, setBookingServices] = useState<{ id: string; name: string }[]>([])
  const [selectedBookingServiceId, setSelectedBookingServiceId] = useState('')

  useEffect(() => { api.forms.list().then(r => { if (r.success) setFormsList(r.data) }).catch(() => {}) }, [])
  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
    fetch(`${API_URL}/api/calendar/services`, { headers: { Authorization: `Bearer ${apiKey}` } })
      .then(r => r.json()).then((json: { success?: boolean; data?: { id: string; name: string; isActive: boolean }[] }) => {
        if (json.success && Array.isArray(json.data)) {
          const active = json.data.filter(s => s.isActive)
          setBookingServices(active)
          if (active.length === 1) setSelectedBookingServiceId(active[0].id)
        }
      }).catch(() => {})
  }, [])
  useEffect(() => { if (showTemplateModal) api.templates.list().then(r => { if (r.success) setTemplatesList(r.data) }).catch(() => {}) }, [showTemplateModal])
  useEffect(() => {
    if (msgType === 'booking') {
      const svc = bookingServices.find(s => s.id === selectedBookingServiceId)
      setContent(generateBookingFlex(selectedBookingServiceId || undefined, svc?.name))
    }
  }, [msgType, selectedBookingServiceId, bookingServices])
  useEffect(() => {
    if (msgType === 'form' && selectedFormId) {
      const found = formsList.find(f => f.id === selectedFormId)
      if (found) setContent(generateFormFlex(found))
    }
  }, [selectedFormId, msgType, formsList])

  const getDisplayContent = () => {
    if (msgType === 'carousel') return JSON.stringify({ cards: carouselCards })
    return content
  }

  const handleSend = async () => {
    const displayContent = getDisplayContent()
    if (!displayContent.trim()) return
    const finalType = getFinalMessageType(msgType)
    const finalContent = buildFinalContent(finalType, displayContent, [])
    await onSend(finalType, finalContent)
    setContent('')
    setCarouselCards([{ title: '', text: '', imageUrl: '', buttons: [] }])
    setSelectedFormId('')
    setMsgType('text')
  }

  const handleInsertTemplate = (tpl: TemplateData) => {
    setMsgType(tpl.messageType)
    setContent(tpl.messageContent)
    if (tpl.messageType === 'carousel') {
      try { setCarouselCards(JSON.parse(tpl.messageContent).cards ?? []) } catch {}
    }
    setShowTemplateModal(false)
  }

  return (
    <div className="border-t border-gray-200 px-4 py-3 space-y-2">
      {/* Type tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {MESSAGE_TYPES.map(t => (
          <button key={t.value} onClick={() => setMsgType(t.value)} className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${msgType === t.value ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t.label}</button>
        ))}
        <button onClick={() => setShowTemplateModal(true)} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          テンプレート
        </button>
      </div>

      {/* Content area */}
      {msgType === 'text' && (
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder="メッセージを入力..." className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-green-500" />
      )}

      {msgType === 'image' && (() => {
        let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
        try { parsed = JSON.parse(content) } catch {}
        return (
          <div className="space-y-2">
            <MediaUrlInput accept="image" label="画像URL" placeholder="https://example.com/image.png" value={parsed.originalContentUrl ?? ''} onChange={url => setContent(JSON.stringify({ originalContentUrl: url, previewImageUrl: url }))} />
          </div>
        )
      })()}

      {msgType === 'video' && (() => {
        let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
        try { parsed = JSON.parse(content) } catch {}
        return (
          <div className="space-y-2">
            <MediaUrlInput accept="video" label="動画URL" placeholder="https://example.com/video.mp4" value={parsed.originalContentUrl ?? ''} onChange={url => setContent(JSON.stringify({ originalContentUrl: url, previewImageUrl: parsed.previewImageUrl ?? '' }))} />
            <MediaUrlInput accept="image" label="プレビュー画像URL" placeholder="https://example.com/preview.jpg" value={parsed.previewImageUrl ?? ''} onChange={url => setContent(JSON.stringify({ originalContentUrl: parsed.originalContentUrl ?? '', previewImageUrl: url }))} />
            <p className="text-xs text-gray-400">空欄の場合は動画URLが使用されます</p>
          </div>
        )
      })()}

      {msgType === 'flex' && (
        <div className="space-y-2">
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={6} placeholder={'{"type":"bubble","body":{...}}'} className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-green-500" />
          {content && (() => { try { JSON.parse(content); return <FlexPreviewComponent content={content} maxWidth={280} /> } catch { return <p className="text-xs text-red-500">JSON が無効です</p> } })()}
        </div>
      )}

      {msgType === 'carousel' && <CarouselBuilder cards={carouselCards} onChange={setCarouselCards} />}

      {msgType === 'booking' && (
        <div className="space-y-2">
          {bookingServices.length > 1 && (
            <select value={selectedBookingServiceId} onChange={e => setSelectedBookingServiceId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">サービスを選択（全メニュー表示）</option>
              {bookingServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {!LIFF_ID && <p className="text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded border border-yellow-200">NEXT_PUBLIC_LIFF_ID が未設定です</p>}
          {content && (() => { try { JSON.parse(content); return <FlexPreviewComponent content={content} maxWidth={280} /> } catch { return null } })()}
        </div>
      )}

      {msgType === 'form' && (
        <div className="space-y-2">
          <select value={selectedFormId} onChange={e => setSelectedFormId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">フォームを選択...</option>
            {formsList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {content && (() => { try { JSON.parse(content); return <FlexPreviewComponent content={content} maxWidth={280} /> } catch { return null } })()}
        </div>
      )}

      {/* Send */}
      <div className="flex justify-end">
        <button onClick={handleSend} disabled={sending || !getDisplayContent().trim()} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>{sending ? '送信中...' : '送信'}</button>
      </div>

      {showTemplateModal && <TemplateModal templates={templatesList} onSelect={handleInsertTemplate} onClose={() => setShowTemplateModal(false)} />}
    </div>
  )
}

// ── Template Modal ────────────────────────────────────────────────────────────

function TemplateModal({ templates, onSelect, onClose }: { templates: TemplateData[]; onSelect: (t: TemplateData) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">テンプレートから挿入</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {templates.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">テンプレートがありません</p> : templates.map(tpl => (
            <button key={tpl.id} onClick={() => onSelect(tpl)} className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <p className="text-sm font-medium text-gray-800">{tpl.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{tpl.messageType} | {tpl.category}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ChatsPage() {
  const { selectedAccountId } = useAccount()
  const [chats, setChats] = useState<Chat[]>([])
  const [allFriends, setAllFriends] = useState<FriendItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const loadChats = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params: { status?: string; accountId?: string } = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (selectedAccountId) params.accountId = selectedAccountId
      const [chatRes, friendRes] = await Promise.allSettled([api.chats.list(params), api.friends.list({ accountId: selectedAccountId || undefined, limit: '800' })])
      if (chatRes.status === 'fulfilled' && chatRes.value.success) setChats(chatRes.value.data as unknown as Chat[])
      if (friendRes.status === 'fulfilled' && friendRes.value.success) setAllFriends((friendRes.value.data as unknown as { items: FriendItem[] }).items)
    } catch { setError('チャットの読み込みに失敗しました。') }
    finally { setLoading(false) }
  }, [statusFilter, selectedAccountId])

  const loadChatDetail = useCallback(async (chatId: string) => {
    setDetailLoading(true)
    try {
      const res = await api.chats.get(chatId)
      if (res.success) { setChatDetail(res.data as unknown as ChatDetail); setNotes((res.data as unknown as ChatDetail).notes || '') }
    } catch { setError('チャット詳細の読み込みに失敗しました。') }
    finally { setDetailLoading(false) }
  }, [])

  useEffect(() => { loadChats() }, [loadChats])
  useEffect(() => { if (selectedChatId) loadChatDetail(selectedChatId); else setChatDetail(null) }, [selectedChatId, loadChatDetail])
  useEffect(() => { if (chatDetail?.messages?.length) scrollToBottom() }, [chatDetail?.messages?.length, scrollToBottom])

  const handleSendMessage = async (msgType: string, content: string) => {
    if (!selectedChatId) return
    setSending(true)
    try {
      await api.chats.send(selectedChatId, { content, messageType: msgType })
      loadChatDetail(selectedChatId)
      loadChats()
    } catch (err) { setError(`メッセージの送信に失敗しました: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setSending(false) }
  }

  const handleStatusUpdate = async (newStatus: Chat['status']) => {
    if (!selectedChatId) return
    try { await api.chats.update(selectedChatId, { status: newStatus }); loadChatDetail(selectedChatId); loadChats() }
    catch { setError('ステータスの更新に失敗しました。') }
  }

  const handleSaveNotes = async () => {
    if (!selectedChatId) return
    setSavingNotes(true)
    try { await api.chats.update(selectedChatId, { notes }); loadChatDetail(selectedChatId) }
    catch { setError('メモの保存に失敗しました。') }
    finally { setSavingNotes(false) }
  }

  return (
    <div>
      <Header title="オペレーターチャット" />
      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="flex gap-4 h-[calc(100vh-120px)] lg:h-[calc(100vh-180px)]">
        {/* Left Panel: Chat List */}
        <div className={`w-full lg:w-96 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex border-b border-gray-200">
            {statusFilters.map(filter => (
              <button key={filter.key} onClick={() => { setStatusFilter(filter.key); setSelectedChatId(null) }}
                className={`flex-1 px-3 py-2.5 min-h-[44px] text-xs font-medium transition-colors ${statusFilter === filter.key ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                style={statusFilter === filter.key ? { backgroundColor: '#06C755' } : undefined}>{filter.label}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? [...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 border-b border-gray-100 animate-pulse"><div className="flex items-center gap-3"><div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-32" /><div className="h-2 bg-gray-100 rounded w-20" /></div><div className="h-5 bg-gray-100 rounded-full w-12" /></div></div>
            )) : chats.map(chat => {
              const statusInfo = statusConfig[chat.status]
              return (
                <button key={chat.id} onClick={() => { setSelectedFriendId(null); setSelectedChatId(chat.id) }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${selectedChatId === chat.id && !selectedFriendId ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    {chat.friendPictureUrl ? <img src={chat.friendPictureUrl} alt="" className="w-10 h-10 rounded-full flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"><span className="text-gray-500 text-sm">{chat.friendName.charAt(0)}</span></div>}
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900 truncate">{chat.friendName}</p><p className="text-xs text-gray-400 mt-0.5">{formatDatetime(chat.lastMessageAt)}</p></div>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusInfo.className}`}>{statusInfo.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right Panel: Chat Detail */}
        <div className={`flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex-col overflow-hidden ${selectedChatId || selectedFriendId ? 'flex' : 'hidden lg:flex'}`}>
          {selectedFriendId && !selectedChatId ? (
            <DirectMessagePanel friendId={selectedFriendId} friend={allFriends.find(f => f.id === selectedFriendId) || null} onBack={() => setSelectedFriendId(null)} onSent={() => { setSelectedFriendId(null); loadChats() }} />
          ) : !selectedChatId ? (
            <div className="flex-1 flex items-center justify-center"><p className="text-gray-400 text-sm">チャットを選択してください</p></div>
          ) : detailLoading ? (
            <div className="flex-1 flex items-center justify-center"><p className="text-gray-400 text-sm">読み込み中...</p></div>
          ) : chatDetail ? (
            <>
              {/* Chat Header */}
              <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setSelectedChatId(null)} className="lg:hidden flex-shrink-0 p-1 -ml-1 text-gray-500 hover:text-gray-700" aria-label="戻る">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  {chatDetail.friendPictureUrl && <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{chatDetail.friendName}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${statusConfig[chatDetail.status].className}`}>{statusConfig[chatDetail.status].label}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {chatDetail.status !== 'unread' && <button onClick={() => handleStatusUpdate('unread')} className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md">未読に戻す</button>}
                  {chatDetail.status !== 'in_progress' && <button onClick={() => handleStatusUpdate('in_progress')} className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-md">対応中にする</button>}
                  {chatDetail.status !== 'resolved' && <button onClick={() => handleStatusUpdate('resolved')} className="px-3 py-1 min-h-[44px] lg:min-h-0 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-md">解決済にする</button>}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ backgroundColor: '#7494C0' }}>
                {(!chatDetail.messages || chatDetail.messages.length === 0) ? (
                  <div className="text-center py-8"><p className="text-white/60 text-sm">メッセージはまだありません。</p></div>
                ) : chatDetail.messages.map(msg => {
                  const isOutgoing = msg.direction === 'outgoing'
                  let bubbleContent: React.ReactNode
                  if (msg.messageType === 'flex' || msg.messageType === 'carousel') {
                    bubbleContent = <div className="max-w-[300px]"><FlexPreviewComponent content={msg.content} maxWidth={280} /></div>
                  } else if (msg.messageType === 'image') {
                    try { const p = JSON.parse(msg.content); bubbleContent = <img src={p.originalContentUrl || p.previewImageUrl} alt="" className="max-w-[200px] rounded" /> }
                    catch { bubbleContent = <span>[画像]</span> }
                  } else if (msg.messageType === 'video') {
                    bubbleContent = <span>[動画]</span>
                  } else {
                    bubbleContent = <span>{msg.content}</span>
                  }
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
                      {!isOutgoing && (chatDetail.friendPictureUrl ? <img src={chatDetail.friendPictureUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mb-1" /> : <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 mb-1" />)}
                      <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[320px] px-3 py-2 text-sm break-words whitespace-pre-wrap ${isOutgoing ? 'rounded-tl-2xl rounded-tr-md rounded-bl-2xl rounded-br-2xl' : 'rounded-tl-md rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'}`}
                          style={isOutgoing ? { backgroundColor: '#06C755', color: 'white' } : { backgroundColor: 'white', color: '#111827' }}>{bubbleContent}</div>
                        <span className="text-xs text-white/50 mt-0.5 px-1">{new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Notes */}
              <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center gap-2">
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="メモを入力..." className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-500" />
                  <button onClick={handleSaveNotes} disabled={savingNotes} className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50">{savingNotes ? '保存中...' : 'メモ保存'}</button>
                </div>
              </div>

              {/* Rich Message Composer */}
              <ChatComposer onSend={handleSendMessage} sending={sending} />
            </>
          ) : null}
        </div>
      </div>
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
