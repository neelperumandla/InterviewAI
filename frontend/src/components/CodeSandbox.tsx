import { useEffect, useMemo, useState } from 'react'

function extractBetween(text: string, begin: string, end: string): string {
  const re = new RegExp(`${begin}\\s*([\\s\\S]*?)\\s*${end}`, 'mi')
  const match = text.match(re)
  return match ? match[1].trim() : ''
}

function stripMarkerBlocks(text: string): string {
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

interface Props {
  questionText: string
  disabled: boolean
  onSubmit: (code: string) => void
}

export function CodeSandbox({ questionText, disabled, onSubmit }: Props) {
  const extracted = useMemo(() => {
    const sampleInput = extractBetween(questionText, 'SAMPLE_INPUT_BEGIN', 'SAMPLE_INPUT_END')
    const expectedOutput = extractBetween(questionText, 'EXPECTED_OUTPUT_BEGIN', 'EXPECTED_OUTPUT_END')
    const starterCode = extractBetween(questionText, 'STARTER_CODE_BEGIN', 'STARTER_CODE_END')
    const problem = stripMarkerBlocks(questionText)
    return { sampleInput, expectedOutput, starterCode, problem }
  }, [questionText])

  const [code, setCode] = useState('')

  useEffect(() => {
    setCode(extracted.starterCode || '')
  }, [extracted.starterCode])

  return (
    <div className="border-t border-slate-700/50 bg-[#1a1f2e] p-5">
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Problem
          </h3>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
            {extracted.problem}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0f1117] border border-slate-700/40 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">
              Sample Input
            </p>
            <pre className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {extracted.sampleInput || '(not provided)'}
            </pre>
          </div>
          <div className="bg-[#0f1117] border border-slate-700/40 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wider">
              Expected Output
            </p>
            <pre className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {extracted.expectedOutput || '(not provided)'}
            </pre>
          </div>
        </div>

        <div className="bg-[#0f1117] border border-slate-700/60 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Code Editor
            </p>
            <span className="text-xs text-slate-500">(Ctrl+Enter to submit)</span>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={disabled}
            placeholder={disabled ? 'Waiting for next question...' : 'Write your solution code here...'}
            className="w-full h-56 bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none resize-none font-mono"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                if (!disabled) onSubmit(code)
              }
            }}
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => onSubmit(code)}
            disabled={disabled || code.trim().length === 0}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-sm"
          >
            Submit Code
          </button>
        </div>
      </div>
    </div>
  )
}

