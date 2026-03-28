'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Scenario, ScenarioTriggerType } from '@line-crm/shared'
import { api } from '@/lib/api'
import { useAccount } from '@/contexts/account-context'
import Header from '@/components/layout/header'
import ScenarioList from '@/components/scenarios/scenario-list'
import CcPromptButton from '@/components/cc-prompt-button'

const ccPrompts = [
  {
    title: '新しいシナリオを作成',
    prompt: `新しいシナリオ配信を作成してください。
1. ターゲット: [対象を指定]
2. トリガー: 友だち追加 / タグ変更 / 手動
3. ステップ数: [希望数]
4. メッセージ内容の提案もお願いします
各ステップの配信間隔も含めて構成してください。`,
  },
  {
    title: 'シナリオの効果分析',
    prompt: `現在のシナリオ配信の効果を分析してください。
1. 各シナリオの配信実績を確認
2. ステップごとの離脱率を分析
3. 改善が必要なシナリオを特定
具体的な改善案を提示してください。`,
  },
]

type ScenarioWithCount = Scenario & { stepCount?: number }

const triggerOptions: { value: ScenarioTriggerType; label: string }[] = [
  { value: 'friend_add', label: '友だち追加時' },
  { value: 'tag_added', label: 'タグ付与時' },
  { value: 'manual', label: '手動' },
]

interface FormState {
  name: string
  description: string
  triggerType: ScenarioTriggerType
  triggerTagId: string
  isActive: boolean
}

const emptyForm: FormState = {
  name: '',
  description: '',
  triggerType: 'friend_add',
  triggerTagId: '',
  isActive: true,
}

export default function ScenariosPage() {
  const { selectedAccountId } = useAccount()
  const [scenarios, setScenarios] = useState<ScenarioWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // null = closed, 'new' = creating, ScenarioWithCount = editing existing
  const [editingScenario, setEditingScenario] = useState<ScenarioWithCount | null | 'new'>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const loadScenarios = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.scenarios.list({ accountId: selectedAccountId || undefined })
      if (res.success) {
        setScenarios(res.data)
      } else {
        setError(res.error)
      }
    } catch {
      setError('シナリオの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    loadScenarios()
  }, [loadScenarios])

  const openNew = () => {
    setEditingScenario('new')
    setForm(emptyForm)
    setFormError('')
  }

  const openEdit = (scenario: ScenarioWithCount) => {
    setEditingScenario(scenario)
    setForm({
      name: scenario.name,
      description: scenario.description ?? '',
      triggerType: scenario.triggerType as ScenarioTriggerType,
      triggerTagId: scenario.triggerTagId ?? '',
      isActive: scenario.isActive,
    })
    setFormError('')
  }

  const openDuplicate = (scenario: ScenarioWithCount) => {
    setEditingScenario('new')
    setForm({
      name: `${scenario.name} (コピー)`,
      description: scenario.description ?? '',
      triggerType: scenario.triggerType as ScenarioTriggerType,
      triggerTagId: scenario.triggerTagId ?? '',
      isActive: scenario.isActive,
    })
    setFormError('')
  }

  const closeForm = () => {
    setEditingScenario(null)
    setForm(emptyForm)
    setFormError('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('シナリオ名を入力してください')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        triggerType: form.triggerType,
        triggerTagId: form.triggerTagId || null,
        isActive: form.isActive,
      }

      const isEditing = editingScenario !== null && editingScenario !== 'new'
      const res = isEditing
        ? await api.scenarios.update(editingScenario.id, payload)
        : await api.scenarios.create(payload)

      if (res.success) {
        closeForm()
        loadScenarios()
      } else {
        setFormError(res.error)
      }
    } catch {
      setFormError(editingScenario !== 'new' && editingScenario !== null ? '更新に失敗しました' : '作成に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.scenarios.update(id, { isActive: !current })
      loadScenarios()
    } catch {
      setError('ステータスの変更に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.scenarios.delete(id)
      // Close form if we're editing the deleted scenario
      if (editingScenario !== null && editingScenario !== 'new' && editingScenario.id === id) {
        closeForm()
      }
      loadScenarios()
    } catch {
      setError('削除に失敗しました')
    }
  }

  const isEditing = editingScenario !== null && editingScenario !== 'new'
  const formTitle = isEditing ? 'シナリオ編集' : '新規シナリオを作成'
  const saveLabel = isEditing ? '保存' : '作成'
  const savingLabel = isEditing ? '保存中...' : '作成中...'

  return (
    <div>
      <Header
        title="シナリオ配信"
        action={
          <button
            onClick={openNew}
            className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#06C755' }}
          >
            + 新規シナリオ
          </button>
        }
      />

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Create / Edit form */}
      {editingScenario !== null && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{formTitle}</h2>
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">シナリオ名 <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="例: 友だち追加ウェルカムシナリオ"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">説明</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                rows={2}
                placeholder="シナリオの説明 (省略可)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">トリガー</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                value={form.triggerType}
                onChange={(e) => setForm({ ...form, triggerType: e.target.value as ScenarioTriggerType })}
              >
                {triggerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="isActive" className="text-sm text-gray-600">
                {isEditing ? '有効にする' : '作成後すぐに有効にする'}
              </label>
            </div>

            {formError && <p className="text-xs text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#06C755' }}
              >
                {saving ? savingLabel : saveLabel}
              </button>
              <button
                onClick={closeForm}
                className="px-4 py-2 min-h-[44px] text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-5 animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="flex gap-4">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ScenarioList
          scenarios={scenarios}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
          onEdit={openEdit}
          onDuplicate={openDuplicate}
          loading={loading}
        />
      )}

      <CcPromptButton prompts={ccPrompts} />
    </div>
  )
}
