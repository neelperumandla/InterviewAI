import { useEffect, useRef, useState } from 'react'
import type { TurnDialogueEntry } from '../types/interview'

interface Props {
  dialogue: TurnDialogueEntry[]
  disabled: boolean
  isThinking: boolean
  onSendMessage: (content: string) => void
  onSubmitTurn: (finalNote: string) => void
}

export function FollowUpDialoguePanel({
  dialogue,
  disabled,
  isThinking,
  onSendMessage,
  onSubmitTurn,
}: Props) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [dialogue.length, isThinking])

  const send = () => {
    const text = draft.trim()
    if (!text || disabled || isThinking) return
    onSendMessage(text)
    setDraft('')
  }

  const submitTurn = () => {
    if (disabled) return
    onSubmitTurn(draft.trim())
    setDraft('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-700/40 bg-amber-500/10 px-4 py-2">
        <p className="text-xs leading-relaxed text-amber-100/90">
          <strong className="font-semibold">Live follow-up.</strong> Reply to the interviewer below.
          They may probe with &quot;Have you considered…&quot; until you&apos;re ready. Use{' '}
          <strong>End turn</strong> when finished — the coach panel is only for private hints.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto space-y-3 p-4"
      >
        {dialogue.map((entry, i) => (
          <div
            key={i}
            className={`flex ${entry.role === 'candidate' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                entry.role === 'interviewer'
                  ? 'border border-slate-600/50 bg-slate-800/80 text-slate-200'
                  : 'border border-indigo-600/40 bg-indigo-950/50 text-indigo-100'
              }`}
            >
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                {entry.role === 'interviewer' ? 'Interviewer' : 'You'}
              </p>
              <p className="whitespace-pre-wrap">{entry.content}</p>
            </div>
          </div>
        ))}
        {isThinking && (
          <p className="text-xs text-slate-400 animate-pulse">Interviewer is thinking…</p>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-700/40 p-4">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={disabled || isThinking}
          rows={3}
          placeholder="Respond to the interviewer…"
          className="w-full resize-none rounded-xl border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={send}
            disabled={disabled || isThinking || !draft.trim()}
            className="flex-1 rounded-xl border border-slate-600/50 bg-slate-800 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            Send to interviewer
          </button>
          <button
            type="button"
            onClick={submitTurn}
            disabled={disabled || dialogue.filter(d => d.role === 'candidate').length === 0}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
            title="Finish this follow-up and get scored"
          >
            End turn
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Enter to send · End turn when you&apos;re done (optional last line in the box is included)
        </p>
      </div>
    </div>
  )
}
