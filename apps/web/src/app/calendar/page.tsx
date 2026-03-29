'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

// ─── Types ─────────────────────────────────────────────────────────────────

interface CalendarService {
  id: string
  name: string
  description: string | null
  duration: number
  googleClientEmail: string | null
  googlePrivateKeySet: boolean
  googleCalendarId: string | null
  businessHoursStart: string
  businessHoursEnd: string
  closedDays: string[]
  closedDates: string[]
  bookingFields: BookingField[]
  bookingReplyEnabled: boolean
  bookingReplyContent: string | null
  maxAdvanceDays: number
  isActive: boolean
  createdAt: string
}

interface BookingField {
  name: string
  label: string
  required: boolean
}

interface Booking {
  id: string
  connectionId: string | null
  friendId: string | null
  eventId: string | null
  title: string
  startAt: string
  endAt: string
  status: string
  serviceId: string | null
  serviceName: string | null
  bookingData: Record<string, string> | null
  createdAt: string
}

interface Slot {
  startAt: string
  endAt: string
  available: boolean
}

type TabId = 'settings' | 'bookings' | 'preview'

const TABS: { id: TabId; label: string }[] = [
  { id: 'settings', label: 'サービス設定' },
  { id: 'bookings', label: '予約一覧' },
  { id: 'preview', label: '空き状況' },
]

const DAYS_OF_WEEK = [
  { key: 'sun', label: '日' },
  { key: 'mon', label: '月' },
  { key: 'tue', label: '火' },
  { key: 'wed', label: '水' },
  { key: 'thu', label: '木' },
  { key: 'fri', label: '金' },
  { key: 'sat', label: '土' },
]

const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
  confirmed: { label: '確定', bg: 'bg-green-100', text: 'text-green-700' },
  pending: { label: '保留', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  cancelled: { label: 'キャンセル', bg: 'bg-red-100', text: 'text-red-700' },
  completed: { label: '完了', bg: 'bg-blue-100', text: 'text-blue-700' },
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function todayStr(): string {
  const d = new Date()
  d.setHours(d.getHours() + 9)
  return d.toISOString().slice(0, 10)
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [tab, setTab] = useState<TabId>('settings')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  return (
    <div>
      <Header title="カレンダー予約管理" description="サービスごとにGoogle Calendar連携・予約設定・空き状況を管理" />

      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(''); setSuccess('') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}<button onClick={() => setError('')} className="ml-2">✕</button></div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}<button onClick={() => setSuccess('')} className="ml-2">✕</button></div>}

      {tab === 'settings' && <SettingsTab setError={setError} setSuccess={setSuccess} />}
      {tab === 'bookings' && <BookingsTab setError={setError} setSuccess={setSuccess} />}
      {tab === 'preview' && <PreviewTab setError={setError} />}
    </div>
  )
}

// ─── Settings Tab (Service List + Editor) ─────────────────────────────────

