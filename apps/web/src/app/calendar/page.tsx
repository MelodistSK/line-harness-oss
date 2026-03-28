'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

// ─── Types ─────────────────────────────────────────────────────────────────

interface CalendarSettings {
  googleClientEmail: string | null
  googlePrivateKeySet: boolean
  googleCalendarId: string | null
  businessHoursStart: string
  businessHoursEnd: string
  slotDuration: number
  closedDays: string[]
  closedDates: string[]
  bookingFields: BookingField[]
  bookingReplyEnabled: boolean
  bookingReplyContent: string | null
  maxAdvanceDays: number
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
  { id: 'settings', label: '接続・設定' },
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
      <Header title="カレンダー予約管理" description="Google Calendar連携・予約設定・空き状況" />

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

// ─── Settings Tab ──────────────────────────────────────────────────────────

function SettingsTab({ setError, setSuccess }: { setError: (s: string) => void; setSuccess: (s: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const [clientEmail, setClientEmail] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [calendarId, setCalendarId] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [hoursStart, setHoursStart] = useState('09:00')
  const [hoursEnd, setHoursEnd] = useState('18:00')
  const [slotDuration, setSlotDuration] = useState(30)
  const [closedDays, setClosedDays] = useState<string[]>(['sun'])
  const [closedDates, setClosedDates] = useState('')
  const [bookingFields, setBookingFields] = useState<BookingField[]>([
    { name: 'name', label: 'お名前', required: true },
    { name: 'phone', label: '電話番号', required: true },
    { name: 'email', label: 'メール', required: false },
    { name: 'note', label: '備考', required: false },
  ])
  const [replyEnabled, setReplyEnabled] = useState(true)
  const [replyContent, setReplyContent] = useState('')
  const [maxDays, setMaxDays] = useState(30)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: CalendarSettings | null }>('/api/calendar/settings')
      if (res.success && res.data) {
        const s = res.data
        setClientEmail(s.googleClientEmail ?? '')
        setCalendarId(s.googleCalendarId ?? '')
        setHasKey(s.googlePrivateKeySet)
        setHoursStart(s.businessHoursStart)
        setHoursEnd(s.businessHoursEnd)
        setSlotDuration(s.slotDuration)
        setClosedDays(s.closedDays)
        setClosedDates(s.closedDates.join(', '))
        setBookingFields(s.bookingFields)
        setReplyEnabled(s.bookingReplyEnabled)
        setReplyContent(s.bookingReplyContent ?? '')
        setMaxDays(s.maxAdvanceDays)
      }
    } catch { setError('設定の読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [setError])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        google_client_email: clientEmail || null,
        google_calendar_id: calendarId || null,
        business_hours_start: hoursStart,
        business_hours_end: hoursEnd,
        slot_duration: slotDuration,
        closed_days: JSON.stringify(closedDays),
        closed_dates: JSON.stringify(closedDates.split(',').map(d => d.trim()).filter(Boolean)),
        booking_fields: JSON.stringify(bookingFields),
        booking_reply_enabled: replyEnabled ? 1 : 0,
        booking_reply_content: replyContent || null,
        max_advance_days: maxDays,
      }
      if (privateKey.trim()) body.google_private_key = privateKey
      const res = await fetchApi<{ success: boolean; error?: string }>('/api/calendar/settings', { method: 'PUT', body: JSON.stringify(body) })
      if (res.success) { setSuccess('設定を保存しました'); setPrivateKey(''); load() }
      else setError(res.error || '保存に失敗しました')
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
      const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
      const res = await fetch(`${API_URL}/api/calendar/test-connection`, {
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
              placeholder={hasKey ? '変更する場合のみ入力してください' : '秘密鍵の本体部分のみ貼り付けてください（BEGIN/END行は不要）\nMIIEvQIBADANBgkqhki...'}
              rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">カレンダーID</label>
            <input type="text" value={calendarId} onChange={e => setCalendarId(e.target.value)}
              placeholder="example@group.calendar.google.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleTest} disabled={testing || !clientEmail || !calendarId}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors">
              {testing ? 'テスト中...' : '接続テスト'}
            </button>
            {testResult && <p className={`self-center text-xs ${testResult.startsWith('接続成功') ? 'text-green-600' : 'text-red-600'}`}>{testResult}</p>}
          </div>
        </div>
      </div>

      {/* 営業時間 */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">営業時間設定</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">予約枠 (分)</label>
            <input type="number" value={slotDuration} onChange={e => setSlotDuration(Number(e.target.value))} min={15} step={15}
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
      <button onClick={handleSave} disabled={saving}
        className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {saving ? '保存中...' : '設定を保存'}
      </button>
    </div>
  )
}

// ─── Bookings Tab ──────────────────────────────────────────────────────────

function BookingsTab({ setError, setSuccess }: { setError: (s: string) => void; setSuccess: (s: string) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: Booking[] }>('/api/calendar/bookings')
      if (res.success) setBookings(res.data)
    } catch { setError('予約の読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [setError])

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

  if (bookings.length === 0) {
    return <div className="card p-12 text-center"><p className="text-gray-500">予約はありません</p></div>
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
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
  )
}

// ─── Preview Tab ───────────────────────────────────────────────────────────

function PreviewTab({ setError }: { setError: (s: string) => void }) {
  const [date, setDate] = useState(todayStr())
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)

  const loadSlots = useCallback(async () => {
    if (!date) return
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: Slot[] }>(`/api/calendar/available?date=${date}`)
      if (res.success) setSlots(res.data)
    } catch { setError('空き状況の取得に失敗しました') }
    finally { setLoading(false) }
  }, [date, setError])

  useEffect(() => { loadSlots() }, [loadSlots])

  const available = slots.filter(s => s.available).length
  const total = slots.length

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
        <span className="text-sm text-gray-500">{available}/{total} スロット空き</span>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-400">読み込み中...</div>
      ) : slots.length === 0 ? (
        <div className="card p-12 text-center"><p className="text-gray-500">この日のスロットはありません（休日の可能性）</p></div>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {slots.map((s, i) => {
            const time = formatTime(s.startAt)
            return (
              <div key={i} className={`px-3 py-2 rounded-lg text-center text-sm font-medium transition-colors ${
                s.available ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'
              }`}>
                {time}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
