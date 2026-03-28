'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import MediaUploader, { type MediaAccept } from './media-uploader'

interface AssetItem {
  filename: string
  url: string
  contentType?: string
  size?: number
  originalName?: string
  uploadedAt?: string
}

interface MediaPickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
  accept?: MediaAccept
}

function formatSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MediaPickerModal({ open, onClose, onSelect, accept = 'all' }: MediaPickerModalProps) {
  const [items, setItems] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>(accept === 'all' ? 'all' : accept)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const queryType = filter !== 'all' ? `?type=${filter}` : ''
      const res = await fetchApi<{ success: boolean; data: AssetItem[] }>(`/api/assets${queryType}`)
      if (res.success) setItems(res.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { if (open) load() }, [open, load])

  if (!open) return null

  const filtered = items.filter(item => {
    if (search) {
      const q = search.toLowerCase()
      return (item.filename.toLowerCase().includes(q) || item.originalName?.toLowerCase().includes(q))
    }
    return true
  })

  const isVideo = (ct?: string) => ct?.startsWith('video/')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">メディアライブラリ</h2>
          <div className="flex items-center gap-3">
            <MediaUploader
              accept={accept}
              label="新規アップロード"
              onUploaded={(url) => { onSelect(url); onClose() }}
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div className="flex gap-1">
            {(['all', 'image', 'video'] as const).map(t => (
              <button key={t} onClick={() => setFilter(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${filter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {t === 'all' ? '全て' : t === 'image' ? '画像' : '動画'}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ファイル名で検索..."
            className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400 py-12 text-sm">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-sm">ファイルがありません</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filtered.map(item => (
                <button
                  key={item.filename}
                  onClick={() => { onSelect(item.url); onClose() }}
                  className="group relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors bg-gray-100"
                >
                  {isVideo(item.contentType) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white">
                      <svg className="w-8 h-8 opacity-60" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      <span className="text-[9px] mt-1 opacity-50 truncate max-w-full px-1">{item.originalName || item.filename}</span>
                    </div>
                  ) : (
                    <img src={item.url} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[9px] text-white truncate">{item.originalName || item.filename}</p>
                    <p className="text-[8px] text-white/60">{formatSize(item.size)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
