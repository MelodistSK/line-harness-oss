'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi, api } from '@/lib/api'
import Header from '@/components/layout/header'
import FlexPreview from '@/components/flex-preview'

// ─── Types ──────────────────────────────────────────────────────────────────

interface FormField {
  name: string
  type: string
  label: string
  required?: boolean
  placeholder?: string
  options?: string[]
}

interface Form {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  onSubmitTagId: string | null
  onSubmitScenarioId: string | null
  isActive: boolean
  submitCount: number
  submitReplyEnabled: boolean
  submitReplyType: string
  submitReplyContent: string | null
  kintoneEnabled: boolean
  kintoneSubdomain: string | null
  kintoneAppId: string | null
  kintoneApiTokenSet: boolean
  kintoneFieldMapping: Record<string, string> | null
  createdAt: string
  updatedAt: string
}

const FIELD_TYPES = [
  { type: 'text', label: 'テキスト（1行）', emoji: 'Aa' },
  { type: 'textarea', label: 'テキストエリア', emoji: '📝' },
  { type: 'radio', label: 'ラジオボタン', emoji: '⭕' },
  { type: 'select', label: 'プルダウン', emoji: '▼' },
  { type: 'checkbox', label: 'チェックボックス', emoji: '☑️' },
  { type: 'date', label: '日付', emoji: '📅' },
  { type: 'email', label: 'メール', emoji: '✉️' },
  { type: 'tel', label: '電話番号', emoji: '📞' },
  { type: 'file', label: 'ファイル', emoji: '📎' },
]

type TabId = 'list' | 'builder'

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState<TabId>('list')
  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [tags, setTags] = useState<{ id: string; name: string }[]>([])
  const [scenarios, setScenarios] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fRes, tRes, sRes] = await Promise.all([
        fetchApi<{ success: boolean; data: Form[] }>('/api/forms'),
        api.tags.list(),
        api.scenarios.list(),
      ])
      if (fRes.success) setForms(fRes.data)
      if (tRes.success) setTags(tRes.data)
      if (sRes.success) setScenarios(sRes.data)
    } catch { setError('読み込みに失敗しました') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm('このフォームを削除しますか？')) return
    try {
      await fetchApi(`/api/forms/${id}`, { method: 'DELETE' })
      setSuccess('フォームを削除しました')
      load()
    } catch { setError('削除に失敗しました') }
  }

  const openEdit = (form: Form) => {
    setEditingForm(form)
    setTab('builder')
  }

  const openCreate = () => {
    setEditingForm(null)
    setTab('builder')
  }

  const openDuplicate = (form: Form) => {
    const dup: Form = {
      ...form,
      id: '',
      name: `${form.name} (コピー)`,
      submitCount: 0,
      createdAt: '',
      updatedAt: '',
    }
    setEditingForm(dup)
    setTab('builder')
  }

  return (
    <div>
      <Header title="フォーム管理" description="GUIビルダーでフォームを作成・管理"
        action={<button onClick={openCreate} className="px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: '#06C755' }}>+ 新規フォーム</button>} />

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}<button onClick={() => setError('')} className="ml-2 text-red-400">×</button></div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}<button onClick={() => setSuccess('')} className="ml-2 text-green-400">×</button></div>}

      <div className="flex border-b border-gray-200 mb-6">
        {([['list', 'フォーム一覧'], ['builder', editingForm ? 'フォーム編集' : '新規作成']] as [TabId, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'list' && <FormList forms={forms} loading={loading} onEdit={openEdit} onDuplicate={openDuplicate} onDelete={handleDelete} />}
      {tab === 'builder' && <FormBuilder form={editingForm} tags={tags} scenarios={scenarios} onSaved={() => { load(); setTab('list') }} setError={setError} setSuccess={setSuccess} />}
    </div>
  )
}

// ─── Form List ──────────────────────────────────────────────────────────────

