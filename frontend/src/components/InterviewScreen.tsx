import { useEffect, useMemo, useRef, useState } from 'react'
import type { FeedItem, QuestionData, EvaluationData } from '../types/interview'
import { ChatPanel } from './ChatPanel'
import { QuestionsWorkspace } from './QuestionsWorkspace'
import type { QuestionRecord } from './ProblemPanel'

interface Props {
  feedItems: FeedItem[]
  calibrationTopics: string[]
  currentQuestion: QuestionData | null
  statusMsg: string
  isProcessing: boolean
  researchReady: boolean
  onSubmit: (answer: string) => void
}

type Tab = 'chat' | 'questions'

export function InterviewScreen({
  feedItems,
  calibrationTopics,
  currentQuestion,
  statusMsg,
  isProcessing,
  researchReady,
  onSubmit,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  const questions = useMemo<QuestionRecord[]>(() => {
    const result: QuestionRecord[] = []
    const byKey = new Map<string, QuestionRecord>()
    const keyOf = (topic: string, attempt: number) => `${topic}::${attempt}`

    for (const item of feedItems) {
      if (item.kind === 'question') {
        const q = item.data as QuestionData
        const rec: QuestionRecord = { data: q }
        result.push(rec)
        byKey.set(keyOf(q.topic, q.attempt), rec)
      } else if (item.kind === 'evaluation') {
        const ev = item.data as EvaluationData
        const rec = byKey.get(keyOf(ev.topic ?? '', ev.attempt ?? 0))
        if (rec) rec.evaluation = ev
      }
    }
    return result
  }, [feedItems])

  const [selectedIdx, setSelectedIdx] = useState(0)
  const prevLenRef = useRef(0)

  useEffect(() => {
    if (researchReady) setActiveTab('questions')
  }, [researchReady])

  useEffect(() => {
    const prevLen = prevLenRef.current
    if (questions.length > prevLen) {
      if (prevLen === 0 || selectedIdx === prevLen - 1) {
        setSelectedIdx(questions.length - 1)
      }
      setActiveTab('questions')
    }
    prevLenRef.current = questions.length
  }, [questions.length, selectedIdx])

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
        {isProcessing && (
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
            {statusMsg || 'Processing...'}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'chat' ? (
          <ChatPanel feedItems={feedItems} />
        ) : (
          <QuestionsWorkspace
            questions={questions}
            calibrationTopics={calibrationTopics}
            selectedIdx={selectedIdx}
            onSelectIdx={setSelectedIdx}
            hasLiveQuestion={hasLiveQuestion}
            isProcessing={isProcessing}
            onSubmit={onSubmit}
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
