import type { FeedItem, QuestionData, EvaluationData, ResearchData, CoachEntry } from '../types/interview'
import { PASS_THRESHOLD } from '../constants'
import { stripQuestionMarkers } from './CodeSandbox'

export function FeedItemView({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'research': return <ResearchCard data={item.data as ResearchData} />
    case 'question': return <QuestionCard data={item.data as QuestionData} />
    case 'answer':   return <AnswerCard text={(item.data as { text: string }).text} />
    case 'evaluation': return <EvaluationCard data={item.data as EvaluationData} />
    case 'coach': return <CoachCard data={item.data as CoachEntry} />
    default: return null
  }
}

function ResearchCard({ data }: { data: ResearchData }) {
  const qualityColor = data.quality === 'excellent' ? 'text-emerald-400'
    : data.quality === 'good' ? 'text-indigo-400' : 'text-yellow-400'

  return (
    <div className="bg-[#1a1f2e] border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {data.from_cache ? 'Research Loaded (cached)' : 'Research Complete'}
        </span>
        <span className={`text-xs font-semibold ${qualityColor}`}>
          {data.quality}
        </span>
        <span className="text-xs text-slate-500">·</span>
        <span className="text-xs text-slate-400 italic">{data.interview_type?.replace('_', ' ')}</span>
      </div>
      {data.interview_template?.format_label && (
        <p className="text-xs text-indigo-300 mb-2 font-medium">
          Format: {data.interview_template.format_label}
        </p>
      )}
      <p className="text-sm text-slate-300 leading-relaxed mb-3">{data.summary}</p>
      <div className="flex flex-wrap gap-2">
        {data.topics.map((t, i) => (
          <span key={i} className="px-2.5 py-1 bg-indigo-600/15 text-indigo-300 rounded-full text-xs border border-indigo-600/20">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

function QuestionCard({ data }: { data: QuestionData }) {
  const stripped = stripQuestionMarkers(data.question)

  const diffColor = data.difficulty === 'hard' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : data.difficulty === 'easy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'

  return (
    <div className="bg-[#1a1f2e] border border-indigo-600/30 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="px-2.5 py-1 bg-indigo-600/20 text-indigo-300 rounded-full text-xs font-semibold border border-indigo-600/30">
          {data.topic}
        </span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${diffColor}`}>
          {data.difficulty}
        </span>
        {data.phase === 'follow_up' && (
          <span className="text-xs text-slate-400">Follow-up</span>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          Turn {data.question_index ?? data.attempt}
          {data.total_turns ? ` / ${data.total_turns}` : ''}
        </span>
      </div>
      <p className="text-white text-base leading-relaxed font-medium">{stripped}</p>
    </div>
  )
}

function AnswerCard({ text }: { text: string }) {
  return (
    <div className="ml-6 bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
      <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">Your Answer</p>
      <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= PASS_THRESHOLD ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-mono font-bold w-12 text-right">{pct.toFixed(0)}/100</span>
    </div>
  )
}

function EvaluationCard({ data }: { data: EvaluationData }) {
  const passed = data.passed
  const borderColor = passed ? 'border-emerald-600/30' : 'border-red-600/30'
  const badgeStyle = passed
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : 'bg-red-500/15 text-red-400 border-red-500/30'

  return (
    <div className={`bg-[#1a1f2e] border rounded-xl p-5 ${borderColor}`}>
      {/* Score header */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${badgeStyle}`}>
          {passed ? '✓ PASSED' : '✗ NEEDS WORK'}
        </span>
        <div className="flex-1">
          <ScoreBar score={data.score} />
        </div>
      </div>

      {/* Feedback */}
      <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-3">
        {data.feedback}
      </div>

      {/* Critique notes — shown if something was adjusted */}
      {data.critique_notes && (
        <details className="mt-3">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 select-none">
            AI Review notes (critique adjusted evaluation)
          </summary>
          <div className="mt-2 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400 leading-relaxed border border-slate-700/40">
            {data.critique_notes}
            {data.raw_score !== data.score && (
              <span className="ml-2 text-indigo-400">
                (score adjusted {data.raw_score?.toFixed(0)} → {data.score?.toFixed(0)})
              </span>
            )}
          </div>
        </details>
      )}
    </div>
  )
}

function CoachCard({ data }: { data: CoachEntry }) {
  return (
    <div className="ml-6 rounded-xl border border-indigo-700/30 bg-indigo-950/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 mb-1">
        Coach · {data.mode.replace('_', ' ')}
      </p>
      <p className="text-xs text-slate-400 mb-1">{data.content}</p>
      <p className="text-sm text-slate-200 leading-relaxed">{data.reply}</p>
    </div>
  )
}
