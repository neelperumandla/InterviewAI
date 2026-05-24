import { useEffect, useMemo, useState } from 'react'
import type {
  CoachEntry, FeedItem, InterviewTemplate, QuestionData, TurnDialogueEntry,
} from '../types/interview'
import { ChatPanel } from './ChatPanel'
import { QuestionsWorkspace } from './QuestionsWorkspace'
import { buildCalibrationSlots } from '../utils/calibrationSlots'

interface Props {
  feedItems: FeedItem[]
  calibrationTopics: string[]
  interviewTemplate?: InterviewTemplate
  totalTurns: number
  currentQuestion: QuestionData | null
  coachThread: CoachEntry[]
  coachThinking: boolean
  turnDialogue: TurnDialogueEntry[]
  interviewerThinking: boolean
  sendTurnChat: (content: string) => void
  statusMsg: string
  isProcessing: boolean
  researchReady: boolean
  onSubmit: (answer: string) => void
  onCoachMessage: (mode: string, content: string) => void
}

type Tab = 'chat' | 'questions'

export function InterviewScreen({
  feedItems,
  calibrationTopics,
  interviewTemplate,
  totalTurns,
  currentQuestion,
  coachThread,
  coachThinking,
  turnDialogue,
  interviewerThinking,
  sendTurnChat,
  statusMsg,
  isProcessing,
  researchReady,
  onSubmit,
  onCoachMessage,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  const slots = useMemo(() => {
    const base = buildCalibrationSlots(feedItems, calibrationTopics, totalTurns)
    if (!currentQuestion) return base
    const idx =
      (currentQuestion.question_index ?? currentQuestion.attempt) - 1
    if (idx < 0 || idx >= base.length) return base
    const merged = [...base]
    const prev = base[idx]
    merged[idx] = {
      data: currentQuestion,
      evaluation: prev?.evaluation,
    }
    return merged
  }, [feedItems, calibrationTopics, totalTurns, currentQuestion])

  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    if (researchReady) setActiveTab('questions')
  }, [researchReady])

  useEffect(() => {
    const live = currentQuestion?.question_index ?? currentQuestion?.attempt
    if (live != null && live >= 1) {
      setSelectedIdx(live - 1)
      setActiveTab('questions')
    }
  }, [currentQuestion?.question_index, currentQuestion?.attempt])

  // After Q1 feedback, move to Q2 tab while the follow-up is generated.
  useEffect(() => {
    const answered = slots.filter(s => s?.evaluation).length
    if (answered > 0 && answered < totalTurns && (isProcessing || !slots[answered])) {
      setSelectedIdx(answered)
      setActiveTab('questions')
    }
  }, [slots, totalTurns, isProcessing])

  const hasLiveQuestion = !!currentQuestion && !isProcessing

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#0f1117]">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700/50 bg-[#1a1f2e] px-6 py-3">
        <div className="flex items-center gap-1">
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} label="Chat" />
          <TabButton
            active={activeTab === 'questions'}
            onClick={() => setActiveTab('questions')}
            label="Questions"
            disabled={!researchReady}
          />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {interviewTemplate?.format_label && (
            <span className="text-[11px] text-slate-500 max-w-md truncate">
              {interviewTemplate.format_label}
            </span>
          )}
          {(isProcessing || coachThinking) && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
              {statusMsg || 'Processing...'}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'chat' ? (
          <ChatPanel feedItems={feedItems} />
        ) : (
          <QuestionsWorkspace
            slots={slots}
            calibrationTopics={calibrationTopics}
            totalTurns={totalTurns}
            selectedIdx={selectedIdx}
            onSelectIdx={setSelectedIdx}
            currentQuestion={currentQuestion}
            coachThread={coachThread}
            coachThinking={coachThinking}
            turnDialogue={turnDialogue}
            interviewerThinking={interviewerThinking}
            sendTurnChat={sendTurnChat}
            hasLiveQuestion={hasLiveQuestion}
            isProcessing={isProcessing}
            onSubmit={onSubmit}
            onCoachMessage={onCoachMessage}
          />
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-indigo-600/15 text-indigo-200'
          : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  )
}
