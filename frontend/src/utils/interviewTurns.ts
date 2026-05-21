import type { InterviewTemplate } from '../types/interview'

export function totalTurnsFromTemplate(t: InterviewTemplate | undefined): number {
  if (!t) return 3
  const primary = t.primary_questions ?? 3
  const follow = t.follow_ups_per_problem ?? 0
  if (t.format === 'one_problem_followups') {
    return primary + follow
  }
  return primary
}