function SettingsTab({ setError, setSuccess }: { setError: (s: string) => void; setSuccess: (s: string) => void }) {
  const [services, setServices] = useState<CalendarService[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: CalendarService[] }>('/api/calendar/services')
      if (res.success && Array.isArray(res.data)) setServices(res.data)
    } catch { setError('サービスの読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [setError])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
      const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
      const res = await fetch(`${API_URL}/api/calendar/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ name: '新しいサービス' }),
      })
      const json = await res.json() as { success: boolean; data?: { id: string } }
      if (json.success && json.data) {
        setSuccess('サービスを作成しました')
        await load()
        setEditingId(json.data.id)
      }
    } catch { setError('サービスの作成に失敗しました') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？この操作は元に戻せません。`)) return
    try {
      await fetchApi(`/api/calendar/services/${id}`, { method: 'DELETE' })
      setSuccess('サービスを削除しました')
      if (editingId === id) setEditingId(null)
      load()
    } catch { setError('削除に失敗しました') }
  }

  if (loading) return <div className="card p-12 text-center text-gray-400">読み込み中...</div>

  if (editingId) {
    return <ServiceEditor
      serviceId={editingId}
      onBack={() => { setEditingId(null); load() }}
      setError={setError}
      setSuccess={setSuccess}
    />
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{services.length}件のサービス</p>
        <button onClick={handleCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          + サービス追加
        </button>
      </div>

      {services.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">まだサービスが登録されていません</p>
          <button onClick={handleCreate} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            最初のサービスを追加
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {services.map(s => (
          <div key={s.id} className={`card p-5 cursor-pointer hover:shadow-md transition-shadow border-l-4 ${s.isActive ? 'border-l-green-500' : 'border-l-gray-300'}`}
            onClick={() => setEditingId(s.id)}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {s.isActive ? '有効' : '無効'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-3">
              <span>{s.duration}分</span>
              <span>{s.businessHoursStart}〜{s.businessHoursEnd}</span>
              {s.googleCalendarId && <span className="text-green-600">Google連携済</span>}
              {!s.googleCalendarId && <span className="text-yellow-600">未接続</span>}
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={e => { e.stopPropagation(); handleDelete(s.id, s.name) }}
                className="text-xs text-red-400 hover:text-red-600">削除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Service Editor ───────────────────────────────────────────────────────

function ServiceEditor({ serviceId, onBack, setError, setSuccess }: {
  serviceId: string; onBack: () => void; setError: (s: string) => void; setSuccess: (s: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(30)
  const [isActive, setIsActive] = useState(true)
  const [clientEmail, setClientEmail] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [calendarId, setCalendarId] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [hoursStart, setHoursStart] = useState('09:00')
  const [hoursEnd, setHoursEnd] = useState('18:00')
  const [closedDays, setClosedDays] = useState<string[]>(['sun'])
  const [closedDates, setClosedDates] = useState('')
  const [bookingFields, setBookingFields] = useState<BookingField[]>([
    { name: 'name', label: 'お名前', required: true },
    { name: 'phone', label: '電話番号', required: true },
  ])
  const [replyEnabled, setReplyEnabled] = useState(true)
  const [replyContent, setReplyContent] = useState('')
  const [maxDays, setMaxDays] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: CalendarService[] }>('/api/calendar/services')
      if (res.success && Array.isArray(res.data)) {
        const s = res.data.find(x => x.id === serviceId)
        if (s) {
          setName(s.name)
          setDescription(s.description ?? '')
          setDuration(s.duration)
          setIsActive(s.isActive)
          setClientEmail(s.googleClientEmail ?? '')
          setCalendarId(s.googleCalendarId ?? '')
          setHasKey(!!s.googlePrivateKeySet)
          setHoursStart(s.businessHoursStart ?? '09:00')
          setHoursEnd(s.businessHoursEnd ?? '18:00')
          setClosedDays(Array.isArray(s.closedDays) ? s.closedDays : [])
          setClosedDates(Array.isArray(s.closedDates) ? s.closedDates.join(', ') : '')
          setBookingFields(Array.isArray(s.bookingFields) ? s.bookingFields : [])
          setReplyEnabled(!!s.bookingReplyEnabled)
          setReplyContent(s.bookingReplyContent ?? '')
          setMaxDays(s.maxAdvanceDays ?? 30)
        }
      }
    } catch { setError('サービスの読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [serviceId, setError])

  useEffect(() => { load() }, [load])

  const handleSave = async (): Promise<boolean> => {
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name,
        description: description || null,
        duration,
        is_active: isActive ? 1 : 0,
        google_client_email: clientEmail || null,
        google_calendar_id: calendarId || null,
        business_hours_start: hoursStart,
        business_hours_end: hoursEnd,
        closed_days: JSON.stringify(closedDays),
        closed_dates: JSON.stringify(closedDates.split(',').map(d => d.trim()).filter(Boolean)),
        booking_fields: JSON.stringify(bookingFields),
        booking_reply_enabled: replyEnabled ? 1 : 0,
        booking_reply_content: replyContent || null,
        max_advance_days: maxDays,
      }
      if (privateKey.trim()) body.google_private_key = privateKey

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
      const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
      const res = await fetch(`${API_URL}/api/calendar/services/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null) as { success?: boolean; error?: string } | null
      if (res.ok && json?.success) {
        setSuccess('設定を保存しました')
        setPrivateKey('')
        load()
        return true
      } else {
        setError(json?.error || `保存に失敗しました (${res.status})`)
        return false
      }
    } catch (err) {
      setError(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
      const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
      const res = await fetch(`${API_URL}/api/calendar/services/${serviceId}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      })
      const json = await res.json() as { success: boolean; data?: { message: string; calendarId?: string; busyIntervalsToday?: number }; error?: string }
      if (json.success) {
        setTestResult(`接続成功! カレンダー: ${json.data?.calendarId ?? '?'} (本日の予定: ${json.data?.busyIntervalsToday ?? 0}件)`)
      } else {
        setTestResult(`接続失敗: ${json.error}`)
      }
    } catch (err) {
      setTestResult(`接続テストに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
    finally { setTesting(false) }
  }

  const toggleDay = (day: string) => {
    setClosedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  const updateField = (idx: number, patch: Partial<BookingField>) => {
    setBookingFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }
  const addField = () => setBookingFields(prev => [...prev, { name: `field_${prev.length}`, label: '', required: false }])
  const removeField = (idx: number) => setBookingFields(prev => prev.filter((_, i) => i !== idx))
  const moveField = (idx: number, dir: -1 | 1) => {
    setBookingFields(prev => {
      const arr = [...prev]
      const target = idx + dir
      if (target < 0 || target >= arr.length) return arr
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return arr
    })
  }

  if (loading) return <div className="card p-12 text-center text-gray-400">読み込み中...</div>

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back / Title */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-blue-600 hover:text-blue-700">&larr; 一覧に戻る</button>
        <h2 className="text-lg font-semibold text-gray-900">{name || 'サービス編集'}</h2>
      </div>

      {/* 基本情報 */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">基本情報</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">サービス名 *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="例: カット、初回相談"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="サービスの簡単な説明"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">予約枠 (分)</label>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={15} step={15}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-4">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              有効
            </label>
          </div>
        </div>
      </div>

      {/* Google Calendar接続 */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Google Calendar接続設定</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">サービスアカウント メールアドレス</label>
            <input type="text" value={clientEmail} onChange={e => setClientEmail(e.target.value)}
              placeholder="example@project.iam.gserviceaccount.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              秘密鍵 {hasKey && <span className="text-green-600 font-normal">— 設定済み</span>}
            </label>
            <textarea value={privateKey} onChange={e => setPrivateKey(e.target.value)}
              placeholder={hasKey ? '変更する場合のみ入力してください' : '秘密鍵の本体部分のみ貼り付けてください'}
              rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">カレンダーID</label>
            <input type="text" value={calendarId} onChange={e => setCalendarId(e.target.value)}
              placeholder="example@group.calendar.google.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={async () => { const ok = await handleSave(); if (ok) handleTest() }} disabled={testing || saving || !clientEmail || !calendarId}
              className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors">
              {testing ? 'テスト中...' : '保存して接続テスト'}
            </button>
            {testResult && <p className={`text-xs ${testResult.startsWith('接続成功') ? 'text-green-600' : 'text-red-600'}`}>{testResult}</p>}
          </div>
        </div>
      </div>

      {/* 営業時間 */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">営業時間設定</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始時刻</label>
            <input type="time" value={hoursStart} onChange={e => setHoursStart(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">終了時刻</label>
            <input type="time" value={hoursEnd} onChange={e => setHoursEnd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-2">定休日</label>
          <div className="flex gap-2">
            {DAYS_OF_WEEK.map(d => (
              <button key={d.key} onClick={() => toggleDay(d.key)}
                className={`w-10 h-10 rounded-full text-xs font-medium transition-colors ${closedDays.includes(d.key) ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">臨時休日 (YYYY-MM-DD, カンマ区切り)</label>
          <input type="text" value={closedDates} onChange={e => setClosedDates(e.target.value)}
            placeholder="2026-04-29, 2026-05-03"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">予約可能期間</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">今日から</span>
            <input type="number" value={maxDays} onChange={e => setMaxDays(Number(e.target.value))} min={1} max={365}
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-sm text-gray-500">日後まで</span>
          </div>
        </div>
      </div>

      {/* 予約フォーム設定 */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">予約フォーム入力項目</h3>
        <div className="space-y-2 mb-3">
          {bookingFields.map((f, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveField(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">&#9650;</button>
                <button onClick={() => moveField(i, 1)} disabled={i === bookingFields.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none">&#9660;</button>
              </div>
              <input type="text" value={f.name} onChange={e => updateField(i, { name: e.target.value })} placeholder="フィールド名"
                className="w-24 px-2 py-1 border border-gray-300 rounded text-xs" />
              <input type="text" value={f.label} onChange={e => updateField(i, { label: e.target.value })} placeholder="表示ラベル"
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs" />
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" checked={f.required} onChange={e => updateField(i, { required: e.target.checked })} />
                必須
              </label>
              <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addField} className="text-xs text-blue-600 hover:text-blue-700">+ 項目追加</button>
      </div>

      {/* 予約完了メッセージ */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">予約完了メッセージ</h3>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={replyEnabled} onChange={e => setReplyEnabled(e.target.checked)} />
          予約完了時にLINEメッセージを送信
        </label>
        {replyEnabled && (
          <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)}
            rows={4} placeholder={'予約ありがとうございます！\n\n日時: {{date}} {{time}}\nお名前: {{name}}\n\nご不明点はお気軽にご連絡ください。'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
        )}
      </div>

      {/* 保存ボタン */}
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? '保存中...' : '設定を保存'}
        </button>
        <button onClick={onBack} className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
          一覧に戻る
        </button>
      </div>
    </div>
  )
}

// ─── Bookings Tab ──────────────────────────────────────────────────────────

function BookingsTab({ setError, setSuccess }: { setError: (s: string) => void; setSuccess: (s: string) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<CalendarService[]>([])
  const [loading, setLoading] = useState(true)
  const [filterServiceId, setFilterServiceId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const query = filterServiceId ? `?serviceId=${filterServiceId}` : ''
      const [bookRes, svcRes] = await Promise.all([
        fetchApi<{ success: boolean; data: Booking[] }>(`/api/calendar/bookings${query}`),
        fetchApi<{ success: boolean; data: CalendarService[] }>('/api/calendar/services'),
      ])
      if (bookRes.success && Array.isArray(bookRes.data)) setBookings(bookRes.data)
      if (svcRes.success && Array.isArray(svcRes.data)) setServices(svcRes.data)
    } catch { setError('予約の読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [setError, filterServiceId])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetchApi('/api/calendar/bookings/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) })
      setSuccess('ステータスを更新しました')
      load()
    } catch { setError('更新に失敗しました') }
  }

  const handleCancel = async (id: string) => {
    if (!confirm('この予約をキャンセルしますか？Google Calendarの予定も削除されます。')) return
    try {
      await fetchApi('/api/calendar/book/' + id, { method: 'DELETE' })
      setSuccess('予約をキャンセルしました')
      load()
    } catch { setError('キャンセルに失敗しました') }
  }

  if (loading) return <div className="card p-12 text-center text-gray-400">読み込み中...</div>

  return (
    <div>
      {/* Service filter */}
      {services.length > 0 && (
        <div className="mb-4">
          <select value={filterServiceId} onChange={e => setFilterServiceId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">すべてのサービス</option>
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="card p-12 text-center"><p className="text-gray-500">予約はありません</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">サービス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">タイトル</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">予約情報</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">ステータス</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map(b => {
                  const st = statusLabels[b.status] || { label: b.status, bg: 'bg-gray-100', text: 'text-gray-700' }
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {b.serviceName || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{b.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(b.startAt)} 〜 {formatTime(b.endAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {b.bookingData && Object.entries(b.bookingData).map(([k, v]) => (
                          <span key={k} className="mr-2">{k}: {v}</span>
                        ))}
                      </td>
                      <td className="px-4 py-3">
                        <select value={b.status} onChange={e => handleStatusChange(b.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white">
                          <option value="confirmed">確定</option>
                          <option value="completed">完了</option>
                          <option value="cancelled">キャンセル</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {b.status !== 'cancelled' && (
                          <button onClick={() => handleCancel(b.id)} className="text-xs text-red-500 hover:text-red-700">キャンセル</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preview Tab ───────────────────────────────────────────────────────────

function PreviewTab({ setError }: { setError: (s: string) => void }) {
  const [date, setDate] = useState(() => todayStr())
  const [services, setServices] = useState<CalendarService[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState('')

  useEffect(() => {
    fetchApi<{ success: boolean; data: CalendarService[] }>('/api/calendar/services')
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          const active = res.data.filter(s => s.isActive)
          setServices(active)
          if (active.length > 0 && !selectedServiceId) setSelectedServiceId(active[0].id)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadSlots = useCallback(async () => {
    if (!date) return
    setLoading(true)
    setInfo('')
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
      const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
      const serviceParam = selectedServiceId ? `&serviceId=${selectedServiceId}` : ''
      const res = await fetch(`${API_URL}/api/calendar/available?date=${date}${serviceParam}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      const json = await res.json().catch(() => null) as { success?: boolean; data?: { slots?: Slot[]; closed?: boolean } | Slot[]; error?: string } | null
      if (json?.success && json.data) {
        const slotsArr = Array.isArray(json.data) ? json.data : Array.isArray((json.data as { slots?: Slot[] }).slots) ? (json.data as { slots: Slot[] }).slots : []
        setSlots(slotsArr)
        if ((json.data as { closed?: boolean }).closed) {
          setInfo('この日は休業日です')
        }
      } else {
        setSlots([])
        setInfo(json?.error || 'スロットを取得できませんでした')
      }
    } catch {
      setSlots([])
      setError('空き状況の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [date, selectedServiceId, setError])

  useEffect(() => { loadSlots() }, [loadSlots])

  const available = slots.filter(s => s?.available).length
  const total = slots.length

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        {services.length > 0 && (
          <select value={selectedServiceId} onChange={e => setSelectedServiceId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
        {total > 0 && <span className="text-sm text-gray-500">{available}/{total} スロット空き</span>}
      </div>

      {info && <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">{info}</div>}

      {loading ? (
        <div className="card p-12 text-center text-gray-400">読み込み中...</div>
      ) : slots.length === 0 && !info ? (
        <div className="card p-12 text-center"><p className="text-gray-500">この日のスロットはありません（休日の可能性）</p></div>
      ) : slots.length > 0 ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {slots.map((s, i) => {
            const time = formatTime(s?.startAt ?? '')
            return (
              <div key={i} className={`px-3 py-2 rounded-lg text-center text-sm font-medium transition-colors ${
                s?.available ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}>
                {time}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
