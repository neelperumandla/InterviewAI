import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

function extractBetween(text: string, begin: string, end: string): string {
  const re = new RegExp(`${begin}\\s*([\\s\\S]*?)\\s*${end}`, 'mi')
  const match = text.match(re)
  return match ? match[1].trim() : ''
}

export function stripQuestionMarkers(text: string): string {
  return text
    .replace(/SAMPLE_INPUT_BEGIN[\s\S]*?SAMPLE_INPUT_END/mi, '')
    .replace(/EXPECTED_OUTPUT_BEGIN[\s\S]*?EXPECTED_OUTPUT_END/mi, '')
    .replace(/STARTER_CODE_BEGIN[\s\S]*?STARTER_CODE_END/mi, '')
    .replace(
      /SAMPLE_INPUT_BEGIN|SAMPLE_INPUT_END|EXPECTED_OUTPUT_BEGIN|EXPECTED_OUTPUT_END|STARTER_CODE_BEGIN|STARTER_CODE_END/gi,
      ''
    )
    .trim()
}

export function isCodingQuestion(text: string): boolean {
  return /SAMPLE_INPUT_BEGIN/i.test(text)
}

function useCodingProblem(questionText: string) {
  return useMemo(() => {
    const sampleInput = extractBetween(questionText, 'SAMPLE_INPUT_BEGIN', 'SAMPLE_INPUT_END')
    const expectedOutput = extractBetween(questionText, 'EXPECTED_OUTPUT_BEGIN', 'EXPECTED_OUTPUT_END')
    const starterCode = extractBetween(questionText, 'STARTER_CODE_BEGIN', 'STARTER_CODE_END')
    const problem = stripQuestionMarkers(questionText)
    return { sampleInput, expectedOutput, starterCode, problem }
  }, [questionText])
}

interface CodingProblemProps {
  questionText: string
}

export function CodingProblem({ questionText }: CodingProblemProps) {
  const { sampleInput, expectedOutput, problem } = useCodingProblem(questionText)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Problem
        </h3>
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
          {problem}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0f1117] border border-slate-700/40 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">
            Sample Input
          </p>
          <pre className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            {sampleInput || '(not provided)'}
          </pre>
        </div>
        <div className="bg-[#0f1117] border border-slate-700/40 rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">
            Expected Output
          </p>
          <pre className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
            {expectedOutput || '(not provided)'}
          </pre>
        </div>
      </div>
    </div>
  )
}

interface CodeEditorProps {
  questionText: string
  disabled: boolean
  onSubmit: (code: string) => void
  /** Fill the parent column (Questions workspace split layout). */
  fillHeight?: boolean
}

const INDENT = '    '
const BRACKET_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '`': '`',
}
const CLOSING_CHARS = new Set([')', ']', '}', '"', "'", '`'])

