import type { TopicState } from '../types/interview'

interface Props {
  topics: TopicState[]
  statusMsg: string
}

const STATUS_CONFIG = {
  pending:  { dot: 'bg-slate-600',  label: 'text-slate-400', badge: ''                                          },
  active:   { dot: 'bg-indigo-400 animate-pulse', label: 'text-indigo-300 font-semibold', badge: 'Active'      },
  passed:   { dot: 'bg-emerald-500', label: 'text-emerald-300', badge: '✓'                                     },
  failed:   { dot: 'bg-red-500',    label: 'text-red-300',    badge: '✗'                                       },
  skipped:  { dot: 'bg-yellow-500', label: 'text-yellow-300', badge: '→'                                       },
}

export function TopicSidebar({ topics, statusMsg }: Props) {
  const passed  = topics.filter(t => t.status === 'passed').length
  const total   = topics.length
  const pct     = total > 0 ? Math.round((passed / total) * 100) : 0

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-slate-700/50 bg-[#1a1f2e]">
      {/* Header */}
      <div className="p-5 border-b border-slate-700/50">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Topics
        </h2>
        {total > 0 && (
          <>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>{passed} / {total} passed</span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Topic list */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-1 p-3">
        {topics.length === 0 ? (
          <p className="text-xs text-slate-500 px-2 py-3">
            Topics will appear after research completes.
          </p>
        ) : (
          topics.map((t, i) => {
            const cfg = STATUS_CONFIG[t.status]
            return (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg
                  ${t.status === 'active' ? 'bg-indigo-600/10 border border-indigo-600/20' : 'hover:bg-slate-700/30'}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-sm flex-1 truncate ${cfg.label}`}>
                  {t.name}
                </span>
                {cfg.badge && (
                  <span className="text-xs shrink-0 opacity-70">{cfg.badge}</span>
                )}
                {t.score !== undefined && (
                  <span className={`text-xs font-mono shrink-0
                    ${t.status === 'passed' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.score.toFixed(0)}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Status message */}
      {statusMsg && (
        <div className="p-4 border-t border-slate-700/50">
          <p className="text-xs text-slate-400 leading-relaxed">{statusMsg}</p>
        </div>
      )}
    </aside>
  )
}
