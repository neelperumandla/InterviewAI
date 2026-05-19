import { useEffect, useRef } from 'react'
import type { QuestionData, EvaluationData } from '../types/interview'
import { PASS_THRESHOLD } from '../constants'
import { AnswerInput } from './AnswerInput'
import {
  CodeEditor,
  CodingProblem,
  isCodingQuestion,
  stripQuestionMarkers,
} from './CodeSandbox'

export interface QuestionRecord {
  data: QuestionData
  evaluation?: EvaluationData
}

interface Props {
  questions: QuestionRecord[]
  selectedIdx: number
  onSelectIdx: (idx: number) => void
  hasLiveQuestion: boolean
  isProcessing: boolean
  onSubmit: (answer: string) => void
}

export function ProblemPanel({
  questions,
  selectedIdx,
  onSelectIdx,
  hasLiveQuestion,
  isProcessing,
  onSubmit,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedIdx])

  if (questions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-slate-500">
        <p className="text-sm">No problems yet. The first question will appear here.</p>
      </div>
    )
  }

  const safeIdx = Math.min(Math.max(0, selectedIdx), questions.length - 1)
  const selected = questions[safeIdx]
  const isLatest = safeIdx === questions.length - 1
  const awaitingAnswer = isLatest && hasLiveQuestion && !isProcessing
  const coding = isCodingQuestion(selected.data.question)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Question navigator */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-700/40 bg-[#1a1f2e] px-6 py-3">
        <span className="mr-2 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Questions
        </span>
        {questions.map((q, i) => {
          const status: 'passed' | 'failed' | 'active' | 'pending' =
            q.evaluation?.passed ? 'passed' :
            q.evaluation && !q.evaluation.passed ? 'failed' :
            i === questions.length - 1 && hasLiveQuestion ? 'active' :
            'pending'
          const isSel = i === safeIdx
          const tone =
            status === 'passed' ? 'border-emerald-500/40 text-emerald-300' :
            status === 'failed' ? 'border-red-500/40 text-red-300' :
            status === 'active' ? 'border-indigo-500/40 text-indigo-300' :
            'border-slate-700/40 text-slate-400'
          const badge =
            status === 'passed' ? '✓' :
            status === 'failed' ? '✗' :
            status === 'active' ? '●' :
            ''
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectIdx(i)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${tone} ${
                isSel ? 'bg-slate-800/80 ring-1 ring-indigo-500/50' : 'bg-slate-900/40 hover:bg-slate-800/60'
              }`}
              title={q.data.topic}
            >
              Q{i + 1}
              {badge && <span className="ml-1.5 opacity-80">{badge}</span>}
            </button>
          )
        })}
        <div className="ml-auto shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectIdx(Math.max(0, safeIdx - 1))}
            disabled={safeIdx === 0}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-700/40 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Previous question"
          >
            ←
          </button>
          <span className="text-xs text-slate-500">
            {safeIdx + 1} / {questions.length}
          </span>
          <button
            type="button"
            onClick={() => onSelectIdx(Math.min(questions.length - 1, safeIdx + 1))}
            disabled={safeIdx === questions.length - 1}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-700/40 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next question"
          >
            →
          </button>
        </div>
      </div>

      {/* Scrollable question + evaluation */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <QuestionHeader data={selected.data} />

        {coding ? (
          <CodingProblem questionText={selected.data.question} />
        ) : (
          <p className="text-base leading-relaxed text-white whitespace-pre-wrap">
            {stripQuestionMarkers(selected.data.question)}
          </p>
        )}

        {selected.evaluation && <PastEvaluation data={selected.evaluation} />}

        {!isLatest && (
          <div className="rounded-xl border border-slate-700/40 bg-slate-800/40 p-3 text-xs text-slate-400">
            Viewing a past question — only the latest open question can be answered.
          </div>
        )}
      </div>

      {/* Input area */}
      {coding ? (
        <CodeEditor
          questionText={selected.data.question}
          disabled={!awaitingAnswer}
          onSubmit={onSubmit}
        />
      ) : (
        <AnswerInput
          onSubmit={onSubmit}
          disabled={!awaitingAnswer}
          isProcessing={isProcessing && isLatest}
        />
      )}
    </div>
  )
}

function QuestionHeader({ data }: { data: QuestionData }) {
  const diffColor =
    data.difficulty === 'hard' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
    data.difficulty === 'easy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-indigo-600/30 bg-indigo-600/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
        {data.topic}
      </span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${diffColor}`}>
        {data.difficulty}
      </span>
      <span className="ml-auto text-xs text-slate-500">
        Attempt {data.attempt}/{data.max_attempts}
      </span>
    </div>
  )
}

function PastEvaluation({ data }: { data: EvaluationData }) {
  const pct = Math.min(100, Math.max(0, data.score))
  const color = pct >= PASS_THRESHOLD ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  const badgeStyle = data.passed
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : 'bg-red-500/15 text-red-400 border-red-500/30'

  return (
    <div className="rounded-xl border border-slate-700/40 bg-[#0f1117] p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${badgeStyle}`}>
          {data.passed ? '✓ PASSED' : '✗ NEEDS WORK'}
        </span>
        <div className="flex flex-1 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-12 text-right font-mono text-sm font-bold">
            {pct.toFixed(0)}/100
          </span>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {data.feedback}
      </p>
    </div>
  )
}
