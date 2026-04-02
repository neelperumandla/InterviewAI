import { useInterview } from './hooks/useInterview'
import { SetupScreen } from './components/SetupScreen'
import { InterviewScreen } from './components/InterviewScreen'
import { SessionReview } from './components/SessionReview'

export default function App() {
  const {
    screen, statusMsg, topics, feedItems,
    currentQuestion, sessionReview, isProcessing,
    startSession, submitAnswer,
  } = useInterview()

  if (screen === 'setup') {
    return <SetupScreen onStart={startSession} statusMsg={statusMsg} />
  }

  if (screen === 'review' && sessionReview) {
    return <SessionReview data={sessionReview} />
  }

  return (
    <InterviewScreen
      topics={topics}
      feedItems={feedItems}
      currentQuestion={currentQuestion}
      statusMsg={statusMsg}
      isProcessing={isProcessing}
      onSubmit={submitAnswer}
    />
  )
}
