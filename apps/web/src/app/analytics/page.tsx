'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

// ─── Types ────────────────────────────────────────────────────────────────

interface SourceStat { refCode: string; name: string; friendCount: number }
interface DailyStat { date: string; refCode: string; name: string; count: number }
interface Summary { totalFriends: number; thisMonthAdded: number; topSource: string | null; topSourceName: string | null; topSourceCount: number; sourcesCount: number }

type Period = '7d' | '30d' | '90d' | 'all'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(d.getHours() + 9)
  return d.toISOString().slice(0, 10)
}

const COLORS = ['#06C755', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']

// ─── Main Page ────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [sources, setSources] = useState<SourceStat[]>([])
  const [daily, setDaily] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)

  const getRange = useCallback(() => {
    if (period === 'all') return {}
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
    return { from: daysAgo(days) }
  }, [period])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = getRange()
      const params = new URLSearchParams()
      if (range.from) params.set('from', range.from)

      const [sumRes, srcRes, dailyRes] = await Promise.all([
        fetchApi<{ success: boolean; data: Summary }>('/api/analytics/summary'),
        fetchApi<{ success: boolean; data: SourceStat[] }>(`/api/analytics/sources?${params}`),
        fetchApi<{ success: boolean; data: DailyStat[] }>(`/api/analytics/sources/daily?${params}`),
      ])
      if (sumRes.success) setSummary(sumRes.data)
      if (srcRes.success) setSources(srcRes.data)
      if (dailyRes.success) setDaily(dailyRes.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [getRange])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <Header title="流入分析" description="流入経路別の友だち追加分析・QRコード効果測定" />

      {/* Period filter */}
      <div className="flex gap-2 mb-6">
        {([['7d', '7日間'], ['30d', '30日間'], ['90d', '90日間'], ['all', '全期間']] as [Period, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setPeriod(v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-12 text-center text-gray-400">読み込み中...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard label="総友だち数" value={summary.totalFriends} color="blue" />
              <SummaryCard label="今月の追加" value={summary.thisMonthAdded} color="green" />
              <SummaryCard label="流入経路数" value={summary.sourcesCount} color="purple" />
              <SummaryCard label="トップ経路" value={summary.topSourceName || summary.topSource || '-'} sub={summary.topSourceCount > 0 ? `${summary.topSourceCount}人` : ''} color="amber" />
            </div>
          )}

          {/* Bar chart: sources */}
          {sources.length > 0 && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">経路別 友だち追加数</h3>
              <BarChart data={sources.slice(0, 15)} />
            </div>
          )}

          {/* Line chart: daily */}
          {daily.length > 0 && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">日別推移</h3>
              <DailyLineChart data={daily} />
            </div>
          )}

          {/* Conversion rates (QR scan → friend) */}
          <QrConversionSection />

          {/* Source table */}
          {sources.length > 0 && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">経路一覧</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">#</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">経路名</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">refコード</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">友だち数</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {sources.map((s, i) => (
                      <tr key={s.refCode} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{s.name}</td>
                        <td className="px-4 py-2 text-xs text-gray-400 font-mono">{s.refCode}</td>
                        <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{s.friendCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {sources.length === 0 && (
            <div className="card p-12 text-center">
              <p className="text-gray-500">流入データがまだありません</p>
              <p className="text-xs text-gray-400 mt-2">QRコードや /r/:ref リンクからの友だち追加で自動的に記録されます</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    green: { bg: 'bg-green-50', text: 'text-green-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`${c.bg} rounded-xl p-4`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${c.text}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Bar Chart (CSS) ──────────────────────────────────────────────────────

function BarChart({ data }: { data: SourceStat[] }) {
  const max = Math.max(...data.map(d => d.friendCount), 1)
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.refCode} className="flex items-center gap-3">
          <div className="w-28 text-xs text-gray-600 truncate text-right" title={d.name}>{d.name}</div>
          <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.friendCount / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
            />
          </div>
          <div className="w-10 text-xs font-semibold text-gray-700 text-right">{d.friendCount}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Daily Line Chart (SVG) ───────────────────────────────────────────────

function DailyLineChart({ data }: { data: DailyStat[] }) {
  // Aggregate by date
  const dateMap = new Map<string, number>()
  for (const d of data) {
    dateMap.set(d.date, (dateMap.get(d.date) || 0) + d.count)
  }
  const dates = Array.from(dateMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  if (dates.length === 0) return null

  const max = Math.max(...dates.map(d => d[1]), 1)
  const w = 600
  const h = 200
  const px = 40
  const py = 20

  const points = dates.map((d, i) => {
    const x = px + (i / Math.max(dates.length - 1, 1)) * (w - px * 2)
    const y = py + (1 - d[1] / max) * (h - py * 2)
    return { x, y, date: d[0], count: d[1] }
  })

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const area = line + ` L${points[points.length - 1].x},${h - py} L${points[0].x},${h - py} Z`

  // Y axis labels
  const yLabels = [0, Math.ceil(max / 2), max]

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minWidth: 400 }}>
        {/* Grid */}
        {yLabels.map(v => {
          const y = py + (1 - v / max) * (h - py * 2)
          return <g key={v}>
            <line x1={px} y1={y} x2={w - px} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={px - 5} y={y + 4} fill="#9ca3af" fontSize="10" textAnchor="end">{v}</text>
          </g>
        })}
        {/* Area */}
        <path d={area} fill="#06C755" fillOpacity="0.1" />
        {/* Line */}
        <path d={line} fill="none" stroke="#06C755" strokeWidth="2" />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#06C755" />
            <title>{p.date}: {p.count}人</title>
          </g>
        ))}
        {/* X labels */}
        {points.filter((_, i) => dates.length <= 14 || i % Math.ceil(dates.length / 7) === 0).map((p) => (
          <text key={p.date} x={p.x} y={h - 4} fill="#9ca3af" fontSize="9" textAnchor="middle">{p.date.slice(5)}</text>
        ))}
      </svg>
    </div>
  )
}

// ─── QR Conversion Section ────────────────────────────────────────────────

interface QrConv { name: string; scanCount: number; friendCount: number; rate: number }

function QrConversionSection() {
  const [data, setData] = useState<QrConv[]>([])

  useEffect(() => {
    fetchApi<{ success: boolean; data: { name: string; scanCount: number; friendCount: number }[] }>('/api/qr-codes')
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setData(res.data
            .filter(q => q.scanCount > 0)
            .map(q => ({
              name: q.name,
              scanCount: q.scanCount,
              friendCount: q.friendCount,
              rate: q.scanCount > 0 ? Math.round((q.friendCount / q.scanCount) * 100) : 0,
            }))
            .sort((a, b) => b.rate - a.rate)
          )
        }
      })
      .catch(() => {})
  }, [])

  if (data.length === 0) return null

  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">QRコード別 コンバージョン率</h3>
      <div className="space-y-3">
        {data.map((q, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-32 text-xs text-gray-600 truncate" title={q.name}>{q.name}</div>
            <div className="flex-1">
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden relative">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${q.rate}%`, backgroundColor: q.rate >= 50 ? '#06C755' : q.rate >= 20 ? '#F59E0B' : '#EF4444' }} />
              </div>
            </div>
            <div className="text-xs font-semibold w-12 text-right" style={{ color: q.rate >= 50 ? '#06C755' : q.rate >= 20 ? '#F59E0B' : '#EF4444' }}>{q.rate}%</div>
            <div className="text-xs text-gray-400 w-24 text-right">{q.friendCount}/{q.scanCount}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
