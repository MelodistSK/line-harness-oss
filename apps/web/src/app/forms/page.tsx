'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi, api } from '@/lib/api'
import Header from '@/components/layout/header'

interface Form {
  id: string
  name: string
  description: string | null
  fields: string
  settings: string
  isActive: number
  createdAt: string
  updatedAt: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', fields: '[]', tagId: '', scenarioId: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [tags, setTags] = useState<{ id: string; name: string }[]>([])
  const [scenarios, setScenarios] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: Form[]; error?: string }>('/api/forms')
      if (res.success) {
        setForms(res.data)
      } else {
        setError(res.error || 'フォームの読み込みに失敗しました')
      }
    } catch {
      setError('フォームの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (showCreate || editId) {
      api.tags.list().then(r => { if (r.success) setTags(r.data) }).catch(() => {})
      api.scenarios.list().then(r => { if (r.success) setScenarios(r.data) }).catch(() => {})
    }
  }, [showCreate, editId])

  const openEdit = async (id: string) => {
    try {
      const res = await fetchApi<{ success: boolean; data: Form }>(`/api/forms/${id}`)
      if (res.success) {
        const f = res.data
        const settings = JSON.parse(f.settings || '{}')
        setForm({
          name: f.name,
          description: f.description || '',
          fields: f.fields,
          tagId: settings.tagId || '',
          scenarioId: settings.scenarioId || '',
        })
        setEditId(id)
        setShowCreate(false)
      }
    } catch {
      setError('フォーム情報の取得に失敗しました')
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('フォーム名を入力してください'); return }
    setSaving(true)
    setFormError('')

    let fieldsArr: unknown[]
    try {
      fieldsArr = JSON.parse(form.fields)
      if (!Array.isArray(fieldsArr)) throw new Error()
    } catch {
      setFormError('フィールド定義はJSON配列で入力してください')
      setSaving(false)
      return
    }

    const settings = JSON.stringify({
      ...(form.tagId ? { tagId: form.tagId } : {}),
      ...(form.scenarioId ? { scenarioId: form.scenarioId } : {}),
    })

    try {
      const url = editId ? `/api/forms/${editId}` : '/api/forms'
      const method = editId ? 'PUT' : 'POST'
      const res = await fetchApi<{ success: boolean; error?: string }>(url, {
        method,
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          fields: form.fields,
          settings,
        }),
      })
      if (res.success) {
        setShowCreate(false)
        setEditId(null)
        setForm({ name: '', description: '', fields: '[]', tagId: '', scenarioId: '' })
        load()
      } else {
        setFormError(res.error || '保存に失敗しました')
      }
    } catch {
      setFormError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このフォームを削除してもよいですか？')) return
    try {
      await fetchApi<{ success: boolean }>(`/api/forms/${id}`, { method: 'DELETE' })
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const isEditing = showCreate || editId

  return (
    <div>
      <Header
        title="フォーム管理"
        action={
          <button
            onClick={() => { setShowCreate(true); setEditId(null); setForm({ name: '', description: '', fields: '[]', tagId: '', scenarioId: '' }) }}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規フォーム
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {isEditing && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{editId ? 'フォームを編集' : '新規フォームを作成'}</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">フォーム名 <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: お問い合わせフォーム" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="フォームの説明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">フィールド定義 (JSON)</label>
              <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                rows={5} placeholder='[{"name":"email","type":"text","label":"メールアドレス","required":true}]'
                value={form.fields} onChange={(e) => setForm({ ...form, fields: e.target.value })} />
              <p className="text-xs text-gray-400 mt-1">JSON配列で定義。各フィールド: name, type, label, required</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">送信時タグ付与</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })}>
                <option value="">なし</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">送信時シナリオ開始</label>
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
                {saving ? '保存中...' : editId ? '更新' : '作成'}
              </button>
              <button onClick={() => { setShowCreate(false); setEditId(null); setFormError('') }}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-4 animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-48" />
                <div className="h-2 bg-gray-100 rounded w-32" />
              </div>
              <div className="h-5 bg-gray-100 rounded-full w-16" />
            </div>
          ))}
        </div>
      ) : forms.length === 0 && !isEditing ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">フォームがありません。「新規フォーム」から作成してください。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">フォーム名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ステータス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">フィールド数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">作成日時</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {forms.map((f) => {
                  let fieldCount = 0
                  try { fieldCount = JSON.parse(f.fields).length } catch { /* ignore */ }
                  return (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(f.id)} className="text-sm font-medium text-gray-900 hover:text-green-600 transition-colors text-left">
                          {f.name}
                        </button>
                        {f.description && <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${f.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {f.isActive ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{fieldCount} フィールド</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(f.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(f.id)}
                          className="px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors">
                          削除
                        </button>
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
