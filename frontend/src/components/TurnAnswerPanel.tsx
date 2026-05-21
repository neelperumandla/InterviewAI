import { useState } from 'react'

interface Props {
  phase: string
  disabled: boolean
  onSubmit: (answer: string) => void
}

export function TurnAnswerPanel({ phase, disabled, onSubmit }: Props) {
  const [text, setText] = useState('')
  const isFollowUp = phase === 'follow_up'

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSubmit(value)
    setText('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <p className="text-xs leading-relaxed text-amber-100/90">
          {isFollowUp ? (
            <>
              <strong className="font-semibold">Follow-up turn.</strong> Answer in the box below
              (code snippet, complexity, or explanation). The interview coach is for hints only —
              it does <span className="underline">not</span> advance to the next question.
            </>
          ) : (
            <>
              Submit a written response below. Use the coach panel for hints only.
            </>
          )}
        </p>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={disabled}
        rows={12}
        placeholder={
          isFollowUp
            ? 'e.g. Time complexity is O(n) because we use a single pass with a hash map…'
            : 'Type your answer…'
        }
        className="min-h-0 flex-1 resize-none rounded-xl border border-slate-600/50 bg-slate-900/80 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">Ctrl+Enter to submit</span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Submit response
        </button>
      </div>
    </div>
  )
}
