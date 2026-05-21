import { useInterview } from './hooks/useInterview'
import { SetupScreen } from './components/SetupScreen'
import { InterviewScreen } from './components/InterviewScreen'
import { SessionReview } from './components/SessionReview'

export default function App() {
  const {
    screen, statusMsg, calibrationTopics, interviewTemplate, totalTurns,
    researchReady, feedItems, currentQuestion, coachThread, coachThinking,
    turnDialogue, interviewerThinking,
    sessionReview, isProcessing, startSession, submitAnswer, sendCoachMessage,
    sendTurnChat,
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
      interviewTemplate={interviewTemplate}
      totalTurns={totalTurns}
      currentQuestion={currentQuestion}
      coachThread={coachThread}
      coachThinking={coachThinking}
      turnDialogue={turnDialogue}
      interviewerThinking={interviewerThinking}
      sendTurnChat={sendTurnChat}
      statusMsg={statusMsg}
      isProcessing={isProcessing}
      researchReady={researchReady}
      onSubmit={submitAnswer}
      onCoachMessage={sendCoachMessage}
    />
  )
}
