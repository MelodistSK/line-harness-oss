'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import CcPromptButton from '@/components/cc-prompt-button'
import FlexPreviewComponent from '@/components/flex-preview'
import MediaUrlInput from '@/components/media-url-input'

// ── Types ─────────────────────────────────────────────────────────────────────

type TemplateItem = {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
  createdAt: string
  updatedAt: string
}

interface Template {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
  createdAt: string
  updatedAt: string
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

interface CreateFormState {
  name: string
  category: string
  messageType: string
  messageContent: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID || '').trim()

const MESSAGE_TYPES = [
  { value: 'text', label: 'テキスト' },
  { value: 'image', label: '画像' },
  { value: 'flex', label: 'Flex' },
  { value: 'form', label: 'フォーム' },
  { value: 'booking', label: '予約' },
  { value: 'carousel', label: 'カルーセル' },
  { value: 'video', label: '動画' },
]

const messageTypeLabels: Record<string, string> = Object.fromEntries(MESSAGE_TYPES.map(t => [t.value, t.label]))

function generateFormFlex(form: FormData): string {
  const liffUrl = `https://liff.line.me/${LIFF_ID}?page=form&id=${form.id}`
  return JSON.stringify({
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
      contents: [{ type: 'button', action: { type: 'uri', label: 'フォームに回答する', uri: liffUrl }, style: 'primary', color: '#06C755' }],
    },
  }, null, 2)
}

function generateBookingFlex(): string {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://line-harness-mamayoro.s-kamiya.workers.dev').trim()
  const liffUrl = `${apiUrl}/liff/booking`
  return JSON.stringify({
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: 'ご予約はこちら', weight: 'bold', size: 'lg', wrap: true },
      { type: 'text', text: 'ご都合の良い日時をお選びください', color: '#666666', size: 'sm', wrap: true, margin: 'md' },
    ] },
    footer: { type: 'box', layout: 'vertical', contents: [
      { type: 'button', action: { type: 'uri', label: '予約する', uri: liffUrl }, style: 'primary', color: '#06C755' },
    ] },
  }, null, 2)
}

