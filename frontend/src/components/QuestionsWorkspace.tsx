import { useEffect, useRef } from 'react'
import type { QuestionData, EvaluationData } from '../types/interview'
import { CALIBRATION_QUESTION_COUNT, PASS_THRESHOLD } from '../constants'
import {
  CodeEditor,
  CodingProblem,
  isCodingQuestion,
  stripQuestionMarkers,
} from './CodeSandbox'
import type { QuestionRecord } from './ProblemPanel'

interface Props {
  questions: QuestionRecord[]
  calibrationTopics: string[]
  selectedIdx: number
  onSelectIdx: (idx: number) => void
  hasLiveQuestion: boolean
  isProcessing: boolean
  onSubmit: (answer: string) => void
}

export function QuestionsWorkspace({
  questions,
  calibrationTopics,
  selectedIdx,
  onSelectIdx,
  hasLiveQuestion,
  isProcessing,
  onSubmit,
}: Props) {
  const safeIdx = Math.min(Math.max(0, selectedIdx), CALIBRATION_QUESTION_COUNT - 1)
  const selected = questions[safeIdx]
  const isLatest = safeIdx === questions.length - 1
  const awaitingAnswer = isLatest && hasLiveQuestion && !isProcessing
  const coding = selected ? isCodingQuestion(selected.data.question) : true

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Q1 / Q2 / Q3 sub-tabs */}
      <div className="flex items-center gap-2 border-b border-slate-700/40 bg-[#1a1f2e] px-4 py-2.5">
        {Array.from({ length: CALIBRATION_QUESTION_COUNT }, (_, i) => {
          const q = questions[i]
          const topic = calibrationTopics[i] ?? q?.data.topic ?? `Question ${i + 1}`
          const status: 'passed' | 'failed' | 'active' | 'locked' =
            q?.evaluation?.passed ? 'passed' :
            q?.evaluation && !q.evaluation.passed ? 'failed' :
            i === questions.length - 1 && hasLiveQuestion ? 'active' :
            q ? 'locked' :
            'locked'
          const isSel = i === safeIdx
          const tone =
            status === 'passed' ? 'border-emerald-500/50 text-emerald-300' :
            status === 'failed' ? 'border-red-500/50 text-red-300' :
            status === 'active' ? 'border-indigo-500/50 text-indigo-300' :
            'border-slate-700/40 text-slate-500'
          const badge =
            status === 'passed' ? '✓' : status === 'failed' ? '✗' : status === 'active' ? '●' : ''
          return (
            <button
              key={i}
              type="button"
              onClick={() => q && onSelectIdx(i)}
              disabled={!q}
              title={topic}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${tone} ${
                isSel ? 'bg-slate-800 ring-1 ring-indigo-500/40' : ''
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              Q{i + 1}
              {badge && <span className="ml-1 opacity-80">{badge}</span>}
            </button>
          )
        })}
        <span className="ml-auto text-xs text-slate-500">
          Skill check · {CALIBRATION_QUESTION_COUNT} problems
        </span>
      </div>

      {!selected ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">
          <p className="text-sm">
            {questions.length === 0
              ? 'Research complete — your first question will load shortly.'
              : 'Select an unlocked question above.'}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Left: problem statement */}
          <div className="min-h-0 overflow-y-auto border-b border-slate-700/40 px-5 py-4 lg:border-b-0 lg:border-r">
            <QuestionMeta data={selected.data} />
            {coding ? (
              <CodingProblem questionText={selected.data.question} />
            ) : (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {stripQuestionMarkers(selected.data.question)}
              </p>
            )}
          </div>

          {/* Right: editor + feedback */}
          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 flex flex-col">
              {coding ? (
                <div className="flex min-h-0 flex-1 flex-col border-b border-slate-700/40">
                  <CodeEditor
                    questionText={selected.data.question}
                    disabled={!awaitingAnswer}
                    onSubmit={onSubmit}
                    fillHeight
                  />
                </div>
              ) : (
                <div className="p-4 text-sm text-slate-400">Text answer mode — use Chat tab.</div>
              )}
            </div>

            <FeedbackPanel
              evaluation={selected.evaluation}
              visible={!!selected.evaluation}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionMeta({ data }: { data: QuestionData }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-indigo-600/30 bg-indigo-600/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
        {data.topic}
      </span>
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 text-xs font-semibold text-yellow-300">
        {data.difficulty}
      </span>
    </div>
  )
}

function FeedbackPanel({
  evaluation,
  visible,
}: {
  evaluation?: EvaluationData
  visible: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [visible, evaluation?.feedback])

  if (!visible || !evaluation) {
    return (
      <div className="shrink-0 border-t border-slate-700/40 bg-[#141824] px-4 py-3">
        <p className="text-xs text-slate-500">
          Feedback will appear here after you submit.
        </p>
      </div>
    )
  }

  const pct = Math.min(100, Math.max(0, evaluation.score ?? 0))
  const passed = evaluation.passed
  const barColor = pct >= PASS_THRESHOLD ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div
      ref={scrollRef}
      className="max-h-[38vh] shrink-0 overflow-y-auto border-t border-slate-700/40 bg-[#141824] px-4 py-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Feedback
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            passed
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {passed ? 'Passed' : 'Needs work'}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-lg font-bold text-white">
          {pct.toFixed(0)}
          <span className="text-sm text-slate-500">/100</span>
        </span>
      </div>

      <div className="prose prose-invert max-w-none text-sm leading-relaxed text-slate-200">
        <FormattedFeedback text={evaluation.feedback} />
      </div>
    </div>
  )
}

function FormattedFeedback({ text }: { text: string }) {
  const parts = text.split(/\n+/).filter(Boolean)
  return (
    <div className="space-y-3">
      {parts.map((line, i) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          return (
            <p key={i} className="font-semibold text-indigo-200">
              {trimmed.replace(/\*\*/g, '')}
            </p>
          )
        }
        if (trimmed.startsWith('**')) {
          const [head, ...rest] = trimmed.split('**').filter(Boolean)
          return (
            <div key={i}>
              <p className="mb-1 font-semibold text-slate-300">{head}</p>
              {rest.length > 0 && (
                <p className="text-slate-400">{rest.join(' ')}</p>
              )}
            </div>
          )
        }
        return <p key={i}>{trimmed}</p>
      })}
    </div>
  )
}