export function CodeEditor({ questionText, disabled, onSubmit, fillHeight = false }: CodeEditorProps) {
  const { starterCode } = useCodingProblem(questionText)
  const [code, setCode] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

  useEffect(() => {
    setCode(starterCode || '')
  }, [starterCode])

  // After a programmatic change, restore the desired caret/selection.
  useEffect(() => {
    const ta = textareaRef.current
    const pending = pendingSelectionRef.current
    if (ta && pending) {
      ta.selectionStart = pending.start
      ta.selectionEnd = pending.end
      pendingSelectionRef.current = null
    }
  }, [code])

  function applyChange(newValue: string, selStart: number, selEnd: number = selStart) {
    pendingSelectionRef.current = { start: selStart, end: selEnd }
    setCode(newValue)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Submit shortcut always wins
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (!disabled) onSubmit(code)
      return
    }

    if (disabled) return

    const ta = e.currentTarget
    const value = ta.value
    const start = ta.selectionStart
    const end = ta.selectionEnd

    // Tab / Shift+Tab: indent / dedent
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        // Dedent
        if (start === end) {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1
          let i = 0
          while (i < INDENT.length && lineStart + i < start && value[lineStart + i] === ' ') i++
          if (i === 0) return
          applyChange(value.substring(0, lineStart) + value.substring(lineStart + i), start - i)
        } else {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1
          const before = value.substring(0, lineStart)
          const middle = value.substring(lineStart, end)
          const after = value.substring(end)
          const lines = middle.split('\n')
          let firstRemoved = 0
          let totalRemoved = 0
          const newLines = lines.map((line, idx) => {
            let i = 0
            while (i < INDENT.length && line[i] === ' ') i++
            if (idx === 0) firstRemoved = i
            totalRemoved += i
            return line.substring(i)
          })
          applyChange(before + newLines.join('\n') + after, start - firstRemoved, end - totalRemoved)
        }
      } else {
        if (start === end) {
          applyChange(value.substring(0, start) + INDENT + value.substring(end), start + INDENT.length)
        } else {
          const lineStart = value.lastIndexOf('\n', start - 1) + 1
          const before = value.substring(0, lineStart)
          const middle = value.substring(lineStart, end)
          const after = value.substring(end)
          const lines = middle.split('\n')
          const newMiddle = lines.map(l => INDENT + l).join('\n')
          applyChange(
            before + newMiddle + after,
            start + INDENT.length,
            end + INDENT.length * lines.length,
          )
        }
      }
      return
    }

    // Enter: auto-indent, expand brace pairs
    if (e.key === 'Enter') {
      e.preventDefault()
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const currentLine = value.substring(lineStart, start)
      const leadingMatch = currentLine.match(/^[\t ]*/)
      const indent = leadingMatch ? leadingMatch[0] : ''
      const prevChar = value[start - 1]
      const nextChar = value[start]
      const openers: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

      if (prevChar && openers[prevChar]) {
        const innerIndent = indent + INDENT
        if (nextChar === openers[prevChar]) {
          applyChange(
            value.substring(0, start) + '\n' + innerIndent + '\n' + indent + value.substring(end),
            start + 1 + innerIndent.length,
          )
        } else {
          applyChange(
            value.substring(0, start) + '\n' + innerIndent + value.substring(end),
            start + 1 + innerIndent.length,
          )
        }
      } else {
        applyChange(
          value.substring(0, start) + '\n' + indent + value.substring(end),
          start + 1 + indent.length,
        )
      }
      return
    }

    // Auto-close brackets / quotes
    if (BRACKET_PAIRS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      const open = e.key
      const close = BRACKET_PAIRS[open]
      if (start !== end) {
        const selected = value.substring(start, end)
        applyChange(
          value.substring(0, start) + open + selected + close + value.substring(end),
          start + 1,
          end + 1,
        )
      } else {
        applyChange(value.substring(0, start) + open + close + value.substring(end), start + 1)
      }
      return
    }

    // Step over matching closing char
    if (
      CLOSING_CHARS.has(e.key) &&
      start === end &&
      value[start] === e.key &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      e.preventDefault()
      applyChange(value, start + 1)
      return
    }

    // Backspace deletes matched pair if cursor sits between them
    if (e.key === 'Backspace' && start === end && start > 0) {
      const before = value[start - 1]
      const after = value[start]
      if (BRACKET_PAIRS[before] && BRACKET_PAIRS[before] === after) {
        e.preventDefault()
        applyChange(value.substring(0, start - 1) + value.substring(start + 1), start - 1)
      }
    }
  }

  const shell = (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-[#0f1117] ${
        fillHeight ? 'h-full rounded-none border-0' : 'rounded-xl border border-slate-700/60'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700/50 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Code Editor
        </p>
        <span className="text-xs text-slate-500">Tab indents · Ctrl+Enter submits</span>
      </div>
      <textarea
        ref={textareaRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder={disabled ? 'Waiting for next question...' : 'Write your solution code here...'}
        className={`block w-full min-h-0 flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 placeholder-slate-600 outline-none ${
          fillHeight ? '' : 'h-64 resize-y'
        }`}
        style={{ tabSize: 4 }}
      />
      <div className="flex shrink-0 justify-end border-t border-slate-700/50 px-4 py-2.5">
        <button
          type="button"
          onClick={() => onSubmit(code)}
          disabled={disabled || code.trim().length === 0}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Submit Code
        </button>
      </div>
    </div>
  )

  if (fillHeight) {
    return <div className="flex min-h-0 flex-1 flex-col p-3">{shell}</div>
  }

  return (
    <div className="border-t border-slate-700/50 bg-[#1a1f2e] p-4">
      {shell}
    </div>
  )
}
