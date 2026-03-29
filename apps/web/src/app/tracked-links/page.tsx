'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchApi, api } from '@/lib/api'
import Header from '@/components/layout/header'

// ─── Types ────────────────────────────────────────────────────────────────

interface TrackedLink {
  id: string
  name: string
  url: string
  shortCode: string
  tagId: string | null
  scenarioId: string | null
  clickCount: number
  createdAt: string
}

interface TrackedLinkDetail extends TrackedLink {
  clicks: { id: string; friendId: string; displayName: string | null; clickedAt: string }[]
}

interface QrCode {
  id: string
  name: string
  refCode: string
  scanCount: number
  friendCount: number
  isActive: boolean
  liffUrl: string
  createdAt: string
}

interface QrCodeStats {
  id: string
  name: string
  refCode: string
  scanCount: number
  friendCount: number
  daily: { date: string; count: number }[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

type TabId = 'links' | 'qr'
type EditingLink = TrackedLink | 'new' | null

// ─── Simple QR Code SVG Generator ─────────────────────────────────────────

function generateQrSvg(text: string, size = 256): string {
  // Simple QR code using a Google Charts API fallback — render as image
  // For a true offline SVG QR, we'd need a full encoder. Use an img-based approach.
  const encoded = encodeURIComponent(text)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <foreignObject width="${size}" height="${size}">
      <img xmlns="http://www.w3.org/1999/xhtml" src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&amp;data=${encoded}" width="${size}" height="${size}" style="image-rendering:pixelated"/>
    </foreignObject>
  </svg>`
}

function QrCodeImage({ url, size = 200 }: { url: string; size?: number }) {
  const encoded = encodeURIComponent(url)
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`}
      alt="QR Code"
      width={size}
      height={size}
      className="border border-gray-200 rounded-lg"
    />
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function TrackedLinksPage() {
  const [tab, setTab] = useState<TabId>('links')

  return (
    <div>
      <Header title="トラッキングリンク & QRコード" />

      <div className="flex border-b border-gray-200 mb-6">
        <button onClick={() => setTab('links')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'links' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          トラッキングリンク
        </button>
        <button onClick={() => setTab('qr')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'qr' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          QRコード
        </button>
      </div>

      {tab === 'links' && <LinksTab />}
      {tab === 'qr' && <QrCodesTab />}
    </div>
  )
}

// ─── Links Tab (existing functionality) ───────────────────────────────────

function LinksTab() {
  const [links, setLinks] = useState<TrackedLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingLink, setEditingLink] = useState<EditingLink>(null)
  const [form, setForm] = useState({ name: '', url: '', tagId: '', scenarioId: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [tags, setTags] = useState<{ id: string; name: string }[]>([])
  const [scenarios, setScenarios] = useState<{ id: string; name: string }[]>([])
  const [detail, setDetail] = useState<TrackedLinkDetail | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: TrackedLink[]; error?: string }>('/api/tracked-links')
      if (res.success) setLinks(res.data)
      else setError(res.error || '読み込みに失敗しました')
    } catch { setError('トラッキングリンクの読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (editingLink) {
      api.tags.list().then(r => { if (r.success) setTags(r.data) }).catch(() => {})
      api.scenarios.list().then(r => { if (r.success) setScenarios(r.data) }).catch(() => {})
    }
  }, [editingLink])

  const openCreate = () => { setEditingLink('new'); setForm({ name: '', url: '', tagId: '', scenarioId: '' }); setFormError('') }
  const openEdit = (link: TrackedLink) => { setEditingLink(link); setForm({ name: link.name, url: link.url, tagId: link.tagId || '', scenarioId: link.scenarioId || '' }); setFormError('') }
  const openDuplicate = (link: TrackedLink) => { setEditingLink('new'); setForm({ name: `${link.name} (コピー)`, url: link.url, tagId: link.tagId || '', scenarioId: link.scenarioId || '' }); setFormError('') }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('リンク名を入力してください'); return }
    if (!form.url.trim()) { setFormError('URLを入力してください'); return }
    setSaving(true); setFormError('')
    const isEdit = editingLink !== 'new' && editingLink !== null
    try {
      const apiUrl = isEdit ? `/api/tracked-links/${editingLink.id}` : '/api/tracked-links'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = isEdit
        ? { name: form.name, originalUrl: form.url, tagId: form.tagId || null, scenarioId: form.scenarioId || null }
        : { name: form.name, url: form.url, tagId: form.tagId || null, scenarioId: form.scenarioId || null }
      const res = await fetchApi<{ success: boolean; error?: string }>(apiUrl, { method, body: JSON.stringify(payload) })
      if (res.success) { setEditingLink(null); setForm({ name: '', url: '', tagId: '', scenarioId: '' }); load() }
      else setFormError(res.error || (isEdit ? '更新に失敗しました' : '作成に失敗しました'))
    } catch { setFormError(isEdit ? '更新に失敗しました' : '作成に失敗しました') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このリンクを削除してもよいですか？')) return
    try { await fetchApi(`/api/tracked-links/${id}`, { method: 'DELETE' }); if (detail?.id === id) setDetail(null); load() }
    catch { setError('削除に失敗しました') }
  }

  const showDetail = async (id: string) => {
    try {
      const res = await fetchApi<{ success: boolean; data: TrackedLinkDetail }>(`/api/tracked-links/${id}`)
      if (res.success) setDetail(res.data)
    } catch { setError('詳細の読み込みに失敗しました') }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90" style={{ backgroundColor: '#06C755' }}>
          + 新規リンク
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      {editingLink && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{editingLink === 'new' ? '新規トラッキングリンクを作成' : 'リンク編集'}</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">リンク名 <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: Instagram広告リンク" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">遷移先URL <span className="text-red-500">*</span></label>
              <input type="url" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="https://example.com" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">タグ自動付与</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })}>
                <option value="">なし</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">シナリオ開始</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={form.scenarioId} onChange={(e) => setForm({ ...form, scenarioId: e.target.value })}>
                <option value="">なし</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
                {saving ? '保存中...' : editingLink === 'new' ? '作成' : '更新'}
              </button>
              <button onClick={() => { setEditingLink(null); setFormError('') }} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">{detail.name} のクリック詳細</h2>
            <button onClick={() => setDetail(null)} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
          {detail.clicks.length === 0 ? (
            <p className="text-sm text-gray-500">クリックはありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead><tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">ユーザー</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">クリック日時</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.clicks.map((click) => (
                    <tr key={click.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{click.displayName || click.friendId}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{formatDate(click.clickedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2"><div className="h-3 bg-gray-200 rounded w-48" /><div className="h-2 bg-gray-100 rounded w-64" /></div>
              <div className="h-5 bg-gray-100 rounded w-12" />
            </div>
          ))}
        </div>
      ) : links.length === 0 && !editingLink ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">トラッキングリンクがありません。「新規リンク」から作成してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">リンク名</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">URL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">クリック数</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">作成日時</th>
                <th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => showDetail(link.id)} className="text-sm font-medium text-gray-900 hover:text-green-600">{link.name}</button>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{link.shortCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">{link.url}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{link.clickCount} clicks</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(link.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(link)} className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md">編集</button>
                        <button onClick={() => openDuplicate(link)} className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md border border-gray-200">複製</button>
                        <button onClick={() => handleDelete(link.id)} className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md">削除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── QR Codes Tab ─────────────────────────────────────────────────────────

function QrCodesTab() {
  const [qrCodes, setQrCodes] = useState<QrCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedQr, setSelectedQr] = useState<QrCode | null>(null)
  const [stats, setStats] = useState<QrCodeStats | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: QrCode[] }>('/api/qr-codes')
      if (res.success) setQrCodes(res.data)
    } catch { setError('QRコードの読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetchApi<{ success: boolean; data: QrCode; error?: string }>('/api/qr-codes', {
        method: 'POST',
        body: JSON.stringify({ name: newName }),
      })
      if (res.success) {
        setSuccess('QRコードを作成しました')
        setNewName('')
        setShowCreate(false)
        load()
      } else {
        setError(res.error || '作成に失敗しました')
      }
    } catch { setError('作成に失敗しました') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    try {
      await fetchApi(`/api/qr-codes/${id}`, { method: 'DELETE' })
      setSuccess('削除しました')
      if (selectedQr?.id === id) { setSelectedQr(null); setStats(null) }
      load()
    } catch { setError('削除に失敗しました') }
  }

  const showStats = async (qr: QrCode) => {
    setSelectedQr(qr)
    try {
      const res = await fetchApi<{ success: boolean; data: QrCodeStats }>(`/api/qr-codes/${qr.id}/stats`)
      if (res.success) setStats(res.data)
    } catch { /* ignore */ }
  }

  const downloadQr = (url: string, name: string) => {
    const link = document.createElement('a')
    link.href = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(url)}`
    link.download = `qr-${name}.png`
    link.click()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{qrCodes.length}件のQRコード</p>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90" style={{ backgroundColor: '#06C755' }}>
          + QRコード作成
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}<button onClick={() => setError('')} className="ml-2">✕</button></div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}<button onClick={() => setSuccess('')} className="ml-2">✕</button></div>}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 card p-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">QRコード作成</h3>
          <div className="flex gap-3 items-end max-w-lg">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">名前 <span className="text-red-500">*</span></label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: 渋谷店チラシ、展示会ブースA"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} />
            </div>
            <button onClick={handleCreate} disabled={saving || !newName.trim()} className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50" style={{ backgroundColor: '#06C755' }}>
              {saving ? '作成中...' : '作成'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName('') }} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">キャンセル</button>
          </div>
        </div>
      )}

      {/* Stats detail */}
      {selectedQr && stats && (
        <div className="mb-6 card p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{selectedQr.name} の統計</h3>
              <p className="text-xs text-gray-400 mt-1 font-mono">{selectedQr.refCode}</p>
            </div>
            <button onClick={() => { setSelectedQr(null); setStats(null) }} className="text-xs text-gray-400 hover:text-gray-600">閉じる</button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.scanCount}</p>
              <p className="text-xs text-blue-500">スキャン数</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.friendCount}</p>
              <p className="text-xs text-green-500">友だち追加数</p>
            </div>
          </div>
          {stats.daily.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">日別推移</h4>
              <MiniBarChart data={stats.daily} />
            </div>
          )}
        </div>
      )}

      {/* QR code list */}
      {loading ? (
        <div className="card p-12 text-center text-gray-400">読み込み中...</div>
      ) : qrCodes.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">QRコードがまだありません</p>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>
            最初のQRコードを作成
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {qrCodes.map(qr => (
            <div key={qr.id} className="card p-5">
              <div className="flex gap-4">
                <div className="shrink-0 cursor-pointer" onClick={() => showStats(qr)}>
                  <QrCodeImage url={qr.liffUrl} size={100} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{qr.name}</h3>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{qr.refCode}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <span>{qr.scanCount} スキャン</span>
                    <span>{qr.friendCount} 友だち</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => downloadQr(qr.liffUrl, qr.name)}
                      className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded">DL</button>
                    <button onClick={() => showStats(qr)}
                      className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200">統計</button>
                    <button onClick={() => handleDelete(qr.id, qr.name)}
                      className="px-2 py-1 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded">削除</button>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 truncate">{qr.liffUrl}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Mini Bar Chart (pure CSS, no deps) ───────────────────────────────────

function MiniBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  const recent = data.slice(-14) // last 14 days

  return (
    <div className="flex items-end gap-1 h-24">
      {recent.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-green-400 rounded-t-sm min-h-[2px] transition-all"
            style={{ height: `${(d.count / max) * 100}%` }}
            title={`${d.date}: ${d.count}件`}
          />
          <span className="text-[9px] text-gray-400">{d.date.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}
