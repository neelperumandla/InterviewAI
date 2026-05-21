import { useInterview } from './hooks/useInterview'
import { SetupScreen } from './components/SetupScreen'
import { InterviewScreen } from './components/InterviewScreen'
import { SessionReview } from './components/SessionReview'

export default function App() {
  const {
    screen, statusMsg, calibrationTopics, researchReady,
    feedItems, currentQuestion, sessionReview, isProcessing,
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
      feedItems={feedItems}
      calibrationTopics={calibrationTopics}
      currentQuestion={currentQuestion}
      statusMsg={statusMsg}
      isProcessing={isProcessing}
      researchReady={researchReady}
      onSubmit={submitAnswer}
    />
  )
}
