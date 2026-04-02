import { useState } from 'react'
import type { SyntheticEvent } from 'react'

interface Props {
  onStart: (name: string, company: string, role: string, codingLanguage: string) => void
  statusMsg?: string
}

export function SetupScreen({ onStart, statusMsg }: Props) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [codingLanguage, setCodingLanguage] = useState('python')

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (name.trim() && company.trim() && role.trim()) {
      onStart(name.trim(), company.trim(), role.trim(), codingLanguage)
    }
  }

  const isValid = name.trim() && company.trim() && role.trim()

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117] px-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Interview Prep AI</h1>
          <p className="mt-2 text-slate-400 text-sm">
            AI-powered mock interviews tailored to your target company and role.
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#1a1f2e] border border-slate-700/50 rounded-2xl p-8 shadow-2xl space-y-5"
        >
          <Field
            label="Your name"
            placeholder="e.g. Alex Chen"
            value={name}
            onChange={setName}
            hint="Used to track your progress across sessions"
          />
          <Field
            label="Target company"
            placeholder="e.g. Google, Stripe, Databricks"
            value={company}
            onChange={setCompany}
          />
          <Field
            label="Target role"
            placeholder="e.g. Senior Software Engineer"
            value={role}
            onChange={setRole}
          />

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Coding language
            </label>
            <select
              value={codingLanguage}
              onChange={(e) => setCodingLanguage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-[#0f1117] border border-slate-600/60
                         text-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Used for the LeetCode-style coding sandbox.
            </p>
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-white
                       bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40
                       disabled:cursor-not-allowed focus:outline-none focus:ring-2
                       focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#1a1f2e]"
          >
            Start Interview
          </button>
        </form>

        {statusMsg && (
          <p className="text-center text-xs text-red-400 mt-3">
            {statusMsg}
          </p>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          Research · Interview · Evaluate · Review — powered by Gemini
        </p>
      </div>
    </div>
  )
}

function Field({
  label, placeholder, value, onChange, hint,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 rounded-lg bg-[#0f1117] border border-slate-600/60
                   text-white placeholder-slate-500 text-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
