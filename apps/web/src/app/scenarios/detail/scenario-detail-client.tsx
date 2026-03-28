'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Scenario, ScenarioStep, ScenarioTriggerType, MessageType } from '@line-crm/shared'
import { api } from '@/lib/api'
import Header from '@/components/layout/header'
import FlexPreviewComponent from '@/components/flex-preview'
import MediaUrlInput from '@/components/media-url-input'

// ── Types ─────────────────────────────────────────────────────────────────────

type ScenarioWithSteps = Scenario & { steps: ScenarioStep[] }

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

interface RichMenuData {
  richMenuId: string
  name: string
  chatBarText: string
}

interface TemplateData {
  id: string
  name: string
  category: string
  messageType: string
  messageContent: string
}

interface FriendData {
  id: string
  displayName: string | null
  lineUserId: string
}

interface StepFormState {
  stepOrder: number
  delayMinutes: number
  messageType: string
  messageContent: string
  // Conditional branching
  conditionType: string
  conditionValue: string
  nextStepOnFalse: number | null
  // Rich menu fields
  richMenuId: string
  richMenuAction: 'link' | 'unlink'
}

// ── Constants ─────────────────────────────────────────────────────────────────

const triggerOptions: { value: ScenarioTriggerType; label: string }[] = [
  { value: 'friend_add', label: '友だち追加時' },
  { value: 'tag_added', label: 'タグ付与時' },
  { value: 'manual', label: '手動' },
]

const MESSAGE_TYPES = [
  { value: 'text', label: 'テキスト' },
  { value: 'image', label: '画像' },
  { value: 'flex', label: 'Flex' },
  { value: 'form', label: 'フォーム' },
  { value: 'booking', label: '予約' },
  { value: 'carousel', label: 'カルーセル' },
  { value: 'video', label: '動画' },
  { value: 'rich_menu', label: 'リッチメニュー切替' },
]

const messageTypeLabels: Record<string, string> = Object.fromEntries(MESSAGE_TYPES.map(t => [t.value, t.label]))

const CONDITION_TYPES = [
  { value: '', label: '条件なし' },
  { value: 'tag_exists', label: 'タグを持っている' },
  { value: 'tag_not_exists', label: 'タグを持っていない' },
  { value: 'metadata_equals', label: 'メタデータが一致' },
  { value: 'metadata_not_equals', label: 'メタデータが不一致' },
]

const LIFF_ID = (process.env.NEXT_PUBLIC_LIFF_ID || '').trim()

const emptyStepForm: StepFormState = {
  stepOrder: 1,
  delayMinutes: 0,
  messageType: 'text',
  messageContent: '',
  conditionType: '',
  conditionValue: '',
  nextStepOnFalse: null,
  richMenuId: '',
  richMenuAction: 'link',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDelay(minutes: number): string {
  if (minutes === 0) return '即時'
  if (minutes < 60) return `${minutes}分後`
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60), m = minutes % 60
    return m === 0 ? `${h}時間後` : `${h}時間${m}分後`
  }
  const d = Math.floor(minutes / 1440), remaining = minutes % 1440
  if (remaining === 0) return `${d}日後`
  const h = Math.floor(remaining / 60)
  return h > 0 ? `${d}日${h}時間後` : `${d}日${remaining}分後`
}

function generateFormFlex(form: FormData): string {
  const liffUrl = `https://liff.line.me/${LIFF_ID}?page=form&id=${form.id}`
  return JSON.stringify({
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', contents: [
      { type: 'text', text: form.name, weight: 'bold', size: 'lg', wrap: true },
      ...(form.description ? [{ type: 'text', text: form.description, color: '#666666', size: 'sm', wrap: true, margin: 'md' }] : []),
    ]},
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', action: { type: 'uri', label: 'フォームに回答する', uri: liffUrl }, style: 'primary', color: '#06C755' }] },
  }, null, 2)
}

function generateBookingFlex(): string {
  const liffUrl = `https://liff.line.me/${LIFF_ID || '2009615537-8qwrEnEt'}?page=booking`
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
  if (messageType === 'text') {
    return hasQR ? JSON.stringify({ _text: content, _quickReply: qrItems }) : content
  }
  if (hasQR) {
    try { const parsed = JSON.parse(content); return JSON.stringify({ ...parsed, _quickReply: qrItems }) } catch { /* ignore */ }
  }
  return content
}

