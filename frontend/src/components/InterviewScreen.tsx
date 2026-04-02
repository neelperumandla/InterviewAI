import { useEffect, useRef } from 'react'
import type { TopicState, FeedItem, QuestionData } from '../types/interview'
import { TopicSidebar } from './TopicSidebar'
import { FeedItemView } from './FeedItems'
import { AnswerInput } from './AnswerInput'
import { CodeSandbox } from './CodeSandbox'

interface Props {
  topics: TopicState[]
  feedItems: FeedItem[]
  currentQuestion: QuestionData | null
  statusMsg: string
  isProcessing: boolean
  onSubmit: (answer: string) => void
}

export function InterviewScreen({
  topics, feedItems, currentQuestion, statusMsg, isProcessing, onSubmit,
}: Props) {
  const feedEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feedItems])

  const awaitingAnswer = !!currentQuestion && !isProcessing

  return (
    <div className="flex h-screen min-h-0 bg-[#0f1117]">
      {/* Sidebar */}
      <TopicSidebar topics={topics} statusMsg={isProcessing && !currentQuestion ? statusMsg : ''} />

      {/* Main content — min-h-0 lets the feed shrink so overflow-y-auto can scroll */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4
                           border-b border-slate-700/50 bg-[#1a1f2e]">
          <h1 className="text-sm font-semibold text-white">Interview Session</h1>
          <div className="flex items-center gap-2">
            {isProcessing && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                {statusMsg || 'Processing...'}
              </span>
            )}
          </div>
        </header>

        {/* Feed */}
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {feedItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <p className="text-sm">Researching your target company...</p>
            </div>
          )}
          {feedItems.map(item => (
            <FeedItemView key={item.id} item={item} />
          ))}
          <div ref={feedEndRef} />
        </main>

        {/* Answer input */}
        {currentQuestion?.question && /SAMPLE_INPUT_BEGIN/i.test(currentQuestion.question) ? (
          <CodeSandbox
            questionText={currentQuestion.question}
            disabled={!awaitingAnswer}
            onSubmit={onSubmit}
          />
        ) : (
          <AnswerInput
            onSubmit={onSubmit}
            disabled={!awaitingAnswer}
            isProcessing={isProcessing}
          />
        )}
      </div>
    </div>
  )
}
