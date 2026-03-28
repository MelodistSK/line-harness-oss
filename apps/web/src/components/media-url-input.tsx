'use client'

import { useState } from 'react'
import MediaUploader, { type MediaAccept } from './media-uploader'
import MediaPickerModal from './media-picker-modal'

interface MediaUrlInputProps {
  value: string
  onChange: (url: string) => void
  placeholder?: string
  label?: string
  accept?: MediaAccept
}

export default function MediaUrlInput({ value, onChange, placeholder, label, accept = 'all' }: MediaUrlInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div>
      {label && <label className="block text-xs text-gray-500 mb-1">{label}</label>}
      <div className="flex gap-2 items-center">
        <input
          type="url"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder={placeholder || 'https://...'}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <MediaUploader accept={accept} label="Upload" onUploaded={onChange} />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          Library
        </button>
      </div>
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onChange}
        accept={accept}
      />
    </div>
  )
}
