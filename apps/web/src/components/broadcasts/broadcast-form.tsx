'use client'

import { useState, useEffect } from 'react'
import type { Tag } from '@line-crm/shared'
import { api, type ApiBroadcast } from '@/lib/api'
import FlexPreviewComponent from '@/components/flex-preview'
import MediaUrlInput from '@/components/media-url-input'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BroadcastFormProps {
  tags: Tag[]
  onSuccess: () => void
  onCancel: () => void
  editBroadcast?: ApiBroadcast | null
  readOnly?: boolean
}

interface QuickReplyItem {
  label: string
  type: 'message' | 'uri'
  value: string
}

interface CarouselCard {
  title: string
  text: string
  imageUrl: string
  buttons: Array<{ label: string; type: 'message' | 'uri'; value: string }>
}

interface FormData {
  id: string
  name: string
  description: string | null
}

interface FriendData {
  id: string
  displayName: string | null
  lineUserId: string
}

interface TemplateData {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID || '').trim()

function generateFormFlex(form: FormData): string {
  const liffUrl = `https://liff.line.me/${LIFF_ID}?page=form&id=${form.id}`
  const flex = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: form.name, weight: 'bold', size: 'lg', wrap: true },
        ...(form.description ? [{ type: 'text', text: form.description, color: '#666666', size: 'sm', wrap: true, margin: 'md' }] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: { type: 'uri', label: 'フォームに回答する', uri: liffUrl },
          style: 'primary',
          color: '#06C755',
        },
      ],
    },
  }
  return JSON.stringify(flex, null, 2)
}

