import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  TopicState, FeedItem, QuestionData, EvaluationData,
} from '../types/interview'
import { TopicSidebar } from './TopicSidebar'
import { ChatPanel } from './ChatPanel'
import { ProblemPanel, type QuestionRecord } from './ProblemPanel'

interface Props {
  topics: TopicState[]
  feedItems: FeedItem[]
  currentQuestion: QuestionData | null
  statusMsg: string
  isProcessing: boolean
  onSubmit: (answer: string) => void
}

type Tab = 'chat' | 'problem'

export function InterviewScreen({
  topics, feedItems, currentQuestion, statusMsg, isProcessing, onSubmit,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [selectedIdx, setSelectedIdx] = useState<number>(0)
  const [problemUnread, setProblemUnread] = useState<number>(0)

  // Pair each question with its evaluation (if it has one yet).
  const questions = useMemo<QuestionRecord[]>(() => {
    const result: QuestionRecord[] = []
    let pending: QuestionData | null = null
    for (const item of feedItems) {
      if (item.kind === 'question') {
        if (pending) result.push({ data: pending })
        pending = item.data as QuestionData
      } else if (item.kind === 'evaluation' && pending) {
        result.push({ data: pending, evaluation: item.data as EvaluationData })
        pending = null
      }
    }
    if (pending) result.push({ data: pending })
    return result
  }, [feedItems])

  // Auto-follow newest question when the user was already on the previous latest.
  const prevLenRef = useRef(0)
  useEffect(() => {
    const prevLen = prevLenRef.current
    if (questions.length > prevLen) {
      if (prevLen === 0 || selectedIdx === prevLen - 1) {
        setSelectedIdx(questions.length - 1)
      }
      if (activeTab !== 'problem') {
        setProblemUnread(n => n + (questions.length - prevLen))
      }
    }
    prevLenRef.current = questions.length
  }, [questions.length, selectedIdx, activeTab])

  useEffect(() => {
    if (activeTab === 'problem') setProblemUnread(0)
  }, [activeTab])

  const hasLiveQuestion = !!currentQuestion && !isProcessing

  return (
    <div className="flex h-screen min-h-0 bg-[#0f1117]">
      {activeTab === 'problem' && (
        <TopicSidebar
          topics={topics}
          statusMsg={isProcessing && !currentQuestion ? statusMsg : ''}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header with tabs */}
        <header className="flex items-center justify-between border-b border-slate-700/50 bg-[#1a1f2e] px-6 py-3">
          <div className="flex items-center gap-1">
            <TabButton
              active={activeTab === 'chat'}
              onClick={() => setActiveTab('chat')}
              label="Chat"
            />
            <TabButton
              active={activeTab === 'problem'}
              onClick={() => setActiveTab('problem')}
              label="Problem"
              badge={problemUnread > 0 ? problemUnread : undefined}
              disabled={questions.length === 0}
            />
          </div>

          <div className="flex items-center gap-2">
            {isProcessing && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
                {statusMsg || 'Processing...'}
              </span>
            )}
          </div>
        </header>

        {activeTab === 'chat' ? (
          <ChatPanel feedItems={feedItems} />
        ) : (
          <ProblemPanel
            questions={questions}
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

interface TabButtonProps {
  active: boolean
  onClick: () => void
  label: string
  badge?: number
  disabled?: boolean
}

function TabButton({ active, onClick, label, badge, disabled }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-indigo-600/15 text-indigo-200'
          : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}
