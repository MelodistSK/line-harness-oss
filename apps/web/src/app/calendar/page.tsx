'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

interface CalendarConnection {
  id: string
  calendarId: string
  authType: string
  isActive: boolean
  createdAt: string
}

interface Booking {
  id: string
  friendId: string
  displayName: string | null
  startTime: string
  endTime: string
  status: string
  googleEventId: string | null
  createdAt: string
}

const statusLabels: Record<string, { label: string; bg: string; text: string }> = {
  confirmed: { label: '確定', bg: 'bg-green-100', text: 'text-green-700' },
  pending: { label: '保留', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  cancelled: { label: 'キャンセル', bg: 'bg-red-100', text: 'text-red-700' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CalendarPage() {
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showConnect, setShowConnect] = useState(false)
  const [connectForm, setConnectForm] = useState({ calendarId: '', authType: 'api_key' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [connRes, bookRes] = await Promise.all([
        fetchApi<{ success: boolean; data: CalendarConnection[]; error?: string }>('/api/integrations/google-calendar'),
        fetchApi<{ success: boolean; data: Booking[]; error?: string }>('/api/integrations/google-calendar/bookings'),
      ])
      if (connRes.success) setConnections(connRes.data)
      if (bookRes.success) setBookings(bookRes.data)
      if (!connRes.success) setError(connRes.error || '接続情報の取得に失敗しました')
    } catch {
      setError('カレンダー情報の読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleConnect = async () => {
    if (!connectForm.calendarId.trim()) { setFormError('Calendar IDを入力してください'); return }
    setSaving(true)
    setFormError('')
    try {
      const res = await fetchApi<{ success: boolean; error?: string }>('/api/integrations/google-calendar/connect', {
        method: 'POST',
        body: JSON.stringify({ calendarId: connectForm.calendarId, authType: connectForm.authType }),
      })
      if (res.success) {
        setShowConnect(false)
        setConnectForm({ calendarId: '', authType: 'api_key' })
        load()
      } else {
        setFormError(res.error || '接続に失敗しました')
      }
    } catch {
      setFormError('接続に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    if (!confirm('この接続を削除してもよいですか？')) return
    try {
      await fetchApi<{ success: boolean }>(`/api/integrations/google-calendar/${id}`, { method: 'DELETE' })
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const handleStatusChange = async (bookingId: string, status: string) => {
    try {
      await fetchApi<{ success: boolean }>(`/api/integrations/google-calendar/bookings/${bookingId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })
      load()
    } catch {
      setError('ステータス更新に失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="カレンダー予約管理"
        action={
          <button
            onClick={() => setShowConnect(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + Google Calendar接続
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Connection form */}
      {showConnect && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Google Calendar接続</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Calendar ID <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="example@group.calendar.google.com" value={connectForm.calendarId}
                onChange={(e) => setConnectForm({ ...connectForm, calendarId: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">認証方式</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={connectForm.authType} onChange={(e) => setConnectForm({ ...connectForm, authType: e.target.value })}>
                <option value="api_key">API Key</option>
                <option value="oauth">OAuth</option>
                <option value="service_account">Service Account</option>
              </select>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button onClick={handleConnect} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity" style={{ backgroundColor: '#06C755' }}>
                {saving ? '接続中...' : '接続'}
              </button>
              <button onClick={() => { setShowConnect(false); setFormError('') }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected calendars */}
      {!loading && connections.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">接続済みカレンダー</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connections.map((conn) => (
              <div key={conn.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{conn.calendarId}</p>
                  <p className="text-xs text-gray-400 mt-0.5">認証: {conn.authType} / {conn.isActive ? '有効' : '無効'}</p>
                </div>
                <button onClick={() => handleDisconnect(conn.id)}
                  className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors">
                  切断
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bookings */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">予約一覧</h2>
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-40" />
                <div className="h-2 bg-gray-100 rounded w-56" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
            </div>
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">予約はありません</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">友だち</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">開始日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">終了日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ステータス</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bookings.map((booking) => {
                  const st = statusLabels[booking.status] || { label: booking.status, bg: 'bg-gray-100', text: 'text-gray-700' }
                  return (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{booking.displayName || booking.friendId}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(booking.startTime)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(booking.endTime)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                          value={booking.status}
                          onChange={(e) => handleStatusChange(booking.id, e.target.value)}
                        >
                          <option value="pending">保留</option>
                          <option value="confirmed">確定</option>
                          <option value="cancelled">キャンセル</option>
                        </select>
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
