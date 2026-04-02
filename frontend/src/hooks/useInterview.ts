import { useState, useRef, useCallback, useEffect } from 'react'
import type {
  Screen, TopicState, FeedItem, WsMessage,
  QuestionData, EvaluationData, ResearchData, SessionReviewData,
} from '../types/interview'
import { randomId } from '../randomId'

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.host}/ws`

export function useInterview() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [statusMsg, setStatusMsg] = useState('')
  const [topics, setTopics] = useState<TopicState[]>([])
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
        setTopics(rd.topics.map(t => ({ name: t, status: 'pending' as const })))
        addFeed('research', rd)
        setStatusMsg('')
        break
      }

      case 'question': {
        const qd = msg.data as QuestionData
        setCurrentQuestion(qd)
        setIsProcessing(false)
        setTopics(prev => prev.map(t =>
          t.name === qd.topic ? { ...t, status: 'active' } : t
        ))
        addFeed('question', qd)
        break
      }

      case 'evaluation': {
        const ed = msg.data as EvaluationData
        setCurrentQuestion(null)
        setIsProcessing(true)
        setTopics(prev => prev.map(t => {
          // find the active topic and update its status
          if (t.status === 'active') {
            return { ...t, score: ed.score, status: ed.passed ? 'passed' : 'failed' }
          }
          return t
        }))
        addFeed('evaluation', ed)
        break
      }

      case 'orchestrator':
        // orchestrator thinking — keep processing spinner on
        break

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

    setStatusMsg('Connecting to interview backend...')
    setIsProcessing(true)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', name, company, role, codingLanguage }))
      setIsProcessing(true)
      setScreen('interview')
    }

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        handleMessage(msg)
      } catch (e) {
        console.error('WS parse error', e)
      }
    }

    ws.onerror = () => {
      setStatusMsg('Connection error. Is the API server running?')
      setIsProcessing(false)
    }
  }, [sessionId, handleMessage])

  const submitAnswer = useCallback((answer: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    addFeed('answer', { text: answer })
    setCurrentQuestion(null)
    setIsProcessing(true)
    setStatusMsg('Evaluating your answer...')
    wsRef.current.send(JSON.stringify({ type: 'answer', content: answer }))
  }, [addFeed])

  return {
    screen, statusMsg, topics, feedItems,
    currentQuestion, sessionReview, isProcessing,
    startSession, submitAnswer,
  }
}
