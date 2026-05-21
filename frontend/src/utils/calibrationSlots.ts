import type { FeedItem, QuestionData, EvaluationData } from '../types/interview'
import type { QuestionRecord } from '../components/ProblemPanel'

/** Map feed events into fixed Q1..Qn slots (by turn index). */
export function buildCalibrationSlots(
  feedItems: FeedItem[],
  topics: string[],
  totalSlots: number,
): (QuestionRecord | null)[] {
  const n = Math.max(totalSlots, topics.length, 1)
  const slots: (QuestionRecord | null)[] = Array.from({ length: n }, () => null)

  const slotFor = (topic: string, index?: number) => {
    if (index != null && index >= 1 && index <= n) return index - 1
    const byTopic = topics.findIndex(t => t === topic)
    return byTopic >= 0 ? byTopic : -1
  }

  for (const item of feedItems) {
    if (item.kind === 'question') {
      const q = item.data as QuestionData
      const idx = slotFor(q.topic, q.question_index ?? q.attempt)
      if (idx >= 0) {
        const prev = slots[idx]
        const replace =
          !prev
          || q.phase === 'follow_up'
          || prev.data.phase !== 'follow_up'
        if (replace) {
          slots[idx] = { data: q, evaluation: prev?.evaluation }
        }
      }
    } else if (item.kind === 'evaluation') {
      const ev = item.data as EvaluationData
      const idx = slotFor(ev.topic ?? '', ev.question_index ?? ev.attempt)
      if (idx >= 0 && slots[idx]) {
        slots[idx] = { ...slots[idx]!, evaluation: ev }
      }
    }
  }

  return slots
}
