import type { SessionReviewData, TopicRecord } from '../types/interview'
import { PASS_THRESHOLD } from '../constants'

interface Props {
  data: SessionReviewData
}

export function SessionReview({ data }: Props) {
  const score = data.overall_score ?? 0
  const pct = Math.min(100, Math.max(0, score))
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const scoreColor = pct >= 75 ? '#10b981' : pct >= PASS_THRESHOLD ? '#6366f1' : '#ef4444'
  const tierColor = {
    Outstanding: 'text-emerald-400',
    Strong:      'text-indigo-400',
    Acceptable:  'text-blue-400',
    'Needs Work':'text-yellow-400',
    Poor:        'text-red-400',
  }[data.tier ?? ''] ?? 'text-slate-400'

  return (
    <div className="min-h-screen bg-[#0f1117] px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-1">Session Review</h1>
          <p className="text-slate-400 text-sm">Here's how you did</p>
        </div>

        {/* Score ring + tier */}
        <div className="bg-[#1a1f2e] border border-slate-700/50 rounded-2xl p-8 flex flex-col items-center">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="#1e2130" strokeWidth="12" />
            <circle
              cx="64" cy="64" r={radius} fill="none"
              stroke={scoreColor} strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="mt-4 text-center">
            <p className="text-4xl font-bold text-white">{pct.toFixed(0)}<span className="text-xl text-slate-400">/100</span></p>
            <p className={`text-lg font-semibold mt-1 ${tierColor}`}>{data.tier}</p>
          </div>
        </div>

        {/* Summary */}
        {data.summary && (
          <Section title="Session Summary">
            <p className="text-slate-300 text-sm leading-relaxed">{data.summary}</p>
          </Section>
        )}

        {/* Strengths & Gaps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.key_strengths?.length > 0 && (
            <Section title="Key Strengths">
              <ul className="space-y-2">
                {data.key_strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {data.key_gaps?.length > 0 && (
            <Section title="Key Gaps">
              <ul className="space-y-2">
                {data.key_gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                    {g}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Topic results table */}
        {data.topic_history?.length > 0 && (
          <Section title="Topic Results">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left py-2 pr-4 text-slate-400 font-medium">Topic</th>
                    <th className="text-right py-2 pr-4 text-slate-400 font-medium">Score</th>
                    <th className="text-center py-2 text-slate-400 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {data.topic_history.map((r, i) => (
                    <TopicRow key={i} record={r} skipped={data.skipped_topics?.includes(r.topic)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Study recommendations */}
        {data.recommendations?.length > 0 && (
          <Section title="Study Recommendations">
            <ul className="space-y-2">
              {data.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <span className="text-indigo-400 shrink-0 mt-0.5">→</span>
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Next steps */}
        {data.next_steps && (
          <Section title="Next Steps">
            <p className="text-slate-300 text-sm leading-relaxed">{data.next_steps}</p>
          </Section>
        )}

        {/* Restart */}
        <div className="text-center pt-4">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold
                       rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Start New Session
          </button>
        </div>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1f2e] border border-slate-700/50 rounded-2xl p-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function TopicRow({ record, skipped }: { record: TopicRecord; skipped?: boolean }) {
  const score = record.score ?? 0
  const passed = record.passed && !skipped
  const result = skipped ? 'Skipped' : passed ? 'Pass' : 'Fail'
  const resultStyle = skipped
    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    : passed
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : 'bg-red-500/15 text-red-400 border-red-500/30'

  return (
    <tr>
      <td className="py-3 pr-4 text-slate-300">{record.topic}</td>
      <td className="py-3 pr-4 text-right font-mono text-slate-300">
        {skipped ? '—' : `${score.toFixed(0)}`}
      </td>
      <td className="py-3 text-center">
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${resultStyle}`}>
          {result}
        </span>
      </td>
    </tr>
  )
}