function applyVariablePreview(content: string): string {
  return content
    .replace(/\{\{name\}\}/g, '田中太郎')
    .replace(/\{\{uid\}\}/g, 'U1a2b3c4d5e6f')
    .replace(/\{\{score\}\}/g, '85')
    .replace(/\{\{friend_id\}\}/g, 'f-1234-5678')
    .replace(/\{\{ref\}\}/g, 'REF001')
    .replace(/\{\{#if_ref\}\}[\s\S]*?\{\{\/if_ref\}\}/g, '')
}

function buildFinalContent(messageType: string, content: string, qrItems: QuickReplyItem[]): string {
  const hasQR = qrItems.length > 0
  const finalType = messageType === 'form' || messageType === 'booking' ? 'flex' : messageType
  if (finalType === 'text') {
    return hasQR ? JSON.stringify({ _text: content, _quickReply: qrItems }) : content
  }
  if (hasQR) {
    try {
      const parsed = JSON.parse(content)
      return JSON.stringify({ ...parsed, _quickReply: qrItems })
    } catch { /* invalid json */ }
  }
  return content
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CarouselBuilder({ cards, onChange }: { cards: CarouselCard[]; onChange: (c: CarouselCard[]) => void }) {
  const addCard = () => onChange([...cards, { title: '', text: '', imageUrl: '', buttons: [] }])
  const removeCard = (i: number) => onChange(cards.filter((_, idx) => idx !== i))
  const updateCard = (i: number, patch: Partial<CarouselCard>) => onChange(cards.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const addButton = (i: number) => { if (cards[i].buttons.length >= 3) return; updateCard(i, { buttons: [...cards[i].buttons, { label: '', type: 'message', value: '' }] }) }
  const updateButton = (ci: number, bi: number, patch: Partial<CarouselCard['buttons'][0]>) =>
    updateCard(ci, { buttons: cards[ci].buttons.map((b, idx) => idx === bi ? { ...b, ...patch } : b) })
  const removeButton = (ci: number, bi: number) => updateCard(ci, { buttons: cards[ci].buttons.filter((_, idx) => idx !== bi) })

  return (
    <div className="space-y-3">
      {cards.map((card, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-semibold text-gray-600">カード {i + 1}</span>
            <button onClick={() => removeCard(i)} className="text-xs text-red-400 hover:text-red-600">削除</button>
          </div>
          <input className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="タイトル" value={card.title} onChange={e => updateCard(i, { title: e.target.value })} />
          <input className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" placeholder="説明文" value={card.text} onChange={e => updateCard(i, { text: e.target.value })} />
          <MediaUrlInput accept="image" placeholder="画像URL (省略可)" value={card.imageUrl} onChange={url => updateCard(i, { imageUrl: url })} />
          <div className="space-y-1">
            {card.buttons.map((btn, bi) => (
              <div key={bi} className="flex gap-1 items-center">
                <input className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder="ラベル" value={btn.label} onChange={e => updateButton(i, bi, { label: e.target.value })} />
                <select className="border border-gray-300 rounded px-1 py-1 text-xs" value={btn.type} onChange={e => updateButton(i, bi, { type: e.target.value as 'message' | 'uri' })}>
                  <option value="message">テキスト</option>
                  <option value="uri">URL</option>
                </select>
                <input className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder={btn.type === 'uri' ? 'https://...' : '送信テキスト'} value={btn.value} onChange={e => updateButton(i, bi, { value: e.target.value })} />
                <button onClick={() => removeButton(i, bi)} className="text-red-400 text-xs px-1">✕</button>
              </div>
            ))}
            {card.buttons.length < 3 && <button onClick={() => addButton(i)} className="text-xs text-green-600 hover:text-green-700">+ ボタン追加</button>}
          </div>
        </div>
      ))}
      {cards.length < 10 && (
        <button onClick={addCard} className="w-full py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-green-400 hover:text-green-600">+ カード追加</button>
      )}
    </div>
  )
}

function QuickReplyBuilder({ items, onChange }: { items: QuickReplyItem[]; onChange: (items: QuickReplyItem[]) => void }) {
  const add = () => onChange([...items, { label: '', type: 'message', value: '' }])
  const update = (i: number, patch: Partial<QuickReplyItem>) => onChange(items.map((item, idx) => idx === i ? { ...item, ...patch } : item))
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i))
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input className="w-24 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder="ラベル(20字)" maxLength={20} value={item.label} onChange={e => update(i, { label: e.target.value })} />
          <select className="border border-gray-300 rounded px-1 py-1 text-xs" value={item.type} onChange={e => update(i, { type: e.target.value as 'message' | 'uri' })}>
            <option value="message">テキスト</option>
            <option value="uri">URL</option>
          </select>
          <input className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder={item.type === 'uri' ? 'https://...' : '送信テキスト'} value={item.value} onChange={e => update(i, { value: e.target.value })} />
          <button onClick={() => remove(i)} className="text-red-400 text-xs px-1">✕</button>
        </div>
      ))}
      {items.length < 13 && <button onClick={add} className="text-xs text-green-600 hover:text-green-700">+ 選択肢追加</button>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ccPrompts = [
  { title: 'テンプレート作成', prompt: '新しいメッセージテンプレートの作成をサポートしてください。用途別の文例提案、各タイプの効果的な使い方、カテゴリのベストプラクティスを教えてください。' },
  { title: 'テンプレート整理', prompt: '既存のテンプレートを整理・最適化してください。重複・類似テンプレートの統合提案、不足カテゴリの追加推奨をお願いします。' },
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null | 'new'>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const [form, setForm] = useState<CreateFormState>({ name: '', category: '', messageType: 'text', messageContent: '' })
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([{ title: '', text: '', imageUrl: '', buttons: [] }])
  const [quickReplyEnabled, setQuickReplyEnabled] = useState(false)
  const [quickReplyItems, setQuickReplyItems] = useState<QuickReplyItem[]>([])
  const [formsList, setFormsList] = useState<FormData[]>([])
  const [selectedFormId, setSelectedFormId] = useState('')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.templates.list(selectedCategory !== 'all' ? selectedCategory : undefined)
      if (res.success) setTemplates(res.data)
      else setError(res.error)
    } catch {
      setError('テンプレートの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.forms.list().then(res => { if (res.success) setFormsList(res.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (form.messageType === 'form' && selectedFormId) {
      const found = formsList.find(f => f.id === selectedFormId)
      if (found) setForm(prev => ({ ...prev, messageContent: generateFormFlex(found) }))
    }
  }, [selectedFormId, form.messageType, formsList])

  useEffect(() => {
    if (form.messageType === 'booking') {
      setForm(prev => ({ ...prev, messageContent: generateBookingFlex() }))
    }
  }, [form.messageType])

  const categories = Array.from(new Set(templates.map(t => t.category).filter(Boolean)))

  const getDisplayContent = () => {
    if (form.messageType === 'carousel') return JSON.stringify({ cards: carouselCards }, null, 2)
    return form.messageContent
  }

  const resetForm = () => {
    setForm({ name: '', category: '', messageType: 'text', messageContent: '' })
    setCarouselCards([{ title: '', text: '', imageUrl: '', buttons: [] }])
    setQuickReplyEnabled(false)
    setQuickReplyItems([])
    setSelectedFormId('')
    setFormError('')
  }

  const openEdit = (template: TemplateItem) => {
    setEditingTemplate(template)
    setFormError('')
    const msgType = template.messageType
    setForm({
      name: template.name,
      category: template.category,
      messageType: msgType,
      messageContent: template.messageContent,
    })
    // For carousel type, parse messageContent to populate carouselCards
    if (msgType === 'carousel') {
      try {
        const parsed = JSON.parse(template.messageContent)
        if (parsed.cards && Array.isArray(parsed.cards)) {
          setCarouselCards(parsed.cards)
        } else {
          setCarouselCards([{ title: '', text: '', imageUrl: '', buttons: [] }])
        }
      } catch {
        setCarouselCards([{ title: '', text: '', imageUrl: '', buttons: [] }])
      }
    } else {
      setCarouselCards([{ title: '', text: '', imageUrl: '', buttons: [] }])
    }
    // Parse quick reply from content
    try {
      const parsed = JSON.parse(template.messageContent)
      if (parsed._quickReply && Array.isArray(parsed._quickReply)) {
        setQuickReplyEnabled(true)
        setQuickReplyItems(parsed._quickReply)
      } else {
        setQuickReplyEnabled(false)
        setQuickReplyItems([])
      }
    } catch {
      setQuickReplyEnabled(false)
      setQuickReplyItems([])
    }
    setSelectedFormId('')
  }

  const handleDuplicate = (template: TemplateItem) => {
    openEdit({
      ...template,
      id: '',
      name: template.name + ' (コピー)',
    })
    // Override editingTemplate to 'new' since it has no id
    setEditingTemplate({ ...template, id: '', name: template.name + ' (コピー)' })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('テンプレート名を入力してください'); return }
    if (!form.category.trim()) { setFormError('カテゴリを入力してください'); return }
    const content = getDisplayContent()
    if (!content.trim()) { setFormError('メッセージ内容を入力してください'); return }
    const finalType = form.messageType === 'form' ? 'flex' : form.messageType
    const finalContent = buildFinalContent(form.messageType, content, quickReplyEnabled ? quickReplyItems : [])
    setSaving(true)
    setFormError('')
    const payload = { name: form.name, category: form.category, messageType: finalType, messageContent: finalContent }
    const isUpdate = editingTemplate !== 'new' && editingTemplate !== null && editingTemplate.id
    try {
      const res = isUpdate
        ? await api.templates.update(editingTemplate.id, payload)
        : await api.templates.create(payload)
      if (res.success) {
        setEditingTemplate(null)
        resetForm()
        load()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError(isUpdate ? '更新に失敗しました' : '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除してもよいですか？')) return
    try {
      await api.templates.delete(id)
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="テンプレート管理"
        action={
          <button onClick={() => { resetForm(); setEditingTemplate('new') }} className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90" style={{ backgroundColor: '#06C755' }}>
            + 新規テンプレート
          </button>
        }
      />

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Category filter */}
      {!loading && categories.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', ...categories].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 min-h-[44px] text-xs font-medium rounded-full transition-colors ${selectedCategory === cat ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
              style={selectedCategory === cat ? { backgroundColor: '#06C755' } : undefined}
            >
              {cat === 'all' ? '全て' : cat}
            </button>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      {editingTemplate !== null && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{editingTemplate === 'new' || !editingTemplate.id ? '新規テンプレート' : 'テンプレート編集'}</h2>
          <div className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">テンプレート名 <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="例: ウェルカムメッセージ" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">カテゴリ <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="例: 挨拶、キャンペーン、通知" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            </div>

            {/* Message type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">メッセージタイプ</label>
              <div className="flex flex-wrap gap-2">
                {MESSAGE_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm({ ...form, messageType: t.value, messageContent: '' })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${form.messageType === t.value ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message content */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">メッセージ内容 <span className="text-red-500">*</span></label>

              {form.messageType === 'form' && (
                <div className="mb-2">
                  {!LIFF_ID && <p className="text-xs text-yellow-600 mb-2">NEXT_PUBLIC_LIFF_ID が未設定です</p>}
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" value={selectedFormId} onChange={e => setSelectedFormId(e.target.value)}>
                    <option value="">フォームを選択...</option>
                    {formsList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}

              {form.messageType === 'booking' && (
                <div className="mb-2">
                  {!LIFF_ID && <p className="text-xs text-yellow-600 mb-2">NEXT_PUBLIC_LIFF_ID が未設定です</p>}
                  <p className="text-xs text-gray-500">予約ページへのLIFFリンク付きFlexメッセージが自動生成されます</p>
                </div>
              )}

              {form.messageType === 'carousel' && (
                <CarouselBuilder cards={carouselCards} onChange={setCarouselCards} />
              )}

              {form.messageType === 'image' && (() => {
                let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
                try { parsed = JSON.parse(form.messageContent) } catch {}
                return (
                  <div className="space-y-2 mb-2">
                    <MediaUrlInput accept="image" label="画像URL" placeholder="https://example.com/image.png"
                      value={parsed.originalContentUrl ?? ''}
                      onChange={url => setForm({ ...form, messageContent: JSON.stringify({ originalContentUrl: url, previewImageUrl: url }) })}
                    />
                    {(() => { try { const url = JSON.parse(form.messageContent).originalContentUrl; if (url) return <img src={url} alt="preview" className="mt-2 max-w-[200px] rounded-lg border border-gray-200" /> } catch {} return null })()}
                  </div>
                )
              })()}

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

              {form.messageType !== 'carousel' && form.messageType !== 'image' && form.messageType !== 'video' && (
                <textarea
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                  rows={form.messageType === 'flex' || form.messageType === 'form' || form.messageType === 'booking' ? 8 : 4}
                  placeholder={form.messageType === 'text' ? 'メッセージ内容を入力してください' : '{"type":"bubble","body":{...}}'}
                  value={form.messageContent}
                  onChange={e => setForm({ ...form, messageContent: e.target.value })}
                  style={{ fontFamily: form.messageType !== 'text' ? 'monospace' : 'inherit' }}
                />
              )}

              {form.messageType === 'text' && /\{\{/.test(form.messageContent) && (
                <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-blue-600">
                  プレビュー: {applyVariablePreview(form.messageContent).slice(0, 120)}
                </div>
              )}

              {(form.messageType === 'flex' || form.messageType === 'form' || form.messageType === 'booking') && form.messageContent && (() => {
                try { JSON.parse(applyVariablePreview(form.messageContent)); return (
                  <div className="mt-3"><p className="text-xs font-medium text-gray-500 mb-2">プレビュー</p><FlexPreviewComponent content={applyVariablePreview(form.messageContent)} maxWidth={300} /></div>
                ) } catch { return <p className="text-xs text-red-500 mt-1">JSON パースエラー</p> }
              })()}
            </div>

            {/* Quick Reply */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={quickReplyEnabled} onChange={e => setQuickReplyEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600" />
                <span className="text-xs font-medium text-gray-600">クイックリプライを追加</span>
              </label>
              {quickReplyEnabled && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <QuickReplyBuilder items={quickReplyItems} onChange={setQuickReplyItems} />
                </div>
              )}
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
                {saving ? '保存中...' : (editingTemplate === 'new' || !editingTemplate?.id ? '作成' : '更新')}
              </button>
              <button onClick={() => { setEditingTemplate(null); setFormError('') }} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates list */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-3 bg-gray-100 rounded w-24" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 && editingTemplate === null ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">テンプレートがありません。「新規テンプレート」から作成してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">テンプレート名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">カテゴリ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">タイプ</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">作成日時</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map(template => (
                  <tr key={template.id} onClick={() => openEdit(template)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{template.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                        {template.messageContent.slice(0, 50)}{template.messageContent.length > 50 ? '...' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{template.category}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{messageTypeLabels[template.messageType] || template.messageType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(template.createdAt)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDuplicate(template)} className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors mr-1">複製</button>
                      <button onClick={() => handleDelete(template.id)} className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
