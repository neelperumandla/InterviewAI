import { useState, useRef, useCallback, useEffect } from 'react'
import type {
  Screen, FeedItem, WsMessage,
  QuestionData, EvaluationData, ResearchData, SessionReviewData,
  InterviewTemplate, CoachEntry, TurnDialogueEntry,
} from '../types/interview'
import { totalTurnsFromTemplate } from '../utils/interviewTurns'
import { randomId } from '../randomId'
import { getWebSocketBase } from '../lib/wsUrl'

export function useInterview() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [statusMsg, setStatusMsg] = useState('')
  const [calibrationTopics, setCalibrationTopics] = useState<string[]>([])
  const [interviewTemplate, setInterviewTemplate] = useState<InterviewTemplate | undefined>()
  const [totalTurns, setTotalTurns] = useState(3)
  const [researchReady, setResearchReady] = useState(false)
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
  const [coachThread, setCoachThread] = useState<CoachEntry[]>([])
  const [coachThinking, setCoachThinking] = useState(false)
  const [turnDialogue, setTurnDialogue] = useState<TurnDialogueEntry[]>([])
  const [interviewerThinking, setInterviewerThinking] = useState(false)
  const [sessionReview, setSessionReview] = useState<SessionReviewData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [sessionId] = useState(() => randomId())

  const wsRef = useRef<WebSocket | null>(null)

  const addFeed = useCallback((kind: FeedItem['kind'], data: unknown) => {
    setFeedItems(prev => [...prev, {
      id: randomId(),
      kind,
      data,
      timestamp: Date.now(),
    }])
  }, [])

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'status':
        setStatusMsg(msg.message)
        if (!msg.message) {
          setCoachThinking(false)
          setInterviewerThinking(false)
        }
        break

      case 'research_done': {
        const rd = msg.data as ResearchData
        const tmpl = rd.interview_template
        setCalibrationTopics(rd.topics)
        setInterviewTemplate(tmpl)
        setTotalTurns(totalTurnsFromTemplate(tmpl))
        setResearchReady(true)
        addFeed('research', rd)
        const label = tmpl?.format_label ?? 'coding interview'
        const n = totalTurnsFromTemplate(tmpl)
        setStatusMsg(
          rd.from_cache
            ? `Loaded research — ${label} (${n} turn${n === 1 ? '' : 's'}).`
            : `Research complete — ${label} (${n} turn${n === 1 ? '' : 's'}).`,
        )
        break
      }

      case 'question': {
        const qd = msg.data as QuestionData
        setCurrentQuestion(qd)
        setCoachThread([])
        setCoachThinking(false)
        setInterviewerThinking(false)
        const isFollowUp = qd.phase === 'follow_up' || qd.response_mode === 'verbal'
        setTurnDialogue(
          isFollowUp ? [{ role: 'interviewer', content: qd.question }] : [],
        )
        setIsProcessing(false)
        setStatusMsg(
          isFollowUp
            ? `Turn ${qd.question_index ?? qd.attempt} — reply to the interviewer below.`
            : `Turn ${qd.question_index ?? qd.attempt} — answer when ready.`,
        )
        if (qd.total_turns) setTotalTurns(qd.total_turns)
        setFeedItems(prev => {
          const slotKey = qd.question_index ?? qd.attempt
          const filtered = prev.filter(item => {
            if (item.kind !== 'question') return true
            const q = item.data as QuestionData
            const k = q.question_index ?? q.attempt
            if (k !== slotKey) return true
            // Replace stale primary problem wrongly tagged as this turn.
            if (qd.phase === 'follow_up' && q.phase !== 'follow_up') return false
            return true
          })
          return [...filtered, {
            id: randomId(),
            kind: 'question',
            data: qd,
            timestamp: Date.now(),
          }]
        })
        break
      }

      case 'coach_reply': {
        const entry = msg.data as CoachEntry
        setCoachThread(prev => [...prev, entry])
        setCoachThinking(false)
        addFeed('coach', entry)
        break
      }

      case 'interviewer_reply': {
        const entry = msg.data as TurnDialogueEntry
        setTurnDialogue(prev => [...prev, entry])
        setInterviewerThinking(false)
        break
      }

      case 'evaluation': {
        const ed = msg.data as EvaluationData
        setCurrentQuestion(null)
        setCoachThread([])
        setTurnDialogue([])
        // Keep processing until the next question (or session review) arrives.
        setIsProcessing(true)
        setStatusMsg(
          ed.passed
            ? 'Feedback ready — generating next turn…'
            : 'Feedback ready — generating next turn…',
        )
        addFeed('evaluation', ed)
        break
      }

      case 'session_review':
        setSessionReview(msg.data as SessionReviewData)
        setIsProcessing(false)
        setCurrentQuestion(null)
        setCoachThread([])
        setTurnDialogue([])
        setScreen('review')
        break

      case 'done':
        setIsProcessing(false)
        setCoachThinking(false)
        break

      case 'error':
        setStatusMsg(`Error: ${msg.message}`)
        setIsProcessing(false)
        setCoachThinking(false)
        break
    }
  }, [addFeed])

  useEffect(() => {
    return () => { wsRef.current?.close() }
  }, [])

  const startSession = useCallback((
    name: string,
    company: string,
    role: string,
    codingLanguage: string,
  ) => {
    const ws = new WebSocket(`${getWebSocketBase()}/${sessionId}`)
    wsRef.current = ws

    setFeedItems([])
    setCalibrationTopics([])
    setInterviewTemplate(undefined)
    setTotalTurns(3)
    setCoachThread([])
    setTurnDialogue([])
    setResearchReady(false)
    setStatusMsg('Connecting to interview backend...')
    setIsProcessing(true)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', name, company, role, codingLanguage }))
      setScreen('interview')
    }

    ws.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data) as WsMessage)
      } catch (e) {
        console.error('WS parse error', e)
      }
    }

    ws.onerror = () => {
      setStatusMsg('Connection error. Is the API server running?')
      setIsProcessing(false)
    }

    ws.onclose = (event) => {
      setIsProcessing(false)
      setCoachThinking(false)
      if (event.wasClean) return
      setStatusMsg(
        `Connection lost (code ${event.code}). Refresh to start a new session.`,
      )
    }
  }, [sessionId, handleMessage])

  const submitAnswer = useCallback((answer: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!currentQuestion) return
    addFeed('answer', { text: answer })
    setCurrentQuestion(null)
    setCoachThread([])
    setTurnDialogue([])
    setIsProcessing(true)
    setStatusMsg('Evaluating your answer...')
    wsRef.current.send(JSON.stringify({
      type: 'answer',
      content: answer,
      topic: currentQuestion.topic,
      attempt: currentQuestion.attempt,
    }))
  }, [addFeed, currentQuestion])

  const sendTurnChat = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!currentQuestion) return
    setTurnDialogue(prev => [...prev, { role: 'candidate', content }])
    setInterviewerThinking(true)
    setStatusMsg('Interviewer is thinking…')
    wsRef.current.send(JSON.stringify({ type: 'turn_chat', content }))
  }, [currentQuestion])

  const sendCoachMessage = useCallback((mode: string, content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    if (!currentQuestion) return
    setCoachThinking(true)
    setStatusMsg('Coach is thinking…')
    wsRef.current.send(JSON.stringify({ type: 'coach', mode, content }))
  }, [currentQuestion])

  return {
    screen, statusMsg, calibrationTopics, interviewTemplate, totalTurns,
    researchReady, feedItems, currentQuestion, coachThread, coachThinking,
    turnDialogue, interviewerThinking,
    sessionReview, isProcessing, startSession, submitAnswer, sendCoachMessage,
    sendTurnChat,
  }
}
