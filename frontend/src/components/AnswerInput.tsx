import { useState, useRef, KeyboardEvent } from 'react'

interface Props {
  onSubmit: (answer: string) => void
  disabled: boolean
  isProcessing: boolean
}

export function AnswerInput({ onSubmit, disabled, isProcessing }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const canSubmit = value.trim().length > 0 && !disabled

  return (
    <div className="border-t border-slate-700/50 bg-[#1a1f2e] p-4">
      {isProcessing && (
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex gap-1">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
          <span className="text-xs text-slate-400">Agents working...</span>
        </div>
      )}

      <div className="flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => { setValue(e.target.value); autoResize() }}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder={disabled ? 'Waiting for next question...' : 'Type your answer here... (Ctrl+Enter to submit)'}
          rows={3}
          className="flex-1 px-4 py-3 bg-[#0f1117] border border-slate-600/50 rounded-xl
                     text-white placeholder-slate-500 text-sm resize-none min-h-[80px] max-h-64
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                     disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                     disabled:cursor-not-allowed rounded-xl text-white font-semibold text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500 self-end"
        >
          Submit
        </button>
      </div>
      <p className="text-xs text-slate-600 mt-2">Ctrl+Enter to submit</p>
    </div>
  )
}
