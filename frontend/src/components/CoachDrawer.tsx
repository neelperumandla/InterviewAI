import { useEffect, useState } from 'react'
import type { CoachEntry } from '../types/interview'

const MODES: { id: string; label: string; hint: string }[] = [
  { id: 'syntax', label: 'Syntax', hint: 'Language/API help only' },
  { id: 'think_aloud', label: 'Approach', hint: 'Brute force vs optimal, tradeoffs' },
  { id: 'sanity_check', label: 'Sanity check', hint: 'Edge cases on your idea' },
  { id: 'complexity', label: 'Complexity', hint: 'Big-O for your approach' },
]

interface CoachPanelProps {
  thread: CoachEntry[]
  disabled: boolean
  isThinking: boolean
  onSend: (mode: string, content: string) => void
  onClose?: () => void
  verbalTurn?: boolean
}

/** Inner coach UI (also exported as CoachPanel for compatibility). */
export function CoachPanel({ thread, disabled, isThinking, onSend, onClose, verbalTurn }: CoachPanelProps) {
  const [mode, setMode] = useState('think_aloud')
  const [draft, setDraft] = useState('')

  const submit = () => {
    const text = draft.trim()
    if (!text || disabled || isThinking) return
    onSend(mode, text)
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#12151f]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700/40 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Interview coach</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
            Hints only — no full solutions. Messages count toward evaluation.
            {verbalTurn && (
              <span className="mt-1 block text-amber-200/90">
                Finish this follow-up with &quot;Submit response&quot; in the main panel — not here.
              </span>
            )}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close coach"
          >
            ✕
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {thread.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ask about syntax, approach, edge cases, or complexity while you work.
          </p>
        ) : (
          thread.map((entry, i) => (
            <div key={i} className="space-y-1.5 text-sm">
              <p className="text-slate-400">
                <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                  {entry.mode.replace('_', ' ')}
                </span>
                <span className="ml-2 text-slate-300">{entry.content}</span>
              </p>
              <p className="rounded-lg border border-indigo-800/30 bg-indigo-950/40 px-3 py-2 text-slate-200 leading-relaxed">
                {entry.reply}
              </p>
            </div>
          ))
        )}
        {isThinking && (
          <p className="text-sm text-indigo-300 animate-pulse">Coach is thinking…</p>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-700/40 p-4">
        <select
          value={mode}
          onChange={e => setMode(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-600/50 bg-slate-800/80 px-3 py-2 text-sm text-slate-200"
          title={MODES.find(m => m.id === mode)?.hint}
        >
          {MODES.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={disabled || isThinking}
          rows={3}
          placeholder="e.g. Is two pointers reasonable here?"
          className="w-full resize-none rounded-lg border border-slate-600/50 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || isThinking || !draft.trim()}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Ask coach
        </button>
        {disabled && (
          <p className="text-center text-[11px] text-slate-600">
            Coach is available while a question is open for your answer.
          </p>
        )}
      </div>
    </div>
  )
}

interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  thread: CoachEntry[]
  disabled: boolean
  isThinking: boolean
  onSend: (mode: string, content: string) => void
  verbalTurn?: boolean
}

export function CoachDrawer({
  open,
  onOpenChange,
  thread,
  disabled,
  isThinking,
  onSend,
  verbalTurn,
}: DrawerProps) {
  const messageCount = thread.length

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`fixed top-1/2 z-[60] -translate-y-1/2 rounded-l-xl border border-r-0 border-slate-600/50 bg-[#1a1f2e] px-2 py-4 shadow-lg transition-all duration-200 hover:bg-slate-800 ${
          open ? 'right-[min(28rem,100vw)] text-indigo-300' : 'right-0 text-slate-300'
        }`}
        aria-expanded={open}
        aria-label={open ? 'Close interview coach' : 'Open interview coach'}
      >
        <span
          className="block text-[10px] font-bold uppercase tracking-widest"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          Coach
        </span>
        {messageCount > 0 && (
          <span className="mt-2 block rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {messageCount}
          </span>
        )}
      </button>

      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:bg-black/20"
          aria-label="Close coach panel"
          onClick={() => onOpenChange(false)}
        />
      )}

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-700/50 bg-[#12151f] shadow-2xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
        aria-hidden={!open}
      >
        <CoachPanel
          thread={thread}
          disabled={disabled}
          isThinking={isThinking}
          onSend={onSend}
          onClose={() => onOpenChange(false)}
          verbalTurn={verbalTurn}
        />
      </aside>
    </>
  )
}