function parseContentForEdit(messageType: string, content: string): { displayContent: string; quickReplyItems: QuickReplyItem[] } {
  if (!content) return { displayContent: '', quickReplyItems: [] }
  if (messageType === 'text') {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>
      if (parsed._text !== undefined) {
        return { displayContent: String(parsed._text), quickReplyItems: Array.isArray(parsed._quickReply) ? parsed._quickReply as QuickReplyItem[] : [] }
      }
    } catch {}
    return { displayContent: content, quickReplyItems: [] }
  }
  try {
    const { _quickReply, ...rest } = JSON.parse(content) as Record<string, unknown>
    return { displayContent: JSON.stringify(rest, null, 2), quickReplyItems: Array.isArray(_quickReply) ? _quickReply as QuickReplyItem[] : [] }
  } catch {}
  return { displayContent: content, quickReplyItems: [] }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FlexPreview({ content }: { content: string }) {
  return <FlexPreviewComponent content={content} maxWidth={300} />
}

function ImagePreview({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content)
    const url = parsed.previewImageUrl || parsed.originalContentUrl
    return (
      <div>
        <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded mb-2 inline-block">画像</span>
        {url ? <img src={url} alt="preview" className="max-w-[200px] rounded-lg border border-gray-200 mt-1" /> : <p className="text-xs text-gray-400">プレビューなし</p>}
      </div>
    )
  } catch {
    return <p className="text-xs text-red-500">画像 JSON パースエラー</p>
  }
}

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

// ── Main component ────────────────────────────────────────────────────────────

