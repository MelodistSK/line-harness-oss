'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RichMenu {
  richMenuId: string
  name: string
  chatBarText: string
  selected: boolean
  size: { width: number; height: number }
  areas: RichMenuArea[]
}

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number }
  action: { type: string; text?: string; uri?: string; data?: string; label?: string }
}

interface Tag {
  id: string
  name: string
  color: string
}

interface TagMapping {
  id: string
  tagId: string
  richMenuId: string
}

interface Friend {
  id: string
  lineUserId: string
  displayName: string | null
  pictureUrl: string | null
  tags: Tag[]
}

// ─── Layout Presets ─────────────────────────────────────────────────────────

type LayoutPreset = { name: string; cols: number; rows: number; areas: { x: number; y: number; w: number; h: number }[] }

const PRESETS: Record<string, LayoutPreset[]> = {
  large: [
    { name: '1エリア', cols: 1, rows: 1, areas: [{ x: 0, y: 0, w: 2500, h: 1686 }] },
    { name: '2列', cols: 2, rows: 1, areas: [{ x: 0, y: 0, w: 1250, h: 1686 }, { x: 1250, y: 0, w: 1250, h: 1686 }] },
    { name: '3列', cols: 3, rows: 1, areas: [{ x: 0, y: 0, w: 833, h: 1686 }, { x: 833, y: 0, w: 834, h: 1686 }, { x: 1667, y: 0, w: 833, h: 1686 }] },
    { name: '2行', cols: 1, rows: 2, areas: [{ x: 0, y: 0, w: 2500, h: 843 }, { x: 0, y: 843, w: 2500, h: 843 }] },
    { name: '2x2グリッド', cols: 2, rows: 2, areas: [{ x: 0, y: 0, w: 1250, h: 843 }, { x: 1250, y: 0, w: 1250, h: 843 }, { x: 0, y: 843, w: 1250, h: 843 }, { x: 1250, y: 843, w: 1250, h: 843 }] },
    { name: '3x2グリッド', cols: 3, rows: 2, areas: [{ x: 0, y: 0, w: 833, h: 843 }, { x: 833, y: 0, w: 834, h: 843 }, { x: 1667, y: 0, w: 833, h: 843 }, { x: 0, y: 843, w: 833, h: 843 }, { x: 833, y: 843, w: 834, h: 843 }, { x: 1667, y: 843, w: 833, h: 843 }] },
  ],
  small: [
    { name: '1エリア', cols: 1, rows: 1, areas: [{ x: 0, y: 0, w: 2500, h: 843 }] },
    { name: '2列', cols: 2, rows: 1, areas: [{ x: 0, y: 0, w: 1250, h: 843 }, { x: 1250, y: 0, w: 1250, h: 843 }] },
    { name: '3列', cols: 3, rows: 1, areas: [{ x: 0, y: 0, w: 833, h: 843 }, { x: 833, y: 0, w: 834, h: 843 }, { x: 1667, y: 0, w: 833, h: 843 }] },
  ],
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

type TabId = 'list' | 'create' | 'segments' | 'users'

const TABS: { id: TabId; label: string }[] = [
  { id: 'list', label: 'メニュー一覧' },
  { id: 'create', label: '新規作成' },
  { id: 'segments', label: 'セグメント切替' },
  { id: 'users', label: '個別設定' },
]

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RichMenusPage() {
  const [tab, setTab] = useState<TabId>('list')
  const [menus, setMenus] = useState<RichMenu[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [mappings, setMappings] = useState<TagMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const clearMessages = () => { setError(''); setSuccess('') }

  const loadAll = useCallback(async () => {
    setLoading(true)
    clearMessages()
    try {
      const [menuRes, tagRes, mapRes] = await Promise.all([
        fetchApi<{ success: boolean; data: RichMenu[] }>('/api/rich-menus'),
        fetchApi<{ success: boolean; data: Tag[] }>('/api/tags'),
        fetchApi<{ success: boolean; data: TagMapping[] }>('/api/rich-menu-tag-mappings'),
      ])
      if (menuRes.success) setMenus(menuRes.data)
      if (tagRes.success) setTags(tagRes.data)
      if (mapRes.success) setMappings(mapRes.data)
    } catch {
      setError('データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  return (
    <div>
      <Header title="リッチメニュー管理" description="リッチメニューの作成・管理・タグ別自動切替" />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); clearMessages() }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      {tab === 'list' && <MenuList menus={menus} onRefresh={loadAll} setError={setError} setSuccess={setSuccess} />}
      {tab === 'create' && <MenuCreator menus={menus} onCreated={() => { loadAll(); setTab('list') }} setError={setError} setSuccess={setSuccess} />}
      {tab === 'segments' && <SegmentManager menus={menus} tags={tags} mappings={mappings} onRefresh={loadAll} setError={setError} setSuccess={setSuccess} />}
      {tab === 'users' && <UserAssignment menus={menus} setError={setError} setSuccess={setSuccess} />}
    </div>
  )
}

// ─── Tab 1: メニュー一覧 ────────────────────────────────────────────────────

function MenuList({
  menus, onRefresh, setError, setSuccess,
}: {
  menus: RichMenu[]; onRefresh: () => void; setError: (s: string) => void; setSuccess: (s: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const handleSetDefault = async (id: string) => {
    setBusy(id)
    try {
      await fetchApi(`/api/rich-menus/${id}/default`, { method: 'POST' })
      setSuccess('デフォルトメニューを更新しました')
      onRefresh()
    } catch { setError('デフォルト設定に失敗しました') }
    finally { setBusy(null) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このリッチメニューを削除しますか？')) return
    setBusy(id)
    try {
      await fetchApi(`/api/rich-menus/${id}`, { method: 'DELETE' })
      setSuccess('メニューを削除しました')
      onRefresh()
    } catch { setError('削除に失敗しました') }
    finally { setBusy(null) }
  }

  if (menus.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500">リッチメニューがありません。「新規作成」タブから作成してください。</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {menus.map((menu) => (
        <div key={menu.richMenuId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{menu.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">チャットバー: {menu.chatBarText}</p>
            </div>
            {menu.selected && (
              <span className="shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                デフォルト
              </span>
            )}
          </div>

          <MenuImage richMenuId={menu.richMenuId} menu={menu} />

          <div className="mt-3 space-y-1 text-xs text-gray-500">
            <p>サイズ: {menu.size.width}x{menu.size.height} / エリア数: {menu.areas.length}</p>
            <p className="font-mono truncate text-gray-400">{menu.richMenuId}</p>
          </div>

          <div className="flex gap-2 mt-3">
            {!menu.selected && (
              <button
                onClick={() => handleSetDefault(menu.richMenuId)}
                disabled={busy === menu.richMenuId}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: '#06C755' }}
              >
                {busy === menu.richMenuId ? '...' : 'デフォルトに設定'}
              </button>
            )}
            <button
              onClick={() => handleDelete(menu.richMenuId)}
              disabled={busy === menu.richMenuId}
              className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── メニュー画像（LINE APIから取得、フォールバック付き） ─────────────────────

function MenuImage({ richMenuId, menu }: { richMenuId: string; menu: RichMenu }) {
  const [failed, setFailed] = useState(false)
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
  const imgUrl = `${API_URL}/api/rich-menus/${richMenuId}/image?token=${encodeURIComponent(apiKey)}`

  if (failed) return <MenuPreview menu={menu} />

  return (
    <img
      src={imgUrl}
      alt={menu.name}
      className="w-full max-w-[300px] rounded-lg border border-gray-200"
      onError={() => setFailed(true)}
    />
  )
}

// ─── メニュープレビュー（フォールバック用） ──────────────────────────────────

function MenuPreview({ menu }: { menu: RichMenu }) {
  const { width, height } = menu.size
  const scale = 300 / width
  const h = height * scale

  return (
    <div className="relative bg-gray-100 rounded-lg overflow-hidden border border-gray-200" style={{ width: 300, height: h }}>
      {menu.areas.map((area, i) => {
        const label = area.action.label || area.action.text || area.action.uri || area.action.data || `エリア ${i + 1}`
        return (
          <div
            key={i}
            className="absolute border border-dashed border-blue-300 bg-blue-50/50 flex items-center justify-center text-center"
            style={{ left: area.bounds.x * scale, top: area.bounds.y * scale, width: area.bounds.width * scale, height: area.bounds.height * scale }}
          >
            <span className="text-[10px] text-blue-700 font-medium px-1 truncate">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab 2: 新規作成 ────────────────────────────────────────────────────────

function MenuCreator({
  menus, onCreated, setError, setSuccess,
}: {
  menus: RichMenu[]; onCreated: () => void; setError: (s: string) => void; setSuccess: (s: string) => void
}) {
  const [name, setName] = useState('')
  const [chatBarText, setChatBarText] = useState('メニュー')
  const [sizeKey, setSizeKey] = useState<'large' | 'small'>('large')
  const [presetIdx, setPresetIdx] = useState(2)
  const [areaConfigs, setAreaConfigs] = useState<{ label: string; actionType: string; value: string }[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const sizeW = 2500
  const sizeH = sizeKey === 'large' ? 1686 : 843
  const presets = PRESETS[sizeKey]
  const preset = presets[presetIdx] || presets[0]

  useEffect(() => {
    setAreaConfigs(preset.areas.map((_, i) => ({ label: `エリア ${i + 1}`, actionType: 'message', value: '' })))
  }, [preset.areas.length, presetIdx, sizeKey])

  const updateArea = (idx: number, field: string, val: string) => {
    setAreaConfigs((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: val } : a)))
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('メニュー名を入力してください'); return }
    setCreating(true)
    setError('')
    try {
      const areas: RichMenuArea[] = preset.areas.map((a, i) => {
        const cfg = areaConfigs[i] || { actionType: 'message', value: '', label: '' }
        const action: RichMenuArea['action'] = cfg.actionType === 'uri'
          ? { type: 'uri', uri: cfg.value, label: cfg.label }
          : cfg.actionType === 'postback'
            ? { type: 'postback', data: cfg.value, label: cfg.label }
            : { type: 'message', text: cfg.value || cfg.label }
        return { bounds: { x: a.x, y: a.y, width: a.w, height: a.h }, action }
      })

      const res = await fetchApi<{ success: boolean; data: { richMenuId: string } }>('/api/rich-menus', {
        method: 'POST',
        body: JSON.stringify({ size: { width: sizeW, height: sizeH }, selected: false, name: name.trim(), chatBarText: chatBarText.trim() || 'メニュー', areas }),
      })
      if (!res.success) { setError('メニューの作成に失敗しました'); return }

      const richMenuId = res.data.richMenuId

      if (imageFile) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
        const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
        const imgRes = await fetch(`${API_URL}/api/rich-menus/${richMenuId}/image`, {
          method: 'POST',
          headers: { 'Content-Type': imageFile.type.includes('jpeg') ? 'image/jpeg' : 'image/png', Authorization: `Bearer ${apiKey}` },
          body: imageFile,
        })
        if (!imgRes.ok) { setError('メニューは作成されましたが、画像のアップロードに失敗しました'); onCreated(); return }
      }

      setSuccess(`メニュー「${name}」を作成しました`)
      setName(''); setImageFile(null); setImagePreview(null)
      onCreated()
    } catch { setError('メニューの作成に失敗しました') }
    finally { setCreating(false) }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">リッチメニュー作成</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">メニュー名</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: メインメニュー"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">チャットバーテキスト</label>
          <input type="text" value={chatBarText} onChange={(e) => setChatBarText(e.target.value)} placeholder="メニュー"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">サイズ</label>
          <select value={sizeKey} onChange={(e) => { setSizeKey(e.target.value as 'large' | 'small'); setPresetIdx(0) }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="large">大 (2500x1686)</option>
            <option value="small">小 (2500x843)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">レイアウト</label>
          <select value={presetIdx} onChange={(e) => setPresetIdx(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {presets.map((p, i) => <option key={i} value={i}>{p.name}（{p.areas.length}エリア）</option>)}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">レイアウトプレビュー</label>
        <div className="relative bg-gray-100 rounded-lg overflow-hidden border border-gray-200" style={{ width: 300, height: sizeH * (300 / sizeW) }}>
          {preset.areas.map((a, i) => {
            const scale = 300 / sizeW
            const cfg = areaConfigs[i]
            return (
              <div key={i} className="absolute border border-dashed border-blue-400 bg-blue-50/60 flex items-center justify-center"
                style={{ left: a.x * scale, top: a.y * scale, width: a.w * scale, height: a.h * scale }}>
                <span className="text-[10px] text-blue-700 font-semibold">{cfg?.label || `エリア ${i + 1}`}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <label className="block text-xs font-medium text-gray-600">エリアアクション</label>
        {preset.areas.map((_, i) => {
          const cfg = areaConfigs[i] || { label: '', actionType: 'message', value: '' }
          return (
            <div key={i} className="flex gap-2 items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-xs font-medium text-gray-500 w-8 shrink-0">#{i + 1}</span>
              <input type="text" value={cfg.label} onChange={(e) => updateArea(i, 'label', e.target.value)} placeholder="ラベル"
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
              <select value={cfg.actionType} onChange={(e) => updateArea(i, 'actionType', e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm">
                <option value="message">メッセージ</option>
                <option value="uri">URL</option>
                <option value="postback">ポストバック</option>
              </select>
              <input type="text" value={cfg.value} onChange={(e) => updateArea(i, 'value', e.target.value)}
                placeholder={cfg.actionType === 'uri' ? 'https://...' : 'テキスト / データ'}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
          )
        })}
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-600 mb-1">メニュー画像（PNG/JPEG、{sizeW}x{sizeH}px）</label>
        <input type="file" accept="image/png,image/jpeg" onChange={handleImageChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        {imagePreview && <img src={imagePreview} alt="プレビュー" className="mt-2 rounded-lg border border-gray-200" style={{ width: 300 }} />}
      </div>

      <button onClick={handleCreate} disabled={creating || !name.trim()}
        className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {creating ? '作成中...' : 'リッチメニュー作成'}
      </button>
    </div>
  )
}

// ─── Tab 3: セグメント切替 ──────────────────────────────────────────────────

function SegmentManager({
  menus, tags, mappings, onRefresh, setError, setSuccess,
}: {
  menus: RichMenu[]; tags: Tag[]; mappings: TagMapping[]; onRefresh: () => void; setError: (s: string) => void; setSuccess: (s: string) => void
}) {
  const [selectedTag, setSelectedTag] = useState('')
  const [selectedMenu, setSelectedMenu] = useState('')
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  const handleSave = async () => {
    if (!selectedTag || !selectedMenu) { setError('タグとメニューの両方を選択してください'); return }
    setSaving(true)
    try {
      await fetchApi('/api/rich-menu-tag-mappings', { method: 'POST', body: JSON.stringify({ tagId: selectedTag, richMenuId: selectedMenu }) })
      setSuccess('マッピングを保存しました')
      setSelectedTag(''); setSelectedMenu('')
      onRefresh()
    } catch { setError('マッピングの保存に失敗しました') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetchApi(`/api/rich-menu-tag-mappings/${id}`, { method: 'DELETE' })
      setSuccess('マッピングを削除しました')
      onRefresh()
    } catch { setError('マッピングの削除に失敗しました') }
  }

  const handleApply = async (id: string) => {
    setApplying(id)
    try {
      const res = await fetchApi<{ success: boolean; data: { linked: number; failed: number; total: number } }>(
        `/api/rich-menu-tag-mappings/${id}/apply`, { method: 'POST' })
      if (res.success) setSuccess(`${res.data.linked}/${res.data.total} 人に適用しました`)
    } catch { setError('一括適用に失敗しました') }
    finally { setApplying(null) }
  }

  const getTagName = (tagId: string) => tags.find((t) => t.id === tagId)?.name || tagId
  const getTagColor = (tagId: string) => tags.find((t) => t.id === tagId)?.color || '#6B7280'
  const getMenuName = (menuId: string) => menus.find((m) => m.richMenuId === menuId)?.name || menuId

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">タグ→メニュー マッピング追加</h3>
        <p className="text-xs text-gray-500 mb-4">このタグが付与されると、リッチメニューが自動で切り替わります。</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">タグ</label>
            <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">-- タグを選択 --</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="text-gray-400 text-lg pb-2">→</div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">リッチメニュー</label>
            <select value={selectedMenu} onChange={(e) => setSelectedMenu(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">-- メニューを選択 --</option>
              {menus.map((m) => <option key={m.richMenuId} value={m.richMenuId}>{m.name}</option>)}
            </select>
          </div>
          <button onClick={handleSave} disabled={saving || !selectedTag || !selectedMenu}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0">
            {saving ? '...' : '保存'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">設定済みマッピング</h3>
        {mappings.length === 0 ? (
          <p className="text-xs text-gray-500">マッピングはまだありません。</p>
        ) : (
          <div className="space-y-2">
            {mappings.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: getTagColor(m.tagId) }}>
                  {getTagName(m.tagId)}
                </span>
                <span className="text-gray-400 text-sm">→</span>
                <span className="text-sm text-gray-700 font-medium flex-1">{getMenuName(m.richMenuId)}</span>
                <button onClick={() => handleApply(m.id)} disabled={applying === m.id}
                  className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50">
                  {applying === m.id ? '...' : '全員に適用'}
                </button>
                <button onClick={() => handleDelete(m.id)}
                  className="px-3 py-1 text-xs font-medium text-red-500 bg-red-50 rounded-md hover:bg-red-100">
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 4: 個別設定 ────────────────────────────────────────────────────────

function UserAssignment({
  menus, setError, setSuccess,
}: {
  menus: RichMenu[]; setError: (s: string) => void; setSuccess: (s: string) => void
}) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [search, setSearch] = useState('')
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [selectedMenus, setSelectedMenus] = useState<Record<string, string>>({})

  const loadFriends = useCallback(async () => {
    setLoadingFriends(true)
    try {
      const res = await fetchApi<{ success: boolean; data: { items: Friend[] } }>('/api/friends?limit=100')
      if (res.success) setFriends(res.data.items)
    } catch { setError('友だち一覧の読み込みに失敗しました') }
    finally { setLoadingFriends(false) }
  }, [setError])

  useEffect(() => { loadFriends() }, [loadFriends])

  const filtered = friends.filter((f) => !search || (f.displayName || '').toLowerCase().includes(search.toLowerCase()))

  const handleLink = async (friendId: string) => {
    const richMenuId = selectedMenus[friendId]
    if (!richMenuId) { setError('メニューを選択してください'); return }
    setBusy(friendId)
    try {
      await fetchApi(`/api/friends/${friendId}/rich-menu`, { method: 'POST', body: JSON.stringify({ richMenuId }) })
      setSuccess('メニューを紐付けました')
    } catch { setError('紐付けに失敗しました') }
    finally { setBusy(null) }
  }

  const handleUnlink = async (friendId: string) => {
    setBusy(friendId)
    try {
      await fetchApi(`/api/friends/${friendId}/rich-menu`, { method: 'DELETE' })
      setSuccess('メニューの紐付けを解除しました')
    } catch { setError('解除に失敗しました') }
    finally { setBusy(null) }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">個別ユーザーにメニューを設定</h3>
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="名前で検索..."
        className="w-full px-3 py-2 mb-4 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />

      {loadingFriends ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">友だちが見つかりません。</p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {f.pictureUrl ? (
                <img src={f.pictureUrl} alt="" className="w-8 h-8 rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{f.displayName || '不明'}</p>
                <div className="flex gap-1 mt-0.5">
                  {f.tags.map((t) => (
                    <span key={t.id} className="px-1.5 py-0 rounded text-[10px] font-medium text-white" style={{ backgroundColor: t.color }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
              <select value={selectedMenus[f.id] || ''} onChange={(e) => setSelectedMenus((prev) => ({ ...prev, [f.id]: e.target.value }))}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-40 shrink-0">
                <option value="">-- メニュー --</option>
                {menus.map((m) => <option key={m.richMenuId} value={m.richMenuId}>{m.name}</option>)}
              </select>
              <button onClick={() => handleLink(f.id)} disabled={busy === f.id || !selectedMenus[f.id]}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md disabled:opacity-50 shrink-0">
                紐付け
              </button>
              <button onClick={() => handleUnlink(f.id)} disabled={busy === f.id}
                className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-md hover:bg-red-100 shrink-0">
                解除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
