export type Screen = 'setup' | 'interview' | 'review'

export type TopicStatus = 'pending' | 'active' | 'passed' | 'failed' | 'skipped'

export interface TopicState {
  name: string
  status: TopicStatus
  score?: number
}

export interface InterviewTemplate {
  format: 'one_problem_followups' | 'multi_problem' | string
  primary_questions: number
  follow_ups_per_problem: number
  format_label: string
  estimated_minutes?: number
}

export interface CoachEntry {
  mode: string
  content: string
  reply: string
}

export interface TurnDialogueEntry {
  role: 'interviewer' | 'candidate'
  content: string
}

export interface QuestionData {
  topic: string
  question: string
  /** Turn index 1..N within session. */
  question_index?: number
  attempt: number
  max_attempts: number
  difficulty: string
  phase?: 'primary' | 'follow_up' | string
  /** code = editor submit; verbal = follow-up text box */
  response_mode?: 'code' | 'verbal'
  total_turns?: number
  format_label?: string
}

export interface EvaluationData {
  topic?: string
  question_index?: number
  attempt?: number
  question?: string
  score: number
  raw_score: number
  feedback: string
  critique_notes: string
  passed: boolean
  phase?: string
  coach_count?: number
}

export interface ResearchData {
  quality: string
  topics: string[]
  interview_type: string
  summary: string
  from_cache?: boolean
  interview_template?: InterviewTemplate
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
  attempt?: number
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
  | { type: 'coach_reply';    data: CoachEntry }
  | { type: 'interviewer_reply'; data: TurnDialogueEntry }
  | { type: 'orchestrator';   data: { notes: string } }
  | { type: 'session_review'; data: SessionReviewData }
  | { type: 'error';          message: string }
  | { type: 'done' }

export interface FeedItem {
  id: string
  kind: 'question' | 'answer' | 'evaluation' | 'status' | 'research' | 'coach'
  data: unknown
  timestamp: number
}