function FormList({ forms, loading, onEdit, onDuplicate, onDelete }: {
  forms: Form[]; loading: boolean; onEdit: (f: Form) => void; onDuplicate: (f: Form) => void; onDelete: (id: string) => void
}) {
  if (loading) return <div className="card p-8 text-center text-gray-400">読み込み中...</div>
  if (forms.length === 0) return <div className="card p-12 text-center"><p className="text-gray-400 text-lg mb-2">📝</p><p className="text-gray-500">フォームがありません</p></div>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {forms.map((f) => (
        <div key={f.id} className="card p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{f.name}</h3>
              {f.description && <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>}
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${f.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {f.isActive ? '有効' : '無効'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
            <span>📋 {f.fields.length} フィールド</span>
            <span>📬 {f.submitCount} 回答</span>
            {f.kintoneEnabled && <span className="text-blue-500">🔗 kintone</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onEdit(f)} className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100">編集</button>
            <button onClick={() => onDuplicate(f)} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 border border-gray-200">複製</button>
            <button onClick={() => onDelete(f.id)} className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-md hover:bg-red-100">削除</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Form Builder ───────────────────────────────────────────────────────────

function FormBuilder({ form, tags, scenarios, onSaved, setError, setSuccess }: {
  form: Form | null
  tags: { id: string; name: string }[]
  scenarios: { id: string; name: string }[]
  onSaved: () => void
  setError: (s: string) => void
  setSuccess: (s: string) => void
}) {
  const [name, setName] = useState(form?.name || '')
  const [description, setDescription] = useState(form?.description || '')
  const [fields, setFields] = useState<FormField[]>(form?.fields || [])
  const [tagId, setTagId] = useState(form?.onSubmitTagId || '')
  const [scenarioId, setScenarioId] = useState(form?.onSubmitScenarioId || '')
  const [replyEnabled, setReplyEnabled] = useState(form?.submitReplyEnabled ?? true)
  const [replyType, setReplyType] = useState(form?.submitReplyType || 'flex')
  const [replyContent, setReplyContent] = useState(form?.submitReplyContent || '')
  const [kintoneEnabled, setKintoneEnabled] = useState(form?.kintoneEnabled || false)
  const [kintoneSubdomain, setKintoneSubdomain] = useState(form?.kintoneSubdomain || '')
  const [kintoneAppId, setKintoneAppId] = useState(form?.kintoneAppId || '')
  const [kintoneApiToken, setKintoneApiToken] = useState('')
  const [kintoneFieldMapping, setKintoneFieldMapping] = useState<Record<string, string>>(form?.kintoneFieldMapping || {})
  const [kintoneFields, setKintoneFields] = useState<{ code: string; label: string; type: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [kintoneTesting, setKintoneTesting] = useState(false)
  const [builderTab, setBuilderTab] = useState<'fields' | 'settings' | 'kintone'>('fields')

  const addField = (type: string) => {
    const idx = fields.length + 1
    const newField: FormField = {
      name: `field_${idx}`,
      type,
      label: FIELD_TYPES.find(t => t.type === type)?.label || type,
      required: false,
      ...(type === 'radio' || type === 'select' || type === 'checkbox' ? { options: ['選択肢1', '選択肢2'] } : {}),
    }
    setFields([...fields, newField])
  }

  const updateField = (idx: number, patch: Partial<FormField>) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  const removeField = (idx: number) => setFields(prev => prev.filter((_, i) => i !== idx))
  const moveField = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= fields.length) return
    const arr = [...fields];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    setFields(arr)
  }

  const insertDefaultTemplate = () => {
    const answerRows = fields.map(f => ({
      type: 'box', layout: 'vertical', margin: 'md',
      contents: [
        { type: 'text', text: f.label, size: 'xxs', color: '#64748b' },
        { type: 'text', text: `{{${f.name}}}`, size: 'sm', color: '#1e293b', weight: 'bold', wrap: true },
      ],
    }))
    const template = {
      type: 'bubble', size: 'giga',
      header: {
        type: 'box', layout: 'vertical',
        contents: [
          { type: 'text', text: '診断結果', size: 'lg', weight: 'bold', color: '#1e293b' },
          { type: 'text', text: '{{name}}さんのプロフィール', size: 'xs', color: '#64748b', margin: 'sm' },
        ],
        paddingAll: '20px', backgroundColor: '#f0fdf4',
      },
      body: {
        type: 'box', layout: 'vertical',
        contents: answerRows.length > 0 ? answerRows : [
          { type: 'text', text: '{{name}}さん、送信ありがとうございます！', size: 'sm', wrap: true, color: '#1e293b' },
        ],
        paddingAll: '20px',
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'button', action: { type: 'message', label: 'アカウント連携を見る', text: 'アカウント連携を見る' }, style: 'primary', color: '#14b8a6' },
        ],
      },
    }
    setReplyContent(JSON.stringify(template, null, 2))
    setReplyType('flex')
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('フォーム名を入力してください'); return }
    setSaving(true)
    try {
      const payload = {
        name, description: description || null, fields,
        onSubmitTagId: tagId || null, onSubmitScenarioId: scenarioId || null,
        submitReplyEnabled: replyEnabled,
        submitReplyType: replyType,
        submitReplyContent: replyContent || null,
        kintoneEnabled, kintoneSubdomain: kintoneSubdomain || null,
        kintoneAppId: kintoneAppId || null, ...(kintoneApiToken ? { kintoneApiToken } : {}),
        kintoneFieldMapping: Object.keys(kintoneFieldMapping).length > 0 ? kintoneFieldMapping : null,
      }
      const isUpdate = form && form.id
      const url = isUpdate ? `/api/forms/${form.id}` : '/api/forms'
      const method = isUpdate ? 'PUT' : 'POST'
      const res = await fetchApi<{ success: boolean; error?: string }>(url, { method, body: JSON.stringify(payload) })
      if (res.success) { setSuccess(isUpdate ? 'フォームを更新しました' : 'フォームを作成しました'); onSaved() }
      else setError(res.error || '保存に失敗しました')
    } catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  const testKintone = async () => {
    if (!kintoneSubdomain || !kintoneAppId || !kintoneApiToken) { setError('kintone接続情報を入力してください'); return }
    setKintoneTesting(true)
    try {
      const res = await fetchApi<{ success: boolean; data: { code: string; label: string; type: string }[]; error?: string }>(
        `/api/forms/${form?.id || 'new'}/kintone-test`,
        { method: 'POST', body: JSON.stringify({ subdomain: kintoneSubdomain, appId: kintoneAppId, apiToken: kintoneApiToken }) })
      if (res.success) { setKintoneFields(res.data); setSuccess(`kintone接続成功: ${res.data.length} フィールド取得`) }
      else setError(res.error || 'kintone接続に失敗しました')
    } catch { setError('kintone接続テストに失敗しました') }
    finally { setKintoneTesting(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Field palette */}
      <div className="lg:col-span-1">
        <div className="card p-4 sticky top-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">フィールド追加</h3>
          <div className="grid grid-cols-2 gap-2">
            {FIELD_TYPES.map((ft) => (
              <button key={ft.type} onClick={() => addField(ft.type)}
                className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors border border-gray-200 hover:border-blue-200">
                <span className="text-sm">{ft.emoji}</span>
                {ft.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Builder + Preview */}
      <div className="lg:col-span-2 space-y-4">
        {/* Sub-tabs */}
        <div className="flex gap-2 mb-2">
          {[['fields', '📋 フィールド'], ['settings', '⚙️ 設定'], ['kintone', '🔗 kintone連携']] .map(([id, label]) => (
            <button key={id} onClick={() => setBuilderTab(id as typeof builderTab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${builderTab === id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {builderTab === 'fields' && (
          <div className="card p-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">フォーム名 *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="お問い合わせフォーム"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="フォームの説明"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>

            {fields.length === 0 ? (
              <div className="py-12 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <p className="text-2xl mb-2">📋</p>
                <p className="text-sm">左のパレットからフィールドを追加してください</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-gray-400 w-6">#{idx + 1}</span>
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{FIELD_TYPES.find(t => t.type === field.type)?.label || field.type}</span>
                      <div className="flex-1" />
                      <button onClick={() => moveField(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs">▲</button>
                      <button onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs">▼</button>
                      <button onClick={() => removeField(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">ラベル</label>
                        <input type="text" value={field.label} onChange={(e) => updateField(idx, { label: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">フィールド名</label>
                        <input type="text" value={field.name} onChange={(e) => updateField(idx, { name: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono" />
                      </div>
                      <div className="flex items-end gap-2">
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input type="checkbox" checked={field.required || false} onChange={(e) => updateField(idx, { required: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                          必須
                        </label>
                      </div>
                    </div>
                    {(field.type === 'radio' || field.type === 'select' || field.type === 'checkbox') && (
                      <div className="mt-2">
                        <label className="block text-[10px] text-gray-500 mb-0.5">選択肢（改行区切り）</label>
                        <textarea value={(field.options || []).join('\n')} rows={3}
                          onChange={(e) => updateField(idx, { options: e.target.value.split('\n').filter(Boolean) })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" placeholder="選択肢1&#10;選択肢2&#10;選択肢3" />
                      </div>
                    )}
                    {(field.type === 'text' || field.type === 'email' || field.type === 'tel' || field.type === 'textarea') && (
                      <div className="mt-2">
                        <label className="block text-[10px] text-gray-500 mb-0.5">プレースホルダー</label>
                        <input type="text" value={field.placeholder || ''} onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {builderTab === 'settings' && (
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">送信時の設定</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">送信時タグ付与</label>
              <select value={tagId} onChange={(e) => setTagId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">なし</option>
                {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">送信時シナリオ開始</label>
              <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">なし</option>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* 送信後メッセージ */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">送信後メッセージ</h3>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={replyEnabled} onChange={(e) => setReplyEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <span className={replyEnabled ? 'text-green-600 font-medium' : 'text-gray-400'}>
                    {replyEnabled ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>

              {replyEnabled && (
                <div className="space-y-3">
                  {/* Type selector */}
                  <div className="flex gap-4">
                    {[['text', 'テキスト'], ['flex', 'Flex メッセージ']].map(([val, label]) => (
                      <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="radio" value={val} checked={replyType === val} onChange={() => setReplyType(val)}
                          className="w-3.5 h-3.5 text-blue-600" />
                        {label}
                      </label>
                    ))}
                  </div>

                  {/* Variable reference */}
                  <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-0.5">
                    <p className="font-semibold mb-1">使用可能な変数:</p>
                    <p><code className="bg-blue-100 px-1 rounded">{'{{'+'name'+'}}'}</code> = 友だちの名前</p>
                    {fields.map(f => (
                      <p key={f.name}><code className="bg-blue-100 px-1 rounded">{`{{${f.name}}}`}</code> = {f.label}</p>
                    ))}
                    {fields.length === 0 && <p className="text-blue-400">（フィールドを追加すると変数が使えます）</p>}
                  </div>

                  {replyType === 'text' && (
                    <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} rows={4}
                      placeholder={`{{name}}さん、ありがとうございます！`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y" />
                  )}

                  {replyType === 'flex' && (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-600">Flex JSON</label>
                        <button onClick={insertDefaultTemplate}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors">
                          デフォルトテンプレート挿入
                        </button>
                      </div>
                      <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} rows={14}
                        placeholder={'{\n  "type": "bubble",\n  ...\n}'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono resize-y" />
                      {replyContent && (() => {
                        try {
                          const preview = replyContent.replace(/\{\{name\}\}/g, '山田太郎').replace(/\{\{(\w+)\}\}/g, 'サンプル値')
                          JSON.parse(preview)
                          return <div className="mt-1"><FlexPreview content={preview} maxWidth={380} /></div>
                        } catch { return <p className="text-xs text-red-500 mt-1">JSON が無効です</p> }
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {builderTab === 'kintone' && (
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">kintone連携</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={kintoneEnabled} onChange={(e) => setKintoneEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                有効
              </label>
            </div>
            {kintoneEnabled && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">サブドメイン</label>
                    <input type="text" value={kintoneSubdomain} onChange={(e) => setKintoneSubdomain(e.target.value)} placeholder="xxx"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <p className="text-[10px] text-gray-400 mt-0.5">xxx.cybozu.com</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">アプリID</label>
                    <input type="text" value={kintoneAppId} onChange={(e) => setKintoneAppId(e.target.value)} placeholder="10"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">APIトークン</label>
                    <input type="password" value={kintoneApiToken} onChange={(e) => setKintoneApiToken(e.target.value)}
                      placeholder={form?.kintoneApiTokenSet ? '（設定済み・変更する場合のみ入力）' : ''}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                </div>
                <button onClick={testKintone} disabled={kintoneTesting}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50">
                  {kintoneTesting ? 'テスト中...' : '接続テスト'}
                </button>
                {kintoneFields.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 mb-2">フィールドマッピング</h4>
                    <div className="space-y-2">
                      {fields.map((f) => (
                        <div key={f.name} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                          <span className="text-xs font-medium text-gray-700 w-32 truncate">{f.label}</span>
                          <span className="text-gray-400 text-xs">→</span>
                          <select value={kintoneFieldMapping[f.name] || ''} onChange={(e) => setKintoneFieldMapping(prev => ({ ...prev, [f.name]: e.target.value }))}
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs">
                            <option value="">-- 未設定 --</option>
                            {kintoneFields.map(kf => <option key={kf.code} value={kf.code}>{kf.label} ({kf.code})</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="w-full py-3 text-sm font-medium text-white rounded-xl disabled:opacity-50 transition-opacity" style={{ backgroundColor: '#06C755' }}>
          {saving ? '保存中...' : (form && form.id) ? 'フォームを更新' : 'フォームを作成'}
        </button>
      </div>
    </div>
  )
}