export default function ScenarioDetailClient({ scenarioId }: { scenarioId: string }) {
  const id = scenarioId

  const [scenario, setScenario] = useState<ScenarioWithSteps | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', triggerType: 'friend_add' as ScenarioTriggerType, isActive: true })
  const [saving, setSaving] = useState(false)

  const [showStepForm, setShowStepForm] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [stepForm, setStepForm] = useState<StepFormState>(emptyStepForm)
  const [stepSaving, setStepSaving] = useState(false)
  const [stepError, setStepError] = useState('')

  // Per-step extended state
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([{ title: '', text: '', imageUrl: '', buttons: [] }])
  const [quickReplyEnabled, setQuickReplyEnabled] = useState(false)
  const [quickReplyItems, setQuickReplyItems] = useState<QuickReplyItem[]>([])

  const [formsList, setFormsList] = useState<FormData[]>([])
  const [selectedFormId, setSelectedFormId] = useState('')
  const [richMenusList, setRichMenusList] = useState<RichMenuData[]>([])

  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templatesList, setTemplatesList] = useState<TemplateData[]>([])

  const [showTestSend, setShowTestSend] = useState(false)
  const [friendsList, setFriendsList] = useState<FriendData[]>([])
  const [testFriendId, setTestFriendId] = useState('')
  const [testSending, setTestSending] = useState(false)
  const [testSendResult, setTestSendResult] = useState('')

  const loadScenario = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.scenarios.get(id)
      if (res.success) {
        setScenario(res.data)
        setEditForm({ name: res.data.name, description: res.data.description ?? '', triggerType: res.data.triggerType, isActive: res.data.isActive })
      } else {
        setError(res.error)
      }
    } catch {
      setError('シナリオの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadScenario() }, [loadScenario])

  useEffect(() => {
    api.forms.list().then(res => { if (res.success) setFormsList(res.data) }).catch(() => {})
    api.richMenus.list().then(res => { if (res.success) setRichMenusList(res.data) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (showTemplateModal) {
      api.templates.list().then(res => { if (res.success) setTemplatesList(res.data) }).catch(() => {})
    }
  }, [showTemplateModal])

  useEffect(() => {
    if (showTestSend) {
      api.friends.list({ limit: '100' }).then(res => {
        if (res.success) setFriendsList(res.data.items.map(f => ({ id: f.id, displayName: f.displayName, lineUserId: f.lineUserId })))
      }).catch(() => {})
    }
  }, [showTestSend])

  // Auto-generate form flex when form is selected
  useEffect(() => {
    if (stepForm.messageType === 'form' && selectedFormId) {
      const found = formsList.find(f => f.id === selectedFormId)
      if (found) setStepForm(prev => ({ ...prev, messageContent: generateFormFlex(found) }))
    }
  }, [selectedFormId, stepForm.messageType, formsList])

  useEffect(() => {
    if (stepForm.messageType === 'booking') {
      setStepForm(prev => ({ ...prev, messageContent: generateBookingFlex() }))
    }
  }, [stepForm.messageType])

  const getDisplayContent = () => {
    if (stepForm.messageType === 'carousel') return JSON.stringify({ cards: carouselCards }, null, 2)
    if (stepForm.messageType === 'rich_menu') return JSON.stringify({ richMenuId: stepForm.richMenuId, action: stepForm.richMenuAction })
    return stepForm.messageContent
  }

  const handleSaveScenario = async () => {
    if (!editForm.name.trim()) return
    setSaving(true)
    try {
      const res = await api.scenarios.update(id, {
        name: editForm.name,
        description: editForm.description || null,
        triggerType: editForm.triggerType,
        isActive: editForm.isActive,
      })
      if (res.success) { setEditing(false); loadScenario() }
      else setError(res.error)
    } catch {
      setError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const resetStepForm = () => {
    setStepForm(emptyStepForm)
    setCarouselCards([{ title: '', text: '', imageUrl: '', buttons: [] }])
    setQuickReplyEnabled(false)
    setQuickReplyItems([])
    setSelectedFormId('')
    setStepError('')
  }

  const openAddStep = () => {
    const nextOrder = scenario ? (scenario.steps.length > 0 ? Math.max(...scenario.steps.map(s => s.stepOrder)) + 1 : 1) : 1
    resetStepForm()
    setStepForm(prev => ({ ...prev, stepOrder: nextOrder }))
    setEditingStepId(null)
    setShowStepForm(true)
  }

  const openEditStep = (step: ScenarioStep) => {
    const msgType = (step.messageType as string)
    const { displayContent, quickReplyItems: qrItems } = parseContentForEdit(msgType, step.messageContent)
    resetStepForm()
    setStepForm({
      stepOrder: step.stepOrder,
      delayMinutes: step.delayMinutes,
      messageType: msgType,
      messageContent: displayContent,
      conditionType: (step as unknown as Record<string, unknown>).conditionType as string ?? '',
      conditionValue: (step as unknown as Record<string, unknown>).conditionValue as string ?? '',
      nextStepOnFalse: (step as unknown as Record<string, unknown>).nextStepOnFalse as number ?? null,
      richMenuId: '',
      richMenuAction: 'link',
    })
    if (msgType === 'carousel') {
      try { setCarouselCards(JSON.parse(displayContent).cards ?? []) } catch {}
    }
    if (msgType === 'rich_menu') {
      try {
        const parsed = JSON.parse(step.messageContent) as { richMenuId?: string; action?: 'link' | 'unlink' }
        setStepForm(prev => ({ ...prev, richMenuId: parsed.richMenuId ?? '', richMenuAction: parsed.action ?? 'link' }))
      } catch {}
    }
    if (qrItems.length > 0) {
      setQuickReplyEnabled(true)
      setQuickReplyItems(qrItems)
    }
    setEditingStepId(step.id)
    setShowStepForm(true)
  }

  const handleSaveStep = async () => {
    const content = getDisplayContent()
    if (stepForm.messageType !== 'rich_menu' && !content.trim()) {
      setStepError('メッセージ内容を入力してください'); return
    }
    setStepSaving(true)
    setStepError('')

    const finalType = stepForm.messageType === 'form' || stepForm.messageType === 'booking' ? 'flex' : stepForm.messageType
    const finalContent = stepForm.messageType === 'rich_menu'
      ? content
      : buildFinalContent(finalType, content, quickReplyEnabled ? quickReplyItems : [])

    // Build condition data
    const conditionData = stepForm.conditionType ? {
      conditionType: stepForm.conditionType,
      conditionValue: stepForm.conditionValue,
      nextStepOnFalse: stepForm.nextStepOnFalse,
    } : {}

    try {
      if (editingStepId) {
        const res = await api.scenarios.updateStep(id, editingStepId, {
          stepOrder: stepForm.stepOrder,
          delayMinutes: stepForm.delayMinutes,
          messageType: finalType as MessageType,
          messageContent: finalContent,
          ...conditionData,
        })
        if (!res.success) { setStepError(res.error); return }
      } else {
        const res = await api.scenarios.addStep(id, {
          stepOrder: stepForm.stepOrder,
          delayMinutes: stepForm.delayMinutes,
          messageType: finalType as MessageType,
          messageContent: finalContent,
          ...conditionData,
        })
        if (!res.success) { setStepError(res.error); return }
      }
      setShowStepForm(false)
      setEditingStepId(null)
      resetStepForm()
      loadScenario()
    } catch {
      setStepError('ステップの保存に失敗しました')
    } finally {
      setStepSaving(false)
    }
  }

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('このステップを削除してもよいですか？')) return
    try { await api.scenarios.deleteStep(id, stepId); loadScenario() }
    catch { setError('ステップの削除に失敗しました') }
  }

  const handleTestSend = async () => {
    if (!testFriendId) return
    const content = getDisplayContent()
    if (!content.trim()) { setTestSendResult('メッセージ内容が空です'); return }
    const finalType = stepForm.messageType === 'form' || stepForm.messageType === 'booking' ? 'flex' : stepForm.messageType
    const finalContent = buildFinalContent(finalType, content, quickReplyEnabled ? quickReplyItems : [])
    setTestSending(true)
    setTestSendResult('')
    try {
      const res = await api.friends.sendMessage(testFriendId, { content: finalContent, messageType: finalType })
      setTestSendResult(res.success ? '送信しました！' : `エラー: ${res.error}`)
    } catch {
      setTestSendResult('送信に失敗しました')
    } finally {
      setTestSending(false)
    }
  }

  const handleInsertTemplate = (tpl: TemplateData) => {
    setStepForm(prev => ({ ...prev, messageType: tpl.messageType, messageContent: tpl.messageContent }))
    if (tpl.messageType === 'carousel') {
      try { setCarouselCards(JSON.parse(tpl.messageContent).cards ?? []) } catch {}
    }
    setShowTemplateModal(false)
  }

  if (loading) {
    return (
      <div>
        <Header title="シナリオ詳細" />
        <div className="bg-white rounded-lg border border-gray-200 p-8 animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
        </div>
      </div>
    )
  }

  if (!scenario) {
    return (
      <div>
        <Header title="シナリオ詳細" />
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">{error || 'シナリオが見つかりません'}</p>
          <Link href="/scenarios" className="text-sm text-green-600 hover:text-green-700 mt-4 inline-block">← シナリオ一覧に戻る</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header
        title="シナリオ詳細"
        action={
          <Link href="/scenarios" className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center">
            ← シナリオ一覧
          </Link>
        }
      />

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {/* Scenario Info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        {editing ? (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">シナリオ名 <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" rows={2} value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">トリガー</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" value={editForm.triggerType} onChange={e => setEditForm({ ...editForm, triggerType: e.target.value as ScenarioTriggerType })}>
                {triggerOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="editIsActive" checked={editForm.isActive} onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
              <label htmlFor="editIsActive" className="text-sm text-gray-600">有効</label>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveScenario} disabled={saving} className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => { setEditing(false); setEditForm({ name: scenario.name, description: scenario.description ?? '', triggerType: scenario.triggerType, isActive: scenario.isActive }) }} className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-lg font-semibold text-gray-900">{scenario.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${scenario.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {scenario.isActive ? '有効' : '無効'}
                </span>
                <button onClick={() => setEditing(true)} className="text-xs font-medium text-green-600 hover:text-green-700 px-3 py-1.5 rounded-md hover:bg-green-50">編集</button>
              </div>
            </div>
            {scenario.description && <p className="text-sm text-gray-500 mb-3">{scenario.description}</p>}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>トリガー: {triggerOptions.find(o => o.value === scenario.triggerType)?.label ?? scenario.triggerType}</span>
              <span>ステップ数: {scenario.steps.length}</span>
              <span>作成日: {new Date(scenario.createdAt).toLocaleDateString('ja-JP')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">ステップ一覧</h3>
          <button onClick={openAddStep} className="px-3 py-1.5 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90" style={{ backgroundColor: '#06C755' }}>
            + ステップ追加
          </button>
        </div>

        {/* Step form */}
        {showStepForm && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              {editingStepId ? 'ステップを編集' : '新しいステップを追加'}
            </h4>
            <div className="space-y-3 max-w-xl">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ステップ順序</label>
                  <input type="number" min={1} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={stepForm.stepOrder} onChange={e => setStepForm({ ...stepForm, stepOrder: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">遅延 (分)</label>
                  <input type="number" min={0} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" value={stepForm.delayMinutes} onChange={e => setStepForm({ ...stepForm, delayMinutes: Number(e.target.value) })} />
                  <p className="text-xs text-gray-400 mt-0.5">{formatDelay(stepForm.delayMinutes)}</p>
                </div>
              </div>

              {/* Message type */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">メッセージタイプ</label>
                  <button type="button" onClick={() => setShowTemplateModal(true)} className="text-xs text-blue-600 hover:text-blue-700">テンプレートから挿入</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setStepForm(prev => ({ ...prev, messageType: t.value, messageContent: '' })); setSelectedFormId('') }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${stepForm.messageType === t.value ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message content */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">メッセージ内容 {stepForm.messageType !== 'rich_menu' && <span className="text-red-500">*</span>}</label>

                {/* Rich menu */}
                {stepForm.messageType === 'rich_menu' && (
                  <div className="space-y-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">アクション</label>
                      <div className="flex gap-2">
                        {(['link', 'unlink'] as const).map(action => (
                          <button key={action} type="button" onClick={() => setStepForm({ ...stepForm, richMenuAction: action })}
                            className={`px-3 py-1.5 text-xs rounded-md border ${stepForm.richMenuAction === action ? 'border-green-500 text-green-700 bg-green-50' : 'border-gray-300 text-gray-600 bg-white'}`}>
                            {action === 'link' ? 'リッチメニューをリンク' : 'リッチメニューを解除'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {stepForm.richMenuAction === 'link' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">リッチメニューを選択</label>
                        <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" value={stepForm.richMenuId} onChange={e => setStepForm({ ...stepForm, richMenuId: e.target.value })}>
                          <option value="">選択してください...</option>
                          {richMenusList.map(rm => <option key={rm.richMenuId} value={rm.richMenuId}>{rm.name || rm.chatBarText} ({rm.richMenuId.slice(0, 12)}...)</option>)}
                        </select>
                        {richMenusList.length === 0 && <p className="text-xs text-gray-400 mt-1">リッチメニューが見つかりません</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Form picker */}
                {stepForm.messageType === 'form' && (
                  <div className="mb-2">
                    {!LIFF_ID && <p className="text-xs text-yellow-600 mb-1">NEXT_PUBLIC_LIFF_ID が未設定です</p>}
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" value={selectedFormId} onChange={e => setSelectedFormId(e.target.value)}>
                      <option value="">フォームを選択...</option>
                      {formsList.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                )}

                {stepForm.messageType === 'booking' && (
                  <div className="mb-2">
                    {!LIFF_ID && <p className="text-xs text-yellow-600 mb-1">NEXT_PUBLIC_LIFF_ID が未設定です</p>}
                    <p className="text-xs text-gray-500">予約ページへのLIFFリンク付きFlexメッセージが自動生成されます</p>
                  </div>
                )}

                {/* Carousel */}
                {stepForm.messageType === 'carousel' && <CarouselBuilder cards={carouselCards} onChange={setCarouselCards} />}

                {/* Image */}
                {stepForm.messageType === 'image' && (() => {
                  let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
                  try { parsed = JSON.parse(stepForm.messageContent) } catch {}
                  return (
                    <div className="mb-2 space-y-2">
                      <MediaUrlInput accept="image" label="画像URL" placeholder="https://example.com/image.png"
                        value={parsed.originalContentUrl ?? ''}
                        onChange={url => setStepForm({ ...stepForm, messageContent: JSON.stringify({ originalContentUrl: url, previewImageUrl: url }) })}
                      />
                      {(() => { try { const url = JSON.parse(stepForm.messageContent).originalContentUrl; if (url) return <img src={url} alt="preview" className="mt-2 max-w-[200px] rounded-lg border border-gray-200" /> } catch {} return null })()}
                    </div>
                  )
                })()}

                {/* Video */}
                {stepForm.messageType === 'video' && (() => {
                  let parsed: { originalContentUrl?: string; previewImageUrl?: string } = {}
                  try { parsed = JSON.parse(stepForm.messageContent) } catch {}
                  return (
                    <div className="space-y-2 mb-2">
                      <MediaUrlInput accept="video" label="動画URL (mp4)" placeholder="https://example.com/video.mp4"
                        value={parsed.originalContentUrl ?? ''}
                        onChange={url => setStepForm({ ...stepForm, messageContent: JSON.stringify({ originalContentUrl: url, previewImageUrl: parsed.previewImageUrl ?? '' }) })}
                      />
                      <MediaUrlInput accept="image" label="プレビュー画像URL" placeholder="https://example.com/preview.jpg"
                        value={parsed.previewImageUrl ?? ''}
                        onChange={url => setStepForm({ ...stepForm, messageContent: JSON.stringify({ originalContentUrl: parsed.originalContentUrl ?? '', previewImageUrl: url }) })}
                      />
                      <p className="text-xs text-gray-400 mt-1">空欄の場合は動画URLが使用されます</p>
                    </div>
                  )
                })()}

                {/* Text / Flex textarea */}
                {stepForm.messageType !== 'carousel' && stepForm.messageType !== 'image' && stepForm.messageType !== 'video' && stepForm.messageType !== 'rich_menu' && (
                  <textarea
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                    rows={stepForm.messageType === 'flex' || stepForm.messageType === 'form' || stepForm.messageType === 'booking' ? 8 : 4}
                    placeholder={stepForm.messageType === 'text' ? 'メッセージ内容を入力...\n{{name}}で名前、{{uid}}でUID挿入可' : '{"type":"bubble","body":{...}}'}
                    value={stepForm.messageContent}
                    onChange={e => setStepForm({ ...stepForm, messageContent: e.target.value })}
                    style={{ fontFamily: stepForm.messageType !== 'text' ? 'monospace' : 'inherit' }}
                  />
                )}

                {/* Variable preview */}
                {stepForm.messageType === 'text' && /\{\{/.test(stepForm.messageContent) && (
                  <div className="mt-1 p-2 bg-blue-50 rounded text-xs text-blue-600">
                    プレビュー: {applyVariablePreview(stepForm.messageContent).slice(0, 120)}
                  </div>
                )}

                {/* Flex preview */}
                {(stepForm.messageType === 'flex' || stepForm.messageType === 'form' || stepForm.messageType === 'booking') && stepForm.messageContent && (() => {
                  const preview = applyVariablePreview(stepForm.messageContent)
                  try { JSON.parse(preview); return <div className="mt-3"><p className="text-xs font-medium text-gray-500 mb-2">プレビュー</p><FlexPreviewComponent content={preview} maxWidth={300} /></div> }
                  catch { return <p className="text-xs text-red-500 mt-1">JSON パースエラー</p> }
                })()}
              </div>

              {/* Quick Reply (not for rich_menu) */}
              {stepForm.messageType !== 'rich_menu' && (
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
              )}

              {/* Conditional branching */}
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-xs font-semibold text-yellow-700 mb-2">条件分岐 (オプション)</p>
                <div className="space-y-2">
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    value={stepForm.conditionType}
                    onChange={e => setStepForm({ ...stepForm, conditionType: e.target.value, conditionValue: '' })}
                  >
                    {CONDITION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {stepForm.conditionType && (
                    <>
                      <input
                        type="text"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder={stepForm.conditionType.startsWith('tag') ? 'タグID' : 'key:value (例: plan:premium)'}
                        value={stepForm.conditionValue}
                        onChange={e => setStepForm({ ...stepForm, conditionValue: e.target.value })}
                      />
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">条件不成立時のジャンプ先ステップ順序 (省略可)</label>
                        <input
                          type="number"
                          min={1}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="空欄で次のステップへ"
                          value={stepForm.nextStepOnFalse ?? ''}
                          onChange={e => setStepForm({ ...stepForm, nextStepOnFalse: e.target.value ? Number(e.target.value) : null })}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {stepError && <p className="text-xs text-red-600">{stepError}</p>}

              <div className="flex flex-wrap gap-2">
                <button onClick={handleSaveStep} disabled={stepSaving} className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
                  {stepSaving ? '保存中...' : editingStepId ? '更新' : '追加'}
                </button>
                <button onClick={() => setShowTestSend(true)} className="px-4 py-2 min-h-[44px] text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
                  テスト送信
                </button>
                <button onClick={() => { setShowStepForm(false); setEditingStepId(null); resetStepForm() }} className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Steps list */}
        {scenario.steps.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">ステップがありません。「+ ステップ追加」から追加してください。</div>
        ) : (
          <div className="space-y-3">
            {scenario.steps.sort((a, b) => a.stepOrder - b.stepOrder).map(step => (
              <div key={step.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white shrink-0" style={{ backgroundColor: '#06C755' }}>{step.stepOrder}</span>
                      <span className="text-xs text-gray-500">{formatDelay(step.delayMinutes)}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        (step.messageType as string) === 'text' ? 'bg-blue-50 text-blue-600' :
                        (step.messageType as string) === 'image' ? 'bg-purple-50 text-purple-600' :
                        (step.messageType as string) === 'rich_menu' ? 'bg-orange-50 text-orange-600' :
                        (step.messageType as string) === 'carousel' ? 'bg-pink-50 text-pink-600' :
                        (step.messageType as string) === 'video' ? 'bg-red-50 text-red-600' :
                        'bg-orange-50 text-orange-600'
                      }`}>
                        {messageTypeLabels[step.messageType] ?? step.messageType}
                      </span>
                      {Boolean((step as unknown as Record<string, unknown>).conditionType) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">条件あり</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2">
                      {step.messageType === 'text' ? (
                        <p className="whitespace-pre-wrap break-words">{
                          (() => { try { const p = JSON.parse(step.messageContent) as Record<string, unknown>; if (p._text) return String(p._text) } catch {} return step.messageContent })()
                        }</p>
                      ) : step.messageType === 'flex' ? (
                        <FlexPreview content={step.messageContent} />
                      ) : step.messageType === 'image' ? (
                        <ImagePreview content={step.messageContent} />
                      ) : step.messageType === 'rich_menu' ? (
                        <p className="text-xs text-orange-600">
                          {(() => { try { const p = JSON.parse(step.messageContent) as { action?: string; richMenuId?: string }; return p.action === 'unlink' ? 'リッチメニュー解除' : `リンク: ${p.richMenuId ?? ''}` } catch { return step.messageContent } })()}
                        </p>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-xs text-gray-500">[{messageTypeLabels[step.messageType] ?? step.messageType}]</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditStep(step)} className="text-xs text-green-600 hover:text-green-700 px-2 py-1 rounded hover:bg-green-50 min-h-[44px] flex items-center">編集</button>
                    <button onClick={() => handleDeleteStep(step.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 min-h-[44px] flex items-center">削除</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template modal */}
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
                  <button key={tpl.id} onClick={() => handleInsertTemplate(tpl)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <p className="text-sm font-medium text-gray-800">{tpl.name}</p>
                    <p className="text-xs text-gray-400">{tpl.category} · {tpl.messageType}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Test send modal */}
      {showTestSend && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">テスト送信</h3>
            <label className="block text-xs font-medium text-gray-600 mb-1">送信先を選択</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" value={testFriendId} onChange={e => setTestFriendId(e.target.value)}>
              <option value="">友だちを選択...</option>
              {friendsList.map(f => <option key={f.id} value={f.id}>{f.displayName || f.lineUserId}</option>)}
            </select>
            {testSendResult && <p className={`text-xs mb-3 ${testSendResult.includes('エラー') || testSendResult.includes('失敗') ? 'text-red-500' : 'text-green-600'}`}>{testSendResult}</p>}
            <div className="flex gap-2">
              <button onClick={handleTestSend} disabled={testSending || !testFriendId} className="flex-1 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
                {testSending ? '送信中...' : '送信'}
              </button>
              <button onClick={() => { setShowTestSend(false); setTestSendResult(''); setTestFriendId('') }} className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
