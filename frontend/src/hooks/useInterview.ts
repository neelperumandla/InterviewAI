import { useState, useRef, useCallback, useEffect } from 'react'
import type {
  Screen, FeedItem, WsMessage,
  QuestionData, EvaluationData, ResearchData, SessionReviewData,
} from '../types/interview'
import { randomId } from '../randomId'

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`

export function useInterview() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [statusMsg, setStatusMsg] = useState('')
  const [calibrationTopics, setCalibrationTopics] = useState<string[]>([])
  const [researchReady, setResearchReady] = useState(false)
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null)
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
        break

      case 'research_done': {
        const rd = msg.data as ResearchData
        setCalibrationTopics(rd.topics)
        setResearchReady(true)
        addFeed('research', rd)
        setStatusMsg(
          rd.from_cache
            ? 'Loaded cached company research.'
            : 'Research complete — answer 3 calibration questions.',
        )
        break
      }

      case 'question': {
        const qd = msg.data as QuestionData
        setCurrentQuestion(qd)
        setIsProcessing(false)
        setStatusMsg('')
        addFeed('question', qd)
        break
      }

      case 'evaluation': {
        const ed = msg.data as EvaluationData
        setCurrentQuestion(null)
        setIsProcessing(false)
        setStatusMsg(
          ed.passed ? 'Nice work — loading next question…' : 'Review feedback — next question soon…',
        )
        addFeed('evaluation', ed)
        break
      }

      case 'session_review':
        setSessionReview(msg.data as SessionReviewData)
        setIsProcessing(false)
        setCurrentQuestion(null)
        setScreen('review')
        break

      case 'done':
        setIsProcessing(false)
        break

      case 'error':
        setStatusMsg(`Error: ${msg.message}`)
        setIsProcessing(false)
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
    const ws = new WebSocket(`${WS_URL}/${sessionId}`)
    wsRef.current = ws

    setFeedItems([])
    setCalibrationTopics([])
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
    setIsProcessing(true)
    setStatusMsg('Evaluating your answer...')
    wsRef.current.send(JSON.stringify({
      type: 'answer',
      content: answer,
      topic: currentQuestion.topic,
      attempt: currentQuestion.attempt,
    }))
  }, [addFeed, currentQuestion])

  return {
    screen, statusMsg, calibrationTopics, researchReady,
    feedItems, currentQuestion, sessionReview, isProcessing,
    startSession, submitAnswer,
  }
}
