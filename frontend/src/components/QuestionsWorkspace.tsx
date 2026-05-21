import { useEffect, useRef, useState } from 'react'
import type { QuestionData, EvaluationData } from '../types/interview'
import { PASS_THRESHOLD } from '../constants'
import { CoachDrawer } from './CoachDrawer'
import type { CoachEntry } from '../types/interview'
import {
  CodeEditor,
  CodingProblem,
  isCodingQuestion,
  stripQuestionMarkers,
} from './CodeSandbox'
import { TurnAnswerPanel } from './TurnAnswerPanel'
import { FollowUpDialoguePanel } from './FollowUpDialoguePanel'
import type { TurnDialogueEntry } from '../types/interview'
import type { QuestionRecord } from './ProblemPanel'

interface Props {
  slots: (QuestionRecord | null)[]
  calibrationTopics: string[]
  totalTurns: number
  selectedIdx: number
  onSelectIdx: (idx: number) => void
  currentQuestion: QuestionData | null
  coachThread: CoachEntry[]
  coachThinking: boolean
  turnDialogue: TurnDialogueEntry[]
  interviewerThinking: boolean
  sendTurnChat: (content: string) => void
  hasLiveQuestion: boolean
  isProcessing: boolean
  onSubmit: (answer: string) => void
  onCoachMessage: (mode: string, content: string) => void
}

export function QuestionsWorkspace({
  slots,
  calibrationTopics,
  totalTurns,
  selectedIdx,
  onSelectIdx,
  currentQuestion,
  coachThread,
  coachThinking,
  turnDialogue,
  interviewerThinking,
  sendTurnChat,
  hasLiveQuestion,
  isProcessing,
  onSubmit,
  onCoachMessage,
}: Props) {
  const safeIdx = Math.min(Math.max(0, selectedIdx), Math.max(totalTurns, 1) - 1)
  const selected = slots[safeIdx]
  const liveSlot =
    currentQuestion?.question_index != null
      ? currentQuestion.question_index - 1
      : currentQuestion?.attempt != null
        ? currentQuestion.attempt - 1
        : -1
  const awaitingAnswer = liveSlot === safeIdx && hasLiveQuestion && !isProcessing
  const isFollowUpTurn =
    selected?.data.phase === 'follow_up' || selected?.data.response_mode === 'verbal'
  const useVerbalPanel =
    isFollowUpTurn || (selected && !isCodingQuestion(selected.data.question))
  const coding = selected ? isCodingQuestion(selected.data.question) && !useVerbalPanel : true
  const answeredCount = slots.filter(s => s?.evaluation).length
  const [coachOpen, setCoachOpen] = useState(false)
  const prevCoachCount = useRef(0)

  // Open drawer when a new coach reply arrives so the answer is visible.
  useEffect(() => {
    if (coachThread.length === 0) {
      prevCoachCount.current = 0
      return
    }
    if (coachThread.length > prevCoachCount.current) {
      setCoachOpen(true)
    }
    prevCoachCount.current = coachThread.length
  }, [coachThread.length])

  const isUnlocked = (i: number) => {
    if (slots[i]) return true
    if (hasLiveQuestion && liveSlot === i) return true
    // Next turn loading after prior feedback (even before question WS arrives).
    if (isProcessing && i === answeredCount) return true
    return false
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-700/40 bg-[#1a1f2e] px-4 py-2.5">
        {Array.from({ length: totalTurns }, (_, i) => {
          const q = slots[i]
          const topic = calibrationTopics[i] ?? q?.data.topic ?? `Question ${i + 1}`
          const unlocked = isUnlocked(i)
          const status: 'passed' | 'failed' | 'active' | 'locked' =
            q?.evaluation?.passed ? 'passed' :
            q?.evaluation && !q.evaluation.passed ? 'failed' :
            liveSlot === i && hasLiveQuestion ? 'active' :
            unlocked ? 'locked' :
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
              onClick={() => unlocked && onSelectIdx(i)}
              disabled={!unlocked}
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
          Mock interview · {totalTurns} turn{totalTurns === 1 ? '' : 's'}
        </span>
      </div>

      {!selected ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">
          <p className="text-sm">
            {slots.every(s => !s)
              ? 'Research complete — your first question will load shortly.'
              : 'Select an unlocked question above.'}
          </p>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2">
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

            <div className="flex min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-700/40 bg-[#141824] px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {useVerbalPanel ? 'Your response' : 'Code editor'}
                </span>
                <button
                  type="button"
                  onClick={() => setCoachOpen(true)}
                  disabled={!awaitingAnswer && coachThread.length === 0}
                  className="rounded-lg border border-indigo-600/40 bg-indigo-600/15 px-3 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/25 disabled:opacity-40"
                >
                  Open coach
                  {coachThread.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-indigo-500 px-1.5 text-[10px] text-white">
                      {coachThread.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="min-h-0 flex-1 flex flex-col">
                {useVerbalPanel && isFollowUpTurn ? (
                  <FollowUpDialoguePanel
                    dialogue={liveSlot === safeIdx ? turnDialogue : []}
                    disabled={!awaitingAnswer}
                    isThinking={interviewerThinking}
                    onSendMessage={sendTurnChat}
                    onSubmitTurn={onSubmit}
                  />
                ) : useVerbalPanel ? (
                  <TurnAnswerPanel
                    phase={selected.data.phase ?? 'follow_up'}
                    disabled={!awaitingAnswer}
                    onSubmit={onSubmit}
                  />
                ) : (
                  <CodeEditor
                    questionText={selected.data.question}
                    disabled={!awaitingAnswer}
                    onSubmit={onSubmit}
                    fillHeight
                  />
                )}
              </div>

              <FeedbackPanel
                evaluation={selected.evaluation}
                visible={!!selected.evaluation}
              />
            </div>
          </div>

          <CoachDrawer
            open={coachOpen}
            onOpenChange={setCoachOpen}
            thread={coachThread}
            disabled={!awaitingAnswer}
            isThinking={coachThinking}
            onSend={onCoachMessage}
            verbalTurn={!!isFollowUpTurn && awaitingAnswer}
          />
        </div>
      )}
    </div>
  )
}

function QuestionMeta({ data }: { data: QuestionData }) {
  const phaseLabel = data.phase === 'follow_up' ? 'Follow-up' : 'Main problem'
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-indigo-600/30 bg-indigo-600/20 px-2.5 py-1 text-xs font-semibold text-indigo-300">
        {data.topic}
      </span>
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 text-xs font-semibold text-yellow-300">
        {data.difficulty}
      </span>
      {data.phase && (
        <span className="rounded-full border border-slate-600/40 bg-slate-800/60 px-2.5 py-1 text-xs text-slate-300">
          {phaseLabel}
        </span>
      )}
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
    return null
  }

  const pct = Math.min(100, Math.max(0, evaluation.score ?? 0))
  const passed = evaluation.passed
  const barColor = pct >= PASS_THRESHOLD ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div
      ref={scrollRef}
      className="max-h-[32vh] shrink-0 overflow-y-auto border-t border-slate-700/40 bg-[#141824] px-4 py-4"
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

      {evaluation.coach_count != null && evaluation.coach_count > 0 && (
        <p className="mb-3 text-xs text-slate-500">
          Coach messages this turn: {evaluation.coach_count} (factored into score)
        </p>
      )}

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
