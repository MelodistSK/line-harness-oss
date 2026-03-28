'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApi } from '@/lib/api'
import Header from '@/components/layout/header'

interface Form { id: string; name: string; submitCount?: number }
interface Submission { id: string; formId: string; friendId: string; friendName?: string; data: Record<string, unknown>; createdAt: string }

const PAGE_SIZE = 20

export default function FormSubmissionsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [subLoading, setSubLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({})

  const loadForms = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchApi<{ success: boolean; data: Form[] }>('/api/forms')
      if (res.success) setForms(res.data)
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadForms() }, [loadForms])

  const loadSubmissions = useCallback(async (formId: string) => {
    setSubLoading(true)
    setPage(1)
    try {
      const formRes = await fetchApi<{ success: boolean; data: { fields: Array<{ name: string; label: string }> } }>(`/api/forms/${formId}`)
      const res = await fetchApi<{ success: boolean; data: (Submission & { friendName?: string })[] }>(`/api/forms/${formId}/submissions`)

      setSelectedFormId((current) => {
        if (current !== formId) return current
        if (formRes.success && formRes.data.fields) {
          const labels: Record<string, string> = {}
          const fields = typeof formRes.data.fields === 'string' ? JSON.parse(formRes.data.fields as string) : formRes.data.fields
          for (const f of fields) labels[f.name] = f.label
          setFieldLabels(labels)
        }
        if (res.success) {
          setSubmissions(res.data.map((s) => ({
            ...s,
            data: typeof s.data === 'string' ? JSON.parse(s.data as string) : s.data,
            friendName: s.friendName || '不明',
          })))
        }
        return current
      })
    } catch { /* silent */ }
    setSelectedFormId((current) => {
      if (current === formId) setSubLoading(false)
      return current
    })
  }, [])

  const handleSelectForm = (formId: string) => {
    setSelectedFormId(formId)
    loadSubmissions(formId)
  }

  const handleExportCsv = () => {
    if (!selectedFormId) return
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787'
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('lh_api_key') || '' : ''
    window.open(`${API_URL}/api/forms/${selectedFormId}/submissions/csv?token=${encodeURIComponent(apiKey)}`, '_blank')
  }

  const totalPages = Math.ceil(submissions.length / PAGE_SIZE)
  const paged = submissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const fieldKeys = submissions.length > 0 ? [...new Set(submissions.flatMap(s => Object.keys(s.data)))] : []

  const renderValue = (val: unknown) => {
    if (val === null || val === undefined || val === '') return <span className="text-gray-300">-</span>
    if (Array.isArray(val)) return <span>{val.join(', ')}</span>
    const str = String(val)
    if (str.startsWith('http') && (str.includes('/assets/') || str.match(/\.(png|jpg|jpeg|gif|pdf)$/i))) {
      return <a href={str} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">📎 ファイル</a>
    }
    return <span>{str}</span>
  }

  return (
    <div>
      <Header title="フォーム回答" description="フォーム送信データの一覧・エクスポート" />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {loading ? (
          <div className="text-sm text-gray-400">読み込み中...</div>
        ) : (
          forms.map((form) => (
            <button key={form.id} onClick={() => handleSelectForm(form.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedFormId === form.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={selectedFormId === form.id ? { backgroundColor: '#06C755' } : {}}>
              {form.name}
            </button>
          ))
        )}
      </div>

      {selectedFormId && !subLoading && submissions.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            全 <span className="font-bold text-gray-900">{submissions.length}</span> 件の回答
          </p>
          <button onClick={handleExportCsv}
            className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            📥 CSVエクスポート
          </button>
        </div>
      )}

      {selectedFormId && (
        subLoading ? (
          <div className="card p-8 text-center text-gray-400">読み込み中...</div>
        ) : submissions.length === 0 ? (
          <div className="card p-12 text-center"><p className="text-gray-400 text-lg mb-2">📭</p><p className="text-gray-500">回答がありません</p></div>
        ) : (
          <>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[800px] zebra-table">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">名前</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">日時</th>
                    {fieldKeys.map((key) => (
                      <th key={key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                        {fieldLabels[key] || key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map((sub) => (
                    <tr key={sub.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{sub.friendName}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(sub.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      {fieldKeys.map((key) => (
                        <td key={key} className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                          {renderValue(sub.data[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-gray-400">{(page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, submissions.length)} 件 / 全{submissions.length}件</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">前へ</button>
                  <span className="px-3 py-1.5 text-sm text-gray-500">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">次へ</button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
