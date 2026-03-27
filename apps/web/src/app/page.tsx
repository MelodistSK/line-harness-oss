'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api, type FriendWithTags } from '@/lib/api'
import type { Broadcast, Tag } from '@line-crm/shared'
import CcPromptButton from '@/components/cc-prompt-button'
import { useAccount } from '@/contexts/account-context'

const ccPrompts = [
  {
    title: 'KPI分析',
    prompt: `LINE CRM ダッシュボードのデータを分析してください。\n1. 友だち数の推移を確認\n2. アクティブシナリオの効果を評価\n3. 配信の開封率・クリック率を分析\n改善提案を含めてレポートしてください。`,
  },
  {
    title: 'シナリオ提案',
    prompt: `現在の友だちデータとタグ情報を元に、効果的なシナリオ配信を提案してください。\n1. ターゲットセグメントの特定\n2. メッセージ内容の提案\n3. 配信タイミングの最適化\n具体的なステップ配信の構成を含めてください。`,
  },
]

interface DashboardData {
  friendCount: number
  activeScenarioCount: number
  broadcastCount: number
  formSubmissionCount: number
  recentFriends: FriendWithTags[]
  recentBroadcasts: Broadcast[]
  tags: Tag[]
  topScoreFriends: { displayName: string; score: number }[]
}

function StatCard({ emoji, label, value, sub, href, color }: {
  emoji: string; label: string; value: number | null; sub?: string; href: string; color: string
}) {
  return (
    <Link href={href} className="card p-5 flex items-center gap-4 group cursor-pointer">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: color + '15' }}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">
          {value !== null ? value.toLocaleString('ja-JP') : '-'}
        </p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

function SectionCard({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h3>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const { selectedAccountId, selectedAccount } = useAccount()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [fcRes, scRes, bcRes, frRes, brRes, tgRes] = await Promise.allSettled([
          api.friends.count({ accountId: selectedAccountId ?? undefined }),
          api.scenarios.list(),
          api.broadcasts.list(),
          api.friends.list({ limit: '5', accountId: selectedAccountId ?? undefined }),
          api.broadcasts.list({ accountId: selectedAccountId ?? undefined }),
          api.tags.list(),
        ])

        const friendCount = fcRes.status === 'fulfilled' && fcRes.value.success ? fcRes.value.data.count : 0
        const scenarios = scRes.status === 'fulfilled' && scRes.value.success ? scRes.value.data : []
        const broadcasts = bcRes.status === 'fulfilled' && bcRes.value.success ? bcRes.value.data : []
        const friends = frRes.status === 'fulfilled' && frRes.value.success ? frRes.value.data.items : []
        const recentBr = brRes.status === 'fulfilled' && brRes.value.success ? brRes.value.data.slice(0, 5) : []
        const tags = tgRes.status === 'fulfilled' && tgRes.value.success ? tgRes.value.data : []

        setData({
          friendCount,
          activeScenarioCount: scenarios.filter((s) => s.isActive).length,
          broadcastCount: broadcasts.length,
          formSubmissionCount: 0,
          recentFriends: friends,
          recentBroadcasts: recentBr,
          tags,
          topScoreFriends: [],
        })
      } catch { /* ignore */ }
      finally { setLoading(false) }
    }
    load()
  }, [selectedAccountId])

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-gray-100 rounded mt-2 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map(i => <div key={i} className="card p-5 h-24 animate-pulse"><div className="h-full bg-gray-100 rounded-lg" /></div>)}
        </div>
      </div>
    )
  }

  const d = data!
  const statusLabels: Record<string, { label: string; cls: string }> = {
    draft: { label: '下書き', cls: 'bg-gray-100 text-gray-600' },
    scheduled: { label: '予約', cls: 'bg-blue-100 text-blue-700' },
    sending: { label: '送信中', cls: 'bg-yellow-100 text-yellow-700' },
    sent: { label: '完了', cls: 'bg-green-100 text-green-700' },
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {selectedAccount ? `${selectedAccount.displayName || selectedAccount.name}` : 'ダッシュボード'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">My Hisho CRM 管理画面</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard emoji="👥" label="友だち数" value={d.friendCount} href="/friends" color="#06C755" />
        <StatCard emoji="📋" label="アクティブシナリオ" value={d.activeScenarioCount} href="/scenarios" color="#3B82F6" />
        <StatCard emoji="📤" label="配信数" value={d.broadcastCount} href="/broadcasts" color="#8B5CF6" />
        <StatCard emoji="📝" label="フォーム回答" value={d.formSubmissionCount} href="/form-submissions" color="#F59E0B" />
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          <SectionCard title="最近の友だち" emoji="👤">
            {d.recentFriends.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">まだ友だちがいません</p>
            ) : (
              <div className="space-y-2">
                {d.recentFriends.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    {f.pictureUrl ? (
                      <img src={f.pictureUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(f.displayName || '?').charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{f.displayName || '不明'}</p>
                      <p className="text-[11px] text-gray-400">{new Date(f.createdAt).toLocaleDateString('ja-JP')}</p>
                    </div>
                    <div className="flex gap-1">
                      {f.tags.slice(0, 2).map((t) => (
                        <span key={t.id} className="px-1.5 py-0 rounded text-[9px] font-medium text-white" style={{ backgroundColor: t.color }}>
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="直近の配信" emoji="📨">
            {d.recentBroadcasts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">配信履歴なし</p>
            ) : (
              <div className="space-y-2">
                {d.recentBroadcasts.map((b) => {
                  const s = statusLabels[b.status] || { label: b.status, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{b.title}</p>
                        <p className="text-[11px] text-gray-400">{new Date(b.createdAt).toLocaleDateString('ja-JP')}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.cls}`}>{s.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <SectionCard title="タグ分布" emoji="🏷️">
            {d.tags.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">タグがまだありません</p>
            ) : (
              <div className="space-y-3">
                {d.tags.map((t) => (
                  <div key={t.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{t.name}</span>
                      <span className="text-[10px] text-gray-400">{t.name}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ backgroundColor: t.color, width: '40%' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="クイックアクション" emoji="⚡">
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: '/friends', label: '友だち管理', emoji: '👥', color: '#06C755' },
                { href: '/scenarios', label: 'シナリオ作成', emoji: '📋', color: '#3B82F6' },
                { href: '/broadcasts', label: '配信作成', emoji: '📤', color: '#8B5CF6' },
                { href: '/chats', label: 'チャット', emoji: '💬', color: '#06C755' },
                { href: '/rich-menus', label: 'リッチメニュー', emoji: '📱', color: '#F59E0B' },
                { href: '/automations', label: 'オートメーション', emoji: '⚡', color: '#EF4444' },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group"
                >
                  <span className="text-lg">{a.emoji}</span>
                  <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">{a.label}</span>
                </Link>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
