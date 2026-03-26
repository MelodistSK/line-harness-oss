'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

interface RichMenu {
  richMenuId: string
  name: string
  chatBarText: string
  selected: boolean
  size: { width: number; height: number }
  areas: { bounds: { x: number; y: number; width: number; height: number }; action: { type: string; [key: string]: unknown } }[]
}

export default function RichMenusPage() {
  const [menus, setMenus] = useState<RichMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settingDefault, setSettingDefault] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchApi<{ success: boolean; data: RichMenu[]; error?: string }>('/api/rich-menus')
      if (res.success) {
        setMenus(res.data)
      } else {
        setError(res.error || 'リッチメニューの取得に失敗しました')
      }
    } catch {
      setError('リッチメニューの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSetDefault = async (richMenuId: string) => {
    setSettingDefault(richMenuId)
    try {
      const res = await fetchApi<{ success: boolean; error?: string }>(`/api/rich-menus/${richMenuId}/default`, { method: 'POST' })
      if (res.success) {
        load()
      } else {
        setError(res.error || 'デフォルト設定に失敗しました')
      }
    } catch {
      setError('デフォルト設定に失敗しました')
    } finally {
      setSettingDefault(null)
    }
  }

  const handleDelete = async (richMenuId: string) => {
    if (!confirm('このリッチメニューを削除してもよいですか？')) return
    try {
      await fetchApi<{ success: boolean }>(`/api/rich-menus/${richMenuId}`, { method: 'DELETE' })
      load()
    } catch {
      setError('削除に失敗しました')
    }
  }

  return (
    <div>
      <Header title="リッチメニュー管理" description="LINE APIから取得したリッチメニューの管理" />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-40 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-24 mb-4" />
              <div className="h-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : menus.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">リッチメニューがありません。LINE Official Account Managerから作成してください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {menus.map((menu) => (
            <div key={menu.richMenuId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{menu.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Chat bar: {menu.chatBarText}</p>
                </div>
                {menu.selected && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    デフォルト
                  </span>
                )}
              </div>

              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">サイズ: {menu.size.width} x {menu.size.height}</p>
                <p className="text-xs text-gray-500 mt-1">エリア数: {menu.areas.length}</p>
                <p className="text-xs text-gray-400 mt-1 font-mono truncate">{menu.richMenuId}</p>
              </div>

              <div className="flex gap-2">
                {!menu.selected && (
                  <button
                    onClick={() => handleSetDefault(menu.richMenuId)}
                    disabled={settingDefault === menu.richMenuId}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    {settingDefault === menu.richMenuId ? '設定中...' : 'デフォルトに設定'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(menu.richMenuId)}
                  className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