function generateBookingFlex(): string {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://line-harness-mamayoro.s-kamiya.workers.dev').trim()
  const liffUrl = `${apiUrl}/liff/booking`
  return JSON.stringify({
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', contents: [
        { type: 'text', text: 'ご予約はこちら', weight: 'bold', size: 'lg', wrap: true },
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

/** Apply sample variable substitution for preview only */
function applyVariablePreview(content: string): string {
  return content
    .replace(/\{\{name\}\}/g, '田中太郎')
    .replace(/\{\{uid\}\}/g, 'U1a2b3c4d5e6f')
    .replace(/\{\{score\}\}/g, '85')
    .replace(/\{\{friend_id\}\}/g, 'f-1234-5678')
    .replace(/\{\{ref\}\}/g, 'REF001')
    .replace(/\{\{#if_ref\}\}[\s\S]*?\{\{\/if_ref\}\}/g, '')
    .replace(/\{\{auth_url:[^}]+\}\}/g, 'https://liff.line.me/...')
}

/** Build the final messageContent string combining content + quick reply */
function buildFinalContent(messageType: string, content: string, qrItems: QuickReplyItem[]): string {
  const hasQR = qrItems.length > 0
  if (messageType === 'text') {
    if (hasQR) return JSON.stringify({ _text: content, _quickReply: qrItems })
    return content
  }
  if (hasQR) {
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify({ ...parsed, _quickReply: qrItems })
    } catch { /* invalid json */ }
  }
  return content
}

/** Get the actual saved messageType (form → flex) */
function getFinalMessageType(uiType: string): string {
  if (uiType === 'form') return 'flex'
  if (uiType === 'booking') return 'flex'
  return uiType
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FlexPreviewSection({ content }: { content: string }) {
  if (!content) return null
  const preview = applyVariablePreview(content)
  try { JSON.parse(preview) } catch {
    return <p className="text-xs text-red-500 mt-2">JSON parse error</p>
  }
  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <p className="text-xs font-medium text-gray-500 mb-2">Flex プレビュー {/\{\{/.test(content) && <span className="text-blue-500">(変数はサンプル値)</span>}</p>
      <FlexPreviewComponent content={preview} maxWidth={300} />
    </div>
  )
}

function CarouselBuilder({ cards, onChange }: { cards: CarouselCard[]; onChange: (c: CarouselCard[]) => void }) {
  const addCard = () => onChange([...cards, { title: '', text: '', imageUrl: '', buttons: [] }])
  const removeCard = (i: number) => onChange(cards.filter((_, idx) => idx !== i))
  const updateCard = (i: number, patch: Partial<CarouselCard>) => {
    const updated = cards.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onChange(updated)
  }
  const addButton = (i: number) => {
    const card = cards[i]
    if (card.buttons.length >= 3) return
    updateCard(i, { buttons: [...card.buttons, { label: '', type: 'message', value: '' }] })
  }
  const updateButton = (ci: number, bi: number, patch: Partial<CarouselCard['buttons'][0]>) => {
    const card = cards[ci]
    const btns = card.buttons.map((b, idx) => idx === bi ? { ...b, ...patch } : b)
    updateCard(ci, { buttons: btns })
  }
  const removeButton = (ci: number, bi: number) => {
    updateCard(ci, { buttons: cards[ci].buttons.filter((_, idx) => idx !== bi) })
  }

  return (
    <div className="space-y-3">
      {cards.map((card, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-600">カード {i + 1}</span>
            <button onClick={() => removeCard(i)} className="text-xs text-red-400 hover:text-red-600">削除</button>
          </div>
          <input
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder="タイトル"
            value={card.title}
            onChange={e => updateCard(i, { title: e.target.value })}
          />
          <input
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder="説明文"
            value={card.text}
            onChange={e => updateCard(i, { text: e.target.value })}
          />
          <MediaUrlInput accept="image" placeholder="画像URL (省略可)" value={card.imageUrl} onChange={url => updateCard(i, { imageUrl: url })} />
          <div className="space-y-1">
            {card.buttons.map((btn, bi) => (
              <div key={bi} className="flex gap-1 items-center">
                <input
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="ラベル"
                  value={btn.label}
                  onChange={e => updateButton(i, bi, { label: e.target.value })}
                />
                <select
                  className="border border-gray-300 rounded px-1 py-1 text-xs"
                  value={btn.type}
                  onChange={e => updateButton(i, bi, { type: e.target.value as 'message' | 'uri' })}
                >
                  <option value="message">テキスト</option>
                  <option value="uri">URL</option>
                </select>
                <input
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder={btn.type === 'uri' ? 'https://...' : '送信テキスト'}
                  value={btn.value}
                  onChange={e => updateButton(i, bi, { value: e.target.value })}
                />
                <button onClick={() => removeButton(i, bi)} className="text-red-400 text-xs px-1">✕</button>
              </div>
            ))}
            {card.buttons.length < 3 && (
              <button onClick={() => addButton(i)} className="text-xs text-green-600 hover:text-green-700">+ ボタン追加</button>
            )}
          </div>
        </div>
      ))}
      {cards.length < 10 && (
        <button
          onClick={addCard}
          className="w-full py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-green-400 hover:text-green-600 transition-colors"
        >
          + カード追加
        </button>
      )}
    </div>
  )
}

function QuickReplyBuilder({ items, onChange }: { items: QuickReplyItem[]; onChange: (items: QuickReplyItem[]) => void }) {
  const add = () => onChange([...items, { label: '', type: 'message', value: '' }])
  const update = (i: number, patch: Partial<QuickReplyItem>) =>
    onChange(items.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input
            className="w-24 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder="ラベル(20字)"
            maxLength={20}
            value={item.label}
            onChange={e => update(i, { label: e.target.value })}
          />
          <select
            className="border border-gray-300 rounded px-1 py-1 text-xs"
            value={item.type}
            onChange={e => update(i, { type: e.target.value as 'message' | 'uri' })}
          >
            <option value="message">テキスト</option>
            <option value="uri">URL</option>
          </select>
          <input
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            placeholder={item.type === 'uri' ? 'https://...' : '送信テキスト'}
            value={item.value}
            onChange={e => update(i, { value: e.target.value })}
          />
          <button onClick={() => remove(i)} className="text-red-400 text-xs px-1">✕</button>
        </div>
      ))}
      {items.length < 13 && (
        <button onClick={add} className="text-xs text-green-600 hover:text-green-700">+ 選択肢追加</button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface FormState {
  title: string
  messageType: string
  messageContent: string
  targetType: ApiBroadcast['targetType']
  targetTagId: string
  scheduledAt: string
  sendNow: boolean
}

const MESSAGE_TYPES = [
  { value: 'text', label: 'テキスト' },
  { value: 'image', label: '画像' },
  { value: 'flex', label: 'Flex' },
  { value: 'form', label: 'フォーム' },
  { value: 'booking', label: '予約' },
  { value: 'carousel', label: 'カルーセル' },
  { value: 'video', label: '動画' },
]

export default function BroadcastForm({ tags, onSuccess, onCancel, editBroadcast, readOnly }: BroadcastFormProps) {
  const isEdit = !!editBroadcast?.id

  // Resolve initial messageType — forms stored as 'flex' need special handling
  const initMsgType = editBroadcast?.messageType ?? 'text'
  const initContent = editBroadcast?.messageContent ?? ''

  const [form, setForm] = useState<FormState>({
    title: editBroadcast?.title ?? '',
    messageType: initMsgType,
    messageContent: initContent,
    targetType: editBroadcast?.targetType ?? 'all',
    targetTagId: editBroadcast?.targetTagId ?? '',
    scheduledAt: editBroadcast?.scheduledAt ? editBroadcast.scheduledAt.slice(0, 16) : '',
    sendNow: editBroadcast ? !editBroadcast.scheduledAt : true,
  })

  const initCarousel = (() => {
    if (initMsgType === 'carousel') {
      try { return JSON.parse(initContent).cards ?? [] } catch { return [] }
    }
    return [{ title: '', text: '', imageUrl: '', buttons: [] }]
  })()
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>(initCarousel)
  const [quickReplyEnabled, setQuickReplyEnabled] = useState(false)
  const [quickReplyItems, setQuickReplyItems] = useState<QuickReplyItem[]>([])

  const [formsList, setFormsList] = useState<FormData[]>([])
  const [selectedFormId, setSelectedFormId] = useState('')

  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templatesList, setTemplatesList] = useState<TemplateData[]>([])

  const [showTestSend, setShowTestSend] = useState(false)
  const [friendsList, setFriendsList] = useState<FriendData[]>([])
  const [testFriendId, setTestFriendId] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testSendResult, setTestSendResult] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load forms list
  useEffect(() => {
    api.forms.list().then(res => {
      if (res.success) setFormsList(res.data)
    }).catch(() => {})
  }, [])

  // Load templates when modal opens
  useEffect(() => {
    if (showTemplateModal) {
      api.templates.list().then(res => {
        if (res.success) setTemplatesList(res.data)
      }).catch(() => {})
    }
  }, [showTemplateModal])

  // Load friends when test send modal opens
  useEffect(() => {
    if (showTestSend) {
      api.friends.list({ limit: '100' }).then(res => {
        if (res.success) {
          setFriendsList(res.data.items.map(f => ({
            id: f.id,
            displayName: f.displayName,
            lineUserId: f.lineUserId,
          })))
        }
      }).catch(() => {})
    }
  }, [showTestSend])

  // When booking type is selected, auto-generate Flex JSON
  useEffect(() => {
    if (form.messageType === 'booking') {
      setForm(prev => ({ ...prev, messageContent: generateBookingFlex() }))
    }
  }, [form.messageType])

  // When a form is selected, auto-generate Flex JSON
  useEffect(() => {
    if (form.messageType === 'form' && selectedFormId) {
      const found = formsList.find(f => f.id === selectedFormId)
      if (found) {
        setForm(prev => ({ ...prev, messageContent: generateFormFlex(found) }))
      }
    }
  }, [selectedFormId, form.messageType, formsList])

  const getDisplayContent = () => {
    if (form.messageType === 'carousel') {
      return JSON.stringify({ cards: carouselCards }, null, 2)
    }
    return form.messageContent
  }

  const handleSave = async () => {
    if (!form.title.trim()) { setError('配信タイトルを入力してください'); return }
    const content = getDisplayContent()
    if (!content.trim()) { setError('メッセージ内容を入力してください'); return }
    if (!form.sendNow && !form.scheduledAt) {
      setError('予約配信の場合は配信日時を指定してください'); return
    }
    const finalType = getFinalMessageType(form.messageType)
    const finalContent = buildFinalContent(finalType, content, quickReplyEnabled ? quickReplyItems : [])
    if (['flex', 'image', 'carousel', 'video'].includes(finalType)) {
      try { JSON.parse(finalContent) } catch { setError('JSON形式が無効です'); return }
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        title: form.title,
        messageType: finalType as ApiBroadcast['messageType'],
        messageContent: finalContent,
        targetType: form.targetType,
        targetTagId: form.targetType === 'tag' ? form.targetTagId || null : null,
        scheduledAt: form.sendNow || !form.scheduledAt ? null : form.scheduledAt + ':00.000+09:00',
      }
      const res = isEdit
        ? await api.broadcasts.update(editBroadcast!.id, payload)
        : await api.broadcasts.create({ ...payload, status: 'draft' })
      if (res.success) {
        onSuccess()
      } else {
        setError(res.error)
      }
    } catch {
      setError(isEdit ? '更新に失敗しました' : '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSend = async () => {
    if (!testFriendId) return
    const content = getDisplayContent()
    if (!content.trim()) { setTestSendResult('メッセージ内容が空です'); return }
    const finalType = getFinalMessageType(form.messageType)
    const finalContent = buildFinalContent(finalType, content, quickReplyEnabled ? quickReplyItems : [])
    setTestSending(true)
    setTestSendResult('')
    try {
      const res = await api.friends.sendMessage(testFriendId, {
        content: finalContent,
        messageType: finalType,
      })
      setTestSendResult(res.success ? '送信しました！' : `エラー: ${res.error}`)
    } catch {
      setTestSendResult('送信に失敗しました')
    } finally {
      setTestSending(false)
    }
  }

  const handleInsertTemplate = (tpl: TemplateData) => {
    setForm(prev => ({ ...prev, messageType: tpl.messageType, messageContent: tpl.messageContent }))
    if (tpl.messageType === 'carousel') {
      try { setCarouselCards(JSON.parse(tpl.messageContent).cards ?? []) } catch { /* ignore */ }
    }
    setShowTemplateModal(false)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-5">
        {readOnly ? '配信詳細（閲覧のみ）' : isEdit ? '配信を編集' : '新規配信を作成'}
      </h2>

      <div className="space-y-4 max-w-xl">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            配信タイトル <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="例: 3月のキャンペーン告知"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
        </div>

        {/* Message type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">メッセージ種別</label>
          <div className="flex flex-wrap gap-2">
            {MESSAGE_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, messageType: t.value, messageContent: '' })}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  form.messageType === t.value
                    ? 'border-green-500 text-green-700 bg-green-50'
                    : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message content by type */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-600">
              メッセージ内容 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              テンプレートから挿入
            </button>
          </div>

          {/* ── Booking ── */}
          {form.messageType === 'booking' && (
            <div className="space-y-2 mb-2">
              {!LIFF_ID && (
                <p className="text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded border border-yellow-200">
                  NEXT_PUBLIC_LIFF_ID が未設定です
                </p>
              )}
              {form.messageContent && (() => { try { JSON.parse(form.messageContent); return <FlexPreviewComponent content={form.messageContent} maxWidth={280} /> } catch { return null } })()}
            </div>
          )}

          {/* ── Form picker ── */}
          {form.messageType === 'form' && (
            <div className="space-y-2 mb-2">
              {!LIFF_ID && (
                <p className="text-xs text-yellow-600 bg-yellow-50 px-3 py-2 rounded border border-yellow-200">
                  NEXT_PUBLIC_LIFF_ID が未設定です。.env.local に設定してください。
                </p>
              )}
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={selectedFormId}
                onChange={e => setSelectedFormId(e.target.value)}
              >
                <option value="">フォームを選択...</option>
                {formsList.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ── Carousel builder ── */}
          {form.messageType === 'carousel' && (
            <CarouselBuilder cards={carouselCards} onChange={setCarouselCards} />
          )}

          {/* ── Image inputs ── */}
          {form.messageType === 'image' && (() => {
            let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
            try { parsed = JSON.parse(form.messageContent) } catch {}
            return (
              <div className="space-y-2 mb-2">
                <MediaUrlInput accept="image" label="元画像URL" placeholder="https://example.com/image.png"
                  value={parsed.originalContentUrl ?? ''}
                  onChange={url => setForm({ ...form, messageContent: JSON.stringify({ originalContentUrl: url, previewImageUrl: url }) })}
                />
                <MediaUrlInput accept="image" label="プレビュー画像URL" placeholder="空欄で元画像と同じ"
                  value={parsed.previewImageUrl ?? ''}
                  onChange={url => setForm({ ...form, messageContent: JSON.stringify({ originalContentUrl: parsed.originalContentUrl ?? '', previewImageUrl: url }) })}
                />
              </div>
            )
          })()}

          {/* ── Video inputs ── */}
          {form.messageType === 'video' && (() => {
            let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
            try { parsed = JSON.parse(form.messageContent) } catch {}
            return (
              <div className="space-y-2 mb-2">
                <MediaUrlInput accept="video" label="動画URL (mp4)" placeholder="https://example.com/video.mp4"
                  value={parsed.originalContentUrl ?? ''}
                  onChange={url => setForm({ ...form, messageContent: JSON.stringify({ originalContentUrl: url, previewImageUrl: parsed.previewImageUrl ?? '' }) })}
                />
                <MediaUrlInput accept="image" label="プレビュー画像URL" placeholder="https://example.com/preview.jpg"
                  value={parsed.previewImageUrl ?? ''}
                  onChange={url => setForm({ ...form, messageContent: JSON.stringify({ originalContentUrl: parsed.originalContentUrl ?? '', previewImageUrl: url }) })}
                />
                <p className="text-xs text-gray-400 mt-1">空欄の場合は動画URLが使用されます</p>
              </div>
            )
          })()}

          {/* ── Textarea for text / flex / form (raw JSON) ── */}
          {form.messageType !== 'carousel' && form.messageType !== 'image' && form.messageType !== 'video' && form.messageType !== 'booking' && (
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
              rows={form.messageType === 'flex' || form.messageType === 'form' ? 8 : 4}
              placeholder={
                form.messageType === 'text' ? '配信するメッセージを入力...'
                : form.messageType === 'form' ? 'フォームを選択すると自動生成されます'
                : '{"type":"bubble","body":{...}}'
              }
              value={form.messageContent}
              onChange={e => setForm({ ...form, messageContent: e.target.value })}
              style={{ fontFamily: form.messageType !== 'text' ? 'monospace' : 'inherit' }}
            />
          )}

          {/* ── Variable preview hint ── */}
          {form.messageType === 'text' && /\{\{/.test(form.messageContent) && (
            <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-blue-600">
              プレビュー: {applyVariablePreview(form.messageContent).slice(0, 120)}
            </div>
          )}

          {/* ── Flex/Form/Carousel preview ── */}
          {(form.messageType === 'flex' || form.messageType === 'form' || form.messageType === 'booking') && (
            <FlexPreviewSection content={form.messageContent} />
          )}
          {form.messageType === 'carousel' && (() => {
            const content = JSON.stringify({ cards: carouselCards })
            try { JSON.parse(content); return <FlexPreviewSection content={JSON.stringify({ type: 'carousel', contents: carouselCards.map(c => ({
              type: 'bubble',
              body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: c.title || ' ', weight: 'bold' }, ...(c.text ? [{ type: 'text', text: c.text, color: '#aaaaaa', size: 'sm' }] : [])] },
            })) })} /> } catch { return null }
          })()}
        </div>

        {/* ── Quick Reply ── */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={quickReplyEnabled}
              onChange={e => setQuickReplyEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-green-600"
            />
            <span className="text-xs font-medium text-gray-600">クイックリプライを追加</span>
          </label>
          {quickReplyEnabled && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <QuickReplyBuilder items={quickReplyItems} onChange={setQuickReplyItems} />
            </div>
          )}
        </div>

        {/* Target */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">配信対象</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {(['all', 'tag'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, targetType: t, targetTagId: '' })}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  form.targetType === t
                    ? 'border-green-500 text-green-700 bg-green-50'
                    : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'
                }`}
              >
                {t === 'all' ? '全員' : 'タグで絞り込み'}
              </button>
            ))}
          </div>
          {form.targetType === 'tag' && (
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              value={form.targetTagId}
              onChange={e => setForm({ ...form, targetTagId: e.target.value })}
            >
              <option value="">タグを選択...</option>
              {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          )}
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">配信タイミング</label>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, sendNow: true, scheduledAt: '' })}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${form.sendNow ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'}`}
            >
              下書きとして保存
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, sendNow: false })}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${!form.sendNow ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'}`}
            >
              予約配信
            </button>
          </div>
          {!form.sendNow && (
            <input
              type="datetime-local"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={form.scheduledAt}
              onChange={e => setForm({ ...form, scheduledAt: e.target.value })}
            />
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: '#06C755' }}
            >
              {saving ? '保存中...' : isEdit ? '更新' : '作成'}
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowTestSend(true)}
              className="px-4 py-2 min-h-[44px] text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              テスト送信
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {readOnly ? '閉じる' : 'キャンセル'}
          </button>
        </div>
      </div>

      {/* ── Template modal ── */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">テンプレートから挿入</h3>
              <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {templatesList.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">テンプレートがありません</p>
              ) : (
                templatesList.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => handleInsertTemplate(tpl)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-800">{tpl.name}</p>
                    <p className="text-xs text-gray-400">{tpl.category} · {tpl.messageType}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Test send modal ── */}
      {showTestSend && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">テスト送信</h3>
            <label className="block text-xs font-medium text-gray-600 mb-1">送信先を選択</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              value={testFriendId}
              onChange={e => setTestFriendId(e.target.value)}
            >
              <option value="">友だちを選択...</option>
              {friendsList.map(f => (
                <option key={f.id} value={f.id}>{f.displayName || f.lineUserId}</option>
              ))}
            </select>
            {testSendResult && (
              <p className={`text-xs mb-3 ${testSendResult.includes('エラー') || testSendResult.includes('失敗') ? 'text-red-500' : 'text-green-600'}`}>
                {testSendResult}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleTestSend}
                disabled={testSending || !testFriendId}
                className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: '#06C755' }}
              >
                {testSending ? '送信中...' : '送信'}
              </button>
              <button
                onClick={() => { setShowTestSend(false); setTestSendResult(''); setTestFriendId('') }}
                className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
