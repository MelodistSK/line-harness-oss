'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

interface StripeEvent {
  id: string
  stripeEventId: string
  eventType: string
  friendId: string | null
  displayName: string | null
  amount: number | null
  currency: string | null
  payload: string
  processedAt: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return '—'
  const c = (currency || 'jpy').toUpperCase()
  if (c === 'JPY') return `¥${amount.toLocaleString()}`
  return `${(amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${c}`
}

const eventTypeLabels: Record<string, { label: string; bg: string; text: string }> = {
  'checkout.session.completed': { label: '購入完了', bg: 'bg-green-100', text: 'text-green-700' },
  'payment_intent.succeeded': { label: '決済成功', bg: 'bg-green-100', text: 'text-green-700' },
  'payment_intent.payment_failed': { label: '決済失敗', bg: 'bg-red-100', text: 'text-red-700' },
  'invoice.paid': { label: '請求書支払い', bg: 'bg-blue-100', text: 'text-blue-700' },
  'customer.subscription.created': { label: 'サブスク開始', bg: 'bg-purple-100', text: 'text-purple-700' },
  'customer.subscription.deleted': { label: 'サブスク解約', bg: 'bg-yellow-100', text: 'text-yellow-700' },
}

export default function StripePage() {
  const [events, setEvents] = useState<StripeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: StripeEvent[]; error?: string }>('/api/integrations/stripe/events')
      if (res.success) {
        setEvents(res.data)
      } else {
        setError(res.error || '決済イベントの取得に失敗しました')
      }
    } catch {
      setError('決済イベントの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <Header title="Stripe決済" description="Stripe Webhookで受信した決済イベント一覧" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">決済イベントはありません。Stripe Webhookを設定してください。</p>
          <p className="text-xs text-gray-400 mt-2">
            Webhook URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/api/integrations/stripe/webhook</code>
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">イベント</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">友だち</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">金額</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stripe Event ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => {
                  const et = eventTypeLabels[event.eventType] || { label: event.eventType, bg: 'bg-gray-100', text: 'text-gray-700' }
                  return (
                    <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${et.bg} ${et.text}`}>
                          {et.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{event.displayName || event.friendId || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatAmount(event.amount, event.currency)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono truncate max-w-[200px]">{event.stripeEventId}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(event.processedAt)}</td>
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
