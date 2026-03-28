'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi, api } from '@/lib/api'
import Header from '@/components/layout/header'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

type EditingLink = TrackedLink | 'new' | null

export default function TrackedLinksPage() {
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
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: TrackedLink[]; error?: string }>('/api/tracked-links')
      if (res.success) {
        setLinks(res.data)
      } else {
        setError(res.error || '読み込みに失敗しました')
      }
    } catch {
      setError('トラッキングリンクの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (editingLink) {
      api.tags.list().then(r => { if (r.success) setTags(r.data) }).catch(() => {})
      api.scenarios.list().then(r => { if (r.success) setScenarios(r.data) }).catch(() => {})
    }
  }, [editingLink])

  const openCreate = () => {
    setEditingLink('new')
    setForm({ name: '', url: '', tagId: '', scenarioId: '' })
    setFormError('')
  }

  const openEdit = (link: TrackedLink) => {
    setEditingLink(link)
    setForm({
      name: link.name,
      url: link.url,
      tagId: link.tagId || '',
      scenarioId: link.scenarioId || '',
    })
    setFormError('')
  }

  const openDuplicate = (link: TrackedLink) => {
    setEditingLink('new')
    setForm({
      name: `${link.name} (コピー)`,
      url: link.url,
      tagId: link.tagId || '',
      scenarioId: link.scenarioId || '',
    })
    setFormError('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('リンク名を入力してください'); return }
    if (!form.url.trim()) { setFormError('URLを入力してください'); return }
    setSaving(true)
    setFormError('')
    const isEdit = editingLink !== 'new' && editingLink !== null
    try {
      const apiUrl = isEdit ? `/api/tracked-links/${editingLink.id}` : '/api/tracked-links'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = isEdit
        ? { name: form.name, originalUrl: form.url, tagId: form.tagId || null, scenarioId: form.scenarioId || null }
        : { name: form.name, url: form.url, tagId: form.tagId || null, scenarioId: form.scenarioId || null }
      const res = await fetchApi<{ success: boolean; error?: string }>(apiUrl, {
        method,
        body: JSON.stringify(payload),
      })
      if (res.success) {
        setEditingLink(null)
        setForm({ name: '', url: '', tagId: '', scenarioId: '' })
        load()
      } else {
        setFormError(res.error || (isEdit ? '更新に失敗しました' : '作成に失敗しました'))
      }
    } catch {
      setFormError(isEdit ? '更新に失敗しました' : '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このリンクを削除してもよいですか？')) return
    try {
      await fetchApi<{ success: boolean }>(`/api/tracked-links/${id}`, { method: 'DELETE' })
      if (detail?.id === id) setDetail(null)
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const showDetail = async (id: string) => {
    try {
      const res = await fetchApi<{ success: boolean; data: TrackedLinkDetail }>(`/api/tracked-links/${id}`)
      if (res.success) setDetail(res.data)
    } catch {
      setError('詳細の読み込みに失敗しました')
    }
  }

  return (
    <div>
      <Header
        title="トラッキングリンク"
        action={
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規リンク
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {editingLink && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">
            {editingLink === 'new' ? '新規トラッキングリンクを作成' : 'リンク編集'}
          </h2>
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
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })}>
                <option value="">なし</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">シナリオ開始</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.scenarioId} onChange={(e) => setForm({ ...form, scenarioId: e.target.value })}>
                <option value="">なし</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity" style={{ backgroundColor: '#06C755' }}>
                {saving ? '保存中...' : editingLink === 'new' ? '作成' : '更新'}
              </button>
              <button onClick={() => { setEditingLink(null); setFormError('') }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail panel */}
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
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">ユーザー</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">クリック日時</th>
                  </tr>
                </thead>
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
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-64" />
              </div>
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
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">リンク名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">URL</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">クリック数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">作成日時</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => showDetail(link.id)} className="text-sm font-medium text-gray-900 hover:text-green-600 transition-colors">
                        {link.name}
                      </button>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{link.shortCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">{link.url}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {link.clickCount} clicks
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(link.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(link)}
                          className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors">
                          編集
                        </button>
                        <button onClick={() => openDuplicate(link)}
                          className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors border border-gray-200">
                          複製
                        </button>
                        <button onClick={() => handleDelete(link.id)}
                          className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors">
                          削除
                        </button>
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
