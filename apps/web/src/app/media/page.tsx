'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'
import MediaUploader from '@/components/media-uploader'

interface AssetItem {
  filename: string
  url: string
  contentType?: string
  size?: number
  originalName?: string
  uploadedAt?: string
  storage?: 'r2' | 'kv'
}

function formatSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso?: string): string {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

export default function MediaPage() {
  const [items, setItems] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all')
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState('')
  const [migrating, setMigrating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const queryType = filter !== 'all' ? `?type=${filter}` : ''
      const res = await fetchApi<{ success: boolean; data: AssetItem[] }>(`/api/assets${queryType}`)
      if (res.success) setItems(res.data)
    } catch { setError('読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const handleDelete = async (filename: string) => {
    if (!confirm(`"${filename}" を削除しますか？`)) return
    try {
      await fetchApi(`/api/assets/${filename}`, { method: 'DELETE' })
      setSuccess('削除しました')
      load()
    } catch { setError('削除に失敗しました') }
  }

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(''), 2000)
  }

  const filtered = items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.filename.toLowerCase().includes(q) || item.originalName?.toLowerCase().includes(q)
  })

  const isVideo = (ct?: string) => ct?.startsWith('video/')

  return (
    <div>
      <Header
        title="メディア管理"
        description="アップロード済みの画像・動画を管理"
        action={
          <MediaUploader
            accept="all"
            label="新規アップロード"
            onUploaded={() => { setSuccess('アップロードしました'); load() }}
          />
        }
      />

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}<button onClick={() => setError('')} className="ml-2 text-red-400">x</button></div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}<button onClick={() => setSuccess('')} className="ml-2 text-green-400">x</button></div>}

      {/* Storage stats */}
      {(() => {
        const totalSize = items.reduce((sum, i) => sum + (i.size ?? 0), 0)
        const r2Count = items.filter(i => i.storage === 'r2').length
        const kvCount = items.filter(i => i.storage === 'kv').length
        const usedGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2)
        return (
          <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
              <span className="text-sm font-medium text-gray-700">R2: {usedGB} GB / 10 GB</span>
            </div>
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (totalSize / (10 * 1024 * 1024 * 1024)) * 100)}%` }} />
            </div>
            <span className="text-xs text-gray-400">{items.length} ファイル ({r2Count} R2{kvCount > 0 ? ` / ${kvCount} KV` : ''})</span>
            <span className="text-xs text-gray-400">上限 100MB/ファイル</span>
            {kvCount > 0 && (
              <button
                onClick={async () => {
                  if (!confirm(`KVの${kvCount}ファイルをR2に移行しますか？`)) return
                  setMigrating(true)
                  try {
                    const res = await fetchApi<{ success: boolean; data: { migrated: number; skipped: number; failed: number } }>('/api/assets/migrate-to-r2', { method: 'POST' })
                    if (res.success) setSuccess(`R2移行完了: ${res.data.migrated}件移行, ${res.data.skipped}件スキップ, ${res.data.failed}件失敗`)
                    load()
                  } catch { setError('R2移行に失敗しました') }
                  finally { setMigrating(false) }
                }}
                disabled={migrating}
                className="ml-auto px-3 py-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
              >
                {migrating ? '移行中...' : `KV→R2 移行 (${kvCount}件)`}
              </button>
            )}
          </div>
        )
      })()}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-1">
          {(['all', 'image', 'video'] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'all' ? `全て (${items.length})` : t === 'image' ? '画像' : '動画'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ファイル名で検索..."
          className="flex-1 max-w-sm px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="card p-12 text-center text-gray-400">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-2xl mb-2">🖼</p>
          <p className="text-gray-500">ファイルがありません</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(item => (
            <div key={item.filename} className="card overflow-hidden group">
              {/* Thumbnail */}
              <div className="aspect-square bg-gray-100 relative">
                {isVideo(item.contentType) ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white">
                    <svg className="w-10 h-10 opacity-60" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span className="text-[10px] mt-2 opacity-40">VIDEO</span>
                  </div>
                ) : (
                  <img src={item.url} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-1.5">
                <p className="text-xs font-medium text-gray-800 truncate" title={item.originalName || item.filename}>
                  {item.originalName || item.filename}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span>{formatSize(item.size)}</span>
                  <span>{item.contentType?.split('/')[1]?.toUpperCase()}</span>
                </div>
                <p className="text-[10px] text-gray-400">{formatDate(item.uploadedAt)}</p>

                {/* Actions */}
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => copyUrl(item.url, item.filename)}
                    className={`flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                      copiedId === item.filename
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {copiedId === item.filename ? 'Copied!' : 'URL Copy'}
                  </button>
                  <button
                    onClick={() => handleDelete(item.filename)}
                    className="px-2 py-1 text-[10px] font-medium text-red-500 bg-red-50 rounded hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
