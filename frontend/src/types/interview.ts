export type Screen = 'setup' | 'interview' | 'review'

export type TopicStatus = 'pending' | 'active' | 'passed' | 'failed' | 'skipped'

export interface TopicState {
  name: string
  status: TopicStatus
  score?: number
}

export interface QuestionData {
  topic: string
  question: string
  attempt: number
  max_attempts: number
  difficulty: string
}

export interface EvaluationData {
  score: number
  raw_score: number
  feedback: string
  critique_notes: string
  passed: boolean
}

export interface ResearchData {
  quality: string
  topics: string[]
  interview_type: string
  summary: string
}

export interface SessionReviewData {
  overall_score: number
  tier: string
  summary: string
  key_strengths: string[]
  key_gaps: string[]
  recommendations: string[]
  next_steps: string
  topic_history: TopicRecord[]
  passed_topics: string[]
  skipped_topics: string[]
}

export interface TopicRecord {
  topic: string
  question: string
  answer: string
  score: number
  raw_score: number
  feedback: string
  critique_notes: string
  passed: boolean
}

export type WsMessage =
  | { type: 'status';         message: string }
  | { type: 'research_done';  data: ResearchData }
  | { type: 'question';       data: QuestionData }
  | { type: 'evaluation';     data: EvaluationData }
  | { type: 'orchestrator';   data: { notes: string } }
  | { type: 'session_review'; data: SessionReviewData }
  | { type: 'error';          message: string }
  | { type: 'done' }

export interface FeedItem {
  id: string
  kind: 'question' | 'answer' | 'evaluation' | 'status' | 'research'
  data: unknown
  timestamp: number
}
