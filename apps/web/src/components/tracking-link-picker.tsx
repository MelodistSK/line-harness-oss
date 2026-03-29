'use client'

import { useState, useEffect } from 'react'
import { fetchApi } from '@/lib/api'

interface TrackedLink {
  id: string
  name: string
  url: string
  trackingUrl: string
  shortCode: string
  clickCount: number
}

interface Props {
  onSelect: (trackingUrl: string, name: string) => void
  onClose: () => void
}

export default function TrackingLinkPicker({ onSelect, onClose }: Props) {
  const [links, setLinks] = useState<TrackedLink[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchApi<{ success: boolean; data: TrackedLink[] }>('/api/tracked-links')
      .then(res => { if (res.success) setLinks(res.data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = search
    ? links.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || l.url.includes(search))
    : links

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">トラッキングリンクを挿入</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="リンク名で検索..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">
              {links.length === 0 ? 'トラッキングリンクがありません' : '検索結果なし'}
            </p>
          ) : (
            filtered.map(link => (
              <button
                key={link.id}
                onClick={() => onSelect(link.trackingUrl || link.shortCode, link.name)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-green-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 group-hover:text-green-700">{link.name}</span>
                  <span className="text-xs text-gray-400">{link.clickCount} clicks</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{link.url}</p>
                <p className="text-xs text-green-600 font-mono mt-0.5 truncate">{link.trackingUrl || link.shortCode}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
