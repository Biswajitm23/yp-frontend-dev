'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Sparkles,
  Send,
  SendHorizontal,
  RotateCcw,
  Check,
  ChevronRight,
  Zap,
  Heart,
  Pencil,
  Save,
  RotateCw,
  Trash2,
  PenLine,
  MoreVertical,
  Copy,
  RefreshCw,
  TriangleAlert,
  FileText
} from 'lucide-react'
import {
  fetchAISummaryQuestions,
  addAISummary
} from '@/services/ai_summary.services'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { useTheme } from '@/context/ThemeContext'
import ConfirmModal from '@/components/commonUI/ConfirmModal'
import { useAuthGate } from '@/app/hooks/useAuthGate'
import { isUnauthenticatedError } from '@/lib/authError'
import { useCvPrefill } from './useCvPrefill'
import { safeStreamPrefix, stripLeadingFence } from './streamWords'
import '@/moduleCss/ai_summary.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AISummaryQuestion {
  id: string
  question: string
  placeholder: string
  max_length: string
  question_type: 'strengths' | 'interests'
  description?: string
}

interface ApiSystemPrompts {
  strengths_generation: string
}

interface ProfileData {
  name: string
  age?: string | number
  designation?: string
  location?: string
  education?: string[]
  existingSkills?: string[]
}

interface SummaryGeneratorModalProps {
  isOpen: boolean
  onClose: () => void
  onSummaryGenerated: (data: { strength: string; interest: string }) => void
  userName?: string
  profileData?: ProfileData
  hasExistingSummary?: boolean
  /** Saved CV URL. When present, the flow can pre-fill answers from the CV. */
  resumeUrl?: string
  /**
   * Whether to pre-fill answers from the uploaded CV. When false (the user chose
   * "Fill Manually" in the choice popup), the CV is ignored and every question
   * is answered by the user. Defaults to true so existing callers pre-fill.
   */
  prefillFromCv?: boolean
}

interface Message {
  id: string
  role: 'ai' | 'user'
  text: string
  type?: 'validation'
  description?: string
  questionIndex?: number
  /** True while the CV pre-filled answer is being typed out char-by-char. */
  streaming?: boolean
}

// ─── AI Provider Layer ────────────────────────────────────────────────────────

const OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-3.5-turbo',
] as const

type OpenAIModel = typeof OPENAI_MODELS[number]

interface AIConfig {
  primary: OpenAIModel
  fallback: OpenAIModel | null
}

const AI_CONFIG: AIConfig = {
  primary: OPENAI_MODELS[0],
  fallback: OPENAI_MODELS[1]
}

// All OpenAI calls go through same-origin, auth-gated server routes so the API
// key stays server-side (never shipped to the browser — the whole point of this
// change). This posts one chat completion and returns the assistant text.
async function postChat (payload: {
  model: string
  messages: unknown[]
}): Promise<string> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`ai/chat request failed: ${res.status}`)
  const data = (await res.json().catch(() => null)) as {
    content?: string
  } | null
  return typeof data?.content === 'string' ? data.content : ''
}

// ─── User Context Builder ─────────────────────────────────────────────────────

function buildProfileContext (profileData: ProfileData): string {
  const profileLines: string[] = [`- Name: ${profileData.name}`]
  if (profileData.age) profileLines.push(`- Age: ${profileData.age}`)
  if (profileData.designation)
    profileLines.push(`- Current Designation: ${profileData.designation}`)
  if (profileData.location)
    profileLines.push(`- Location: ${profileData.location}`)
  if (profileData.education?.length)
    profileLines.push(`- Education: ${profileData.education.join(', ')}`)
  if (profileData.existingSkills?.length)
    profileLines.push(
      `- Existing Skills: ${profileData.existingSkills.join(', ')}`
    )
  return profileLines.join('\n')
}

// Merge the CV-extracted education with the profile's saved education. The CV
// comes first (it's usually richer — extra entries + grades), then any profile
// entries the CV didn't already cover, de-duplicated by a normalized prefix so
// the same qualification from both sources isn't listed twice.
function mergeEducationContext (
  cvEducation: string[],
  profileEducation: string[] = []
): string[] {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of [...cvEducation, ...profileEducation]) {
    const t = (entry ?? '').trim()
    if (!t) continue
    const key = norm(t)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

function buildUserContext (
  profileData: ProfileData,
  questions: AISummaryQuestion[],
  answers: Record<string, string>,
  filterType?: 'strengths' | 'interests'
): string {
  const filtered = filterType
    ? questions.filter(q => q.question_type === filterType)
    : questions

  const answerLines = filtered
    .map((q, i) => `${i + 1}. ${q.question}: ${answers[q.id] ?? ''}`)
    .join('\n')

  // Make the candidate's name explicit so the summary reliably opens with it.
  // The name is present in PROFILE above too, but as bare metadata the model
  // often omits it from the prose — this instruction attaches it every time.
  const name = (profileData.name ?? '').trim()
  const nameDirective = name
    ? `\n\nThe candidate's name is ${name}. Write the summary in the FIRST PERSON as ${name}, and introduce them by name in the opening line of the Personal Profile section (e.g. "I am ${name}, ...").`
    : ''

  return `PROFILE:\n${buildProfileContext(profileData)}\n\nUSER ANSWERS:\n${answerLines}${nameDirective}`
}

// ─── Parse Helpers ────────────────────────────────────────────────────────────

// Cleans AI output by stripping markdown code fences and trimming whitespace.
function parseAIResponse (raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json|markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
  return cleaned.trim()
}

// Strength-specific cleanup: the strength prompt sometimes leaks Interest-tab
// sections into the response (e.g. "Interest Summary", "What Excites Me"). Cut
// the strength content off the moment any interest heading is encountered so
// the Strength tab only renders strength material.
function parseStrengthResponse (raw: string): string {
  const cleaned = parseAIResponse(raw)
  // Common headings the interest prompt uses. Matched at line start with
  // optional markdown formatting (#, **, etc.).
  const interestHeadingRegex =
    /(^|\n)\s*(?:#{1,6}\s*|\*\*|__)?\s*(Interest Summary|What Excites Me|Interests?\s*&?\s*Passions|My Interests?|Why It Excites Me)\b/i
  const match = cleaned.match(interestHeadingRegex)
  if (match && typeof match.index === 'number') {
    return cleaned.slice(0, match.index).trimEnd()
  }
  return cleaned
}

// ─── Provider Caller ──────────────────────────────────────────────────────────

async function callProviderWithPrompt (
  modelName: OpenAIModel,
  system: string,
  prompt: string,
  parse: (text: string) => string
): Promise<string> {
  const text = await postChat({
    model: modelName,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  })
  return parse(text)
}

// ─── Public generate() ────────────────────────────────────────────────────────

async function generate (
  profileData: ProfileData,
  questions: AISummaryQuestion[],
  answers: Record<string, string>,
  systemPrompts: ApiSystemPrompts
): Promise<{ strength: string; usedFallback: boolean }> {
  const { primary, fallback } = AI_CONFIG
  const strengthsContext = buildUserContext(profileData, questions, answers, 'strengths')

  async function callWithFallback (
    system: string,
    userContext: string,
    parse: (text: string) => string
  ): Promise<{ value: string; usedFallback: boolean }> {
    try {
      const value = await callProviderWithPrompt(
        primary,
        system,
        userContext,
        parse
      )
      return { value, usedFallback: false }
    } catch (err) {
      if (!fallback) throw err
      console.warn(`[AI] ${primary} failed, trying ${fallback}:`, err)
      const value = await callProviderWithPrompt(
        fallback,
        system,
        userContext,
        parse
      )
      return { value, usedFallback: true }
    }
  }

  const strengthResult = await callWithFallback(
    systemPrompts.strengths_generation,
    strengthsContext,
    parseStrengthResponse
  )

  return {
    strength: strengthResult.value,
    usedFallback: strengthResult.usedFallback
  }
}

// ─── Streaming generate() ─────────────────────────────────────────────────────

// Streaming variant of callProviderWithPrompt: streams tokens from the model and
// calls `onSafe` with the largest WORD-SAFE prefix of everything received so far,
// so the client never renders a half-typed word ("Pursu…") or an unclosed
// **bold** marker. The held-back tail lands on the next chunk / at completion.
async function callProviderStream (
  modelName: OpenAIModel,
  system: string,
  prompt: string,
  onSafe: (safeText: string) => void
): Promise<string> {
  const res = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ]
    })
  })
  if (!res.ok || !res.body) {
    throw new Error(`ai/chat/stream request failed: ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    raw += decoder.decode(value, { stream: true })
    onSafe(safeStreamPrefix(stripLeadingFence(raw)))
  }
  raw += decoder.decode() // flush any trailing bytes
  // An empty stream means the server produced nothing — surface it so the
  // caller falls back to the non-streaming path.
  if (!raw.trim()) throw new Error('empty stream')
  return raw
}

// Streaming counterpart of generate(): streams the strength summary, emitting
// only complete words to `onSafe`, and returns the final cleaned full text.
async function generateStream (
  profileData: ProfileData,
  questions: AISummaryQuestion[],
  answers: Record<string, string>,
  systemPrompts: ApiSystemPrompts,
  onSafe: (safeText: string) => void
): Promise<{ strength: string; usedFallback: boolean }> {
  const { primary, fallback } = AI_CONFIG
  const strengthsContext = buildUserContext(
    profileData,
    questions,
    answers,
    'strengths'
  )
  const system = systemPrompts.strengths_generation

  try {
    const raw = await callProviderStream(primary, system, strengthsContext, onSafe)
    return { strength: parseStrengthResponse(raw), usedFallback: false }
  } catch (err) {
    if (!fallback) throw err
    console.warn(`[AI] streaming ${primary} failed, trying ${fallback}:`, err)
    const raw = await callProviderStream(fallback, system, strengthsContext, onSafe)
    return { strength: parseStrengthResponse(raw), usedFallback: true }
  }
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingDots () {
  return (
    <div className='sgm-typing-dots'>
      <span />
      <span />
      <span />
    </div>
  )
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function renderInline (text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  )
}

// Strips markdown markup so the Edit box shows clean, human-readable prose
// instead of raw "## Heading" / "**bold**" syntax. Heading TEXT is kept (the
// renderer re-promotes title-case lines back to headings on save), only the
// markers are removed. Mirrors SummeryCard's editor behaviour.
function stripMarkdown (text: string): string {
  if (!text) return ''
  return text
    .split('\n')
    .map(line => {
      if (line.startsWith('### ')) return line.slice(4)
      if (line.startsWith('## ')) return line.slice(3)
      if (line.startsWith('# ')) return line.slice(2)
      if (/^[•·●]\s+/.test(line)) return line.replace(/^[•·●]\s*/, '- ')
      return line
    })
    .join('\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
}

// Normalises inconsistently-formatted AI output before rendering.
// Handles: "## Heading — inline content", orphan bullets, title-case section names without "##".
function normalizeMarkdown (text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // "## Heading — inline content" → split into heading + content paragraph
    if (trimmed.startsWith('## ')) {
      const dashMatch = trimmed.match(/^(##\s+.+?)\s*[—–]\s*(.+)$/)
      if (dashMatch) {
        out.push(dashMatch[1].trim())
        if (dashMatch[2].trim()) out.push(dashMatch[2].trim())
        i++
        continue
      }
    }

    // Orphan bullet symbol alone on a line → combine with next line as a bullet
    if (/^[•·●]\s*$/.test(trimmed) && i + 1 < lines.length) {
      out.push(`- ${lines[i + 1].trim()}`)
      i += 2
      continue
    }

    // Title-case section heading without ## (2–5 capitalized words, no trailing punctuation)
    // e.g. "Key Skills", "What Excites Me", "Career Aspirations"
    if (/^([A-Z][a-z]+ ){1,4}[A-Z][a-z]+$/.test(trimmed)) {
      out.push(`## ${trimmed}`)
      i++
      continue
    }

    // "Section Name —" with trailing dash → also promote
    if (/^[A-Z][^#\n]+[—–]\s*$/.test(trimmed)) {
      out.push(`## ${trimmed.replace(/\s*[—–]\s*$/, '')}`)
      i++
      continue
    }

    out.push(line)
    i++
  }
  return out.join('\n')
}



function renderMarkdown (text: string) {
  return normalizeMarkdown(text).split('\n').map((line, i) => {
    // Section labels like "SKILLS:" or "SUMMARY:"
    if (/^(SKILLS|SUMMARY):?\s*$/.test(line.trim())) {
      return <div key={i} className='sgm-md-section-label'>{line.trim().replace(/:$/, '')}</div>
    }
    // Stray standalone "#" line → render nothing.
    if (line.trim() === '#') return null
    // H1 title (e.g. "# Student Profile Summary") → white, slightly larger.
    if (line.startsWith('# ')) {
      return (
        <div
          key={i}
          style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}
        >
          {renderInline(line.slice(2).replace(/\s*summary\s*$/i, ''))}
        </div>
      )
    }
    if (line.startsWith('## ')) {
      return (
        <div key={i} className='sgm-md-heading'>
          {renderInline(line.slice(3))}
        </div>
      )
    }
    if (line.startsWith('### ')) {
      return (
        <div key={i} className='sgm-md-heading'>
          {renderInline(line.slice(4))}
        </div>
      )
    }
    // Dash bullets: "- text" or "* text"
    if (/^[-*]\s+/.test(line)) {
      return (
        <div key={i} className='sgm-md-bullet'>
          <span className='sgm-md-dot'>•</span>
          <span>{renderInline(line.replace(/^[-*]\s+/, ''))}</span>
        </div>
      )
    }
    // Unicode bullets with content
    if (/^[••]\s+/.test(line)) {
      return (
        <div key={i} className='sgm-md-bullet'>
          <span className='sgm-md-dot'>•</span>
          <span>{renderInline(line.replace(/^[••]\s+/, ''))}</span>
        </div>
      )
    }
    if (line.trim() === '') return <div key={i} className='sgm-md-gap' />
    return (
      <div key={i} className='sgm-md-text'>
        {renderInline(line)}
      </div>
    )
  })
}

// ─── Streaming Text Hook ──────────────────────────────────────────────────────
// Animates fullText character by character using requestAnimationFrame.
// Adaptive speed: longer text streams faster to avoid overly slow reveals.

function useStreamText () {
  const [displayedText, setDisplayedText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const rafRef = useRef<number | null>(null)
  const indexRef = useRef(0)

  const startStream = useCallback((rawText: string, onDone?: () => void) => {
    // Defensive: the streamer slices this char-by-char, so guarantee a string
    // even if an upstream parser hands us a non-string value.
    const fullText = typeof rawText === 'string' ? rawText : String(rawText ?? '')
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setDisplayedText('')
    setIsStreaming(true)
    indexRef.current = 0

    // Reveal ~a word at a time (word-boundary logic below), and only advance
    // every FRAME_SKIP animation frames so the summary writes out at a calm,
    // readable pace rather than racing to the end. Bump FRAME_SKIP for slower.
    const charsPerFrame = Math.max(1, Math.ceil(fullText.length / 1500))
    const FRAME_SKIP = 2
    let frame = 0

    const isSpace = (ch: string) => /\s/.test(ch)

    function tick () {
      // Throttle: skip frames so words appear at a gentle, readable cadence.
      if (++frame % FRAME_SKIP !== 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      let next = Math.min(indexRef.current + charsPerFrame, fullText.length)

      if (next < fullText.length) {
        // Never cut a word in half: finish the current word, then consume any
        // trailing whitespace so the next frame starts on a fresh word. This is
        // why the reveal waits for a full word ("Biswajit") instead of showing
        // a fragment ("Bis").
        while (next < fullText.length && !isSpace(fullText[next])) next++
        while (next < fullText.length && isSpace(fullText[next])) next++

        // Don't stop inside an unclosed **bold** run either — reveal through its
        // closing "**" so the markdown never flashes as a stray "**".
        const openBold =
          (fullText.slice(0, next).match(/\*\*/g)?.length ?? 0) % 2 === 1
        if (openBold) {
          const close = fullText.indexOf('**', next)
          next = close === -1 ? fullText.length : close + 2
          while (next < fullText.length && isSpace(fullText[next])) next++
        }
      }

      indexRef.current = next
      setDisplayedText(fullText.slice(0, indexRef.current))
      if (indexRef.current < fullText.length) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setIsStreaming(false)
        onDone?.()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // ── Live streaming mode (real API tokens) ──
  // Used when the summary streams from the model. The caller feeds already
  // word-safe text (see safeStreamPrefix) via setLiveText; we just render it.
  const beginStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    indexRef.current = 0
    setDisplayedText('')
    setIsStreaming(true)
  }, [])

  const setLiveText = useCallback((text: string) => {
    setDisplayedText(text)
  }, [])

  const endStream = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setIsStreaming(false)
  }, [])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  return { displayedText, isStreaming, startStream, beginStream, setLiveText, endStream }
}

// ─── AI Generation Loader ─────────────────────────────────────────────────────
// A modern, theme-aware loader for the two AI "thinking" moments — reading the
// CV and writing the summary. A spinning brand-gradient ring with orbiting
// satellites around a glowing core icon, plus rotating status text and a shimmer
// bar. Self-contained (scoped <style>) so it needs no CSS-module changes.
function AiGenLoader ({
  texts,
  variant = 'generate'
}: {
  texts?: string[]
  variant?: 'cv' | 'generate'
}) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  const defaultTexts =
    variant === 'cv'
      ? [
          'Reading your CV',
          'Extracting your details',
          'Pre-filling your answers',
          'Almost ready'
        ]
      : [
          'Analyzing your profile',
          'Discovering your strengths',
          'Writing your summary',
          'Polishing the details',
          'Almost there'
        ]
  const loadingTexts = texts ?? defaultTexts
  const [textIndex, setTextIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(
      () => setTextIndex(prev => (prev + 1) % loadingTexts.length),
      2200
    )
    return () => clearInterval(id)
  }, [loadingTexts.length])

  const Icon = variant === 'cv' ? FileText : Sparkles
  const textColor = isLight ? '#334155' : '#e2e8f0'
  const subColor = isLight ? '#94a3b8' : '#64748b'
  const track = isLight ? 'rgba(84,51,255,0.10)' : 'rgba(255,255,255,0.06)'

  return (
    <div className='aigl-wrap'>
      <style>{`
        @keyframes aigl-spin { to { transform: rotate(360deg) } }
        @keyframes aigl-spin-rev { to { transform: rotate(-360deg) } }
        @keyframes aigl-pulse { 0%,100% { transform: scale(1); opacity:1 } 50% { transform: scale(1.14); opacity:.92 } }
        @keyframes aigl-glow {
          0%,100% { box-shadow: 0 0 20px 3px rgba(84,51,255,0.35), 0 0 38px 8px rgba(32,189,255,0.16) }
          50% { box-shadow: 0 0 30px 7px rgba(84,51,255,0.5), 0 0 52px 14px rgba(32,189,255,0.26) }
        }
        @keyframes aigl-dot { 0%,80%,100% { opacity:.25; transform: translateY(0) } 40% { opacity:1; transform: translateY(-3px) } }
        @keyframes aigl-fade { from { opacity:0; transform: translateY(4px) } to { opacity:1; transform: translateY(0) } }
        @keyframes aigl-sheen { 0% { transform: translateX(-130%) } 100% { transform: translateX(130%) } }
        .aigl-wrap { flex:1; min-height:0; align-self:stretch; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; padding:28px 16px; text-align:center }
        .aigl-stage { position:relative; width:96px; height:96px; display:flex; align-items:center; justify-content:center }
        .aigl-track { position:absolute; inset:0; border-radius:50%; border:4px solid ${track} }
        .aigl-ring { position:absolute; inset:0; border-radius:50%;
          background: conic-gradient(from 0deg, transparent 0deg, #5433ff 130deg, #20bdff 270deg, transparent 360deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px));
          animation: aigl-spin 2.4s linear infinite }
        .aigl-orbit { position:absolute; inset:-5px; border-radius:50%; animation: aigl-spin 3.4s linear infinite }
        .aigl-orbit.rev { inset:-2px; animation: aigl-spin-rev 4.8s linear infinite }
        .aigl-sat { position:absolute; top:-4px; left:50%; width:8px; height:8px; margin-left:-4px; border-radius:50%;
          background: linear-gradient(135deg,#5433ff,#20bdff); box-shadow:0 0 8px rgba(32,189,255,0.7) }
        .aigl-sat.b { top:auto; bottom:-4px; background: linear-gradient(135deg,#20bdff,#5433ff) }
        .aigl-core { position:relative; width:60px; height:60px; border-radius:50%;
          background: linear-gradient(135deg,#5433ff,#20bdff); display:flex; align-items:center; justify-content:center;
          color:#fff; animation: aigl-glow 2.6s ease-in-out infinite }
        .aigl-core svg { animation: aigl-pulse 1.6s ease-in-out infinite }
        .aigl-text-wrap { min-height:22px; display:flex; align-items:center; gap:2px }
        .aigl-text { font-family: var(--font-plus-jakarta), sans-serif; font-size:14px; font-weight:600; color:${textColor}; animation: aigl-fade .4s ease }
        .aigl-dots { display:inline-flex; gap:4px; margin-left:4px; color:${textColor} }
        .aigl-dots i { width:4px; height:4px; border-radius:50%; background:currentColor; display:inline-block; animation: aigl-dot 1.2s ease-in-out infinite }
        .aigl-dots i:nth-child(2){ animation-delay:.15s } .aigl-dots i:nth-child(3){ animation-delay:.3s }
        .aigl-bar { position:relative; width:158px; height:4px; border-radius:99px; overflow:hidden; background:${track} }
        .aigl-bar::after { content:''; position:absolute; inset:0; width:45%; border-radius:99px;
          background: linear-gradient(90deg, transparent, #5433ff, #20bdff, transparent); animation: aigl-sheen 1.5s ease-in-out infinite }
        .aigl-sub { font-family: var(--font-dm-sans), sans-serif; font-size:11px; color:${subColor} }
      `}</style>

      <div className='aigl-stage'>
        <div className='aigl-track' />
        <div className='aigl-ring' />
        <div className='aigl-orbit'><span className='aigl-sat' /></div>
        <div className='aigl-orbit rev'><span className='aigl-sat b' /></div>
        <div className='aigl-core'>
          <Icon size={26} strokeWidth={2} />
        </div>
      </div>

      <div className='aigl-text-wrap'>
        <span key={textIndex} className='aigl-text'>
          {loadingTexts[textIndex]}
        </span>
        <span className='aigl-dots'>
          <i />
          <i />
          <i />
        </span>
      </div>

      <div className='aigl-bar' />
      <div className='aigl-sub'>
        {variant === 'cv'
          ? 'Powered by Dan AI'
          : 'Crafting something great with Dan AI'}
      </div>
    </div>
  )
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

function TabButton ({
  active,
  onClick,
  // icon,
  label,
  streaming,
  done,
  tabType
}: {
  active: boolean
  onClick: () => void
  // icon: React.ReactNode;
  label: string
  streaming?: boolean
  done?: boolean
  tabType: 'strength' | 'interest'
}) {
  return (
    <button
      className={`sgm-tab ${tabType}-tab${active ? ' active' : ''}${
        streaming ? ' streaming' : ''
      }`}
      onClick={onClick}
    >
      {/* <span className="sgm-tab-icon">{icon}</span> */}
      <span className='sgm-tab-label'>{label}</span>
      {streaming && <span className='sgm-tab-pulse' />}
      {done && !streaming && (
        <span className='sgm-tab-done'>
          <Check size={9} />
        </span>
      )}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SummaryGeneratorModal ({
  isOpen,
  onClose,
  onSummaryGenerated,
  userName,
  profileData,
  hasExistingSummary = false,
  resumeUrl,
  prefillFromCv = true
}: SummaryGeneratorModalProps) {
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'
  const { ensureAuthed, openGate, gateModal: authGateModal } = useAuthGate()
  const { prefill: runCvPrefill } = useCvPrefill()
  const resolvedProfile: ProfileData = profileData ?? { name: userName ?? '' }
  // This run pre-fills from the CV only if a CV exists AND the user chose to use
  // it. "Fill Manually" (prefillFromCv=false) runs the plain question flow.
  const willPrefillFromCv = prefillFromCv && !!(resumeUrl && resumeUrl.trim())
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [inputValue, setInputValue] = useState('')
  const [isAiTyping, setIsAiTyping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const [generatedSummary, setGeneratedSummary] = useState('')
  const [generatedInterest, setGeneratedInterest] = useState('')

  const [phase, setPhase] = useState<'chat' | 'generating' | 'result'>('chat')
  const [activeTab, setActiveTab] = useState<'strength' | 'interest'>(
    'strength'
  )
  const [isCopied, setIsCopied] = useState<'strength' | 'interest' | null>(null)
  const [isEditing, setIsEditing] = useState<'strength' | 'interest' | null>(
    null
  )
  // Plain-text (markdown-stripped) copy of the summary shown while editing, so
  // the user edits clean prose instead of raw "##"/"**" markup. Committed back
  // into generatedSummary on Save.
  const [editDraft, setEditDraft] = useState('')
  const [hasError, setHasError] = useState(false)
  const [failedAnswers, setFailedAnswers] = useState<Record<
    string,
    string
  > | null>(null)
  const [usedFallback, setUsedFallback] = useState(false)
  const [greetingShown, setGreetingShown] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [showDeleteAnswerConfirm, setShowDeleteAnswerConfirm] = useState(false)
  const [pendingActionQuestionIndex, setPendingActionQuestionIndex] = useState<number | null>(null)
  // Which answer bubble currently has its three-dot (Edit / Delete) menu open.
  const [openAnswerMenuId, setOpenAnswerMenuId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  // After the LAST answer we don't auto-generate — we show a dedicated
  // "Generate My Summary" button (an explicit step, not a modal popup) and only
  // run the generation once the user taps it. `answersToGenerate` holds the
  // final answer map captured at that moment.
  const [awaitingGenerate, setAwaitingGenerate] = useState(false)
  const [answersToGenerate, setAnswersToGenerate] = useState<Record<
    string,
    string
  > | null>(null)

  // ── CV pre-fill (only active when a CV is uploaded) ──
  const [isParsingCv, setIsParsingCv] = useState(false)
  const [awaitingPrefillNext, setAwaitingPrefillNext] = useState(false)
  // True while a CV answer is being typed out (typewriter) into its bubble.
  const [isTypingPrefill, setIsTypingPrefill] = useState(false)
  const prefillTypingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // WhatsApp-style edit of a pre-filled answer via the normal bottom input.
  const [editingPrefill, setEditingPrefill] = useState(false)
  const prefillModeRef = useRef(false)
  // Whether THIS run is a CV run — captured once when the modal opens so the
  // greeting and the first-step effects can't disagree (which showed both the
  // generic AND the CV greeting).
  const cvRunRef = useRef(false)
  const prefillAnswersRef = useRef<Record<string, string> | null>(null)
  // Education entries parsed out of the uploaded CV — merged into the profile
  // education so the generated Education section reflects the CV, not only the
  // saved profile educations.
  const cvEducationRef = useRef<string[]>([])
  // Mirrors `answers` so the async prefill "Next" can read the latest map.
  const answersRef = useRef<Record<string, string>>({})

  // Per-tab streaming
  const strengthStream = useStreamText()
  const interestStream = useStreamText()
  const [strengthDone, setStrengthDone] = useState(false)
  const [interestDone, setInterestDone] = useState(false)

  const {
    data: apiQuestions
  } = useQuery({
    queryKey: ['ai-summary-questions'],
    queryFn: fetchAISummaryQuestions
  })

  const questions: AISummaryQuestion[] = apiQuestions?.data?.questions ?? []
  const systemPrompts: ApiSystemPrompts | undefined =
    apiQuestions?.data?.system_prompts

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Result panel (streamed summary) auto-scroll. `autoScrollRef` stays true
  // while the user is at the bottom and flips off when they scroll up to read.
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const msgIdRef = useRef(0)
  const nextMsgId = () => `msg-${++msgIdRef.current}`
  const sessionActiveRef = useRef(false)
  const firstQuestionAskedRef = useRef(false)

  const TOTAL = questions.length || 10

  useEffect(() => setMounted(true), [])

  // Keep a ref copy of answers for the async prefill flow.
  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      requestAnimationFrame(() => setAnimating(true))
    } else {
      setAnimating(false)
      const t = setTimeout(() => setVisible(false), 280)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  const resetState = () => {
    setMessages([])
    setAnswers({})
    setInputValue('')
    setCurrentQuestionIndex(0)
    setGeneratedSummary('')
    setGeneratedInterest('')
    setPhase('chat')
    setActiveTab('strength')
    setIsAiTyping(false)
    setIsGenerating(false)
    setHasError(false)
    setFailedAnswers(null)
    setUsedFallback(false)
    setStrengthDone(false)
    setInterestDone(false)
    setIsEditing(null)
    setEditDraft('')
    setGreetingShown(false)
    setOpenAnswerMenuId(null)
    setEditingMessageId(null)
    setEditingText('')
    setAwaitingGenerate(false)
    setAnswersToGenerate(null)
    setIsParsingCv(false)
    setAwaitingPrefillNext(false)
    setIsTypingPrefill(false)
    if (prefillTypingRef.current) {
      clearInterval(prefillTypingRef.current)
      prefillTypingRef.current = null
    }
    setEditingPrefill(false)
    prefillModeRef.current = false
    prefillAnswersRef.current = null
    cvEducationRef.current = []
    answersRef.current = {}
    msgIdRef.current = 0
    sessionActiveRef.current = false
    firstQuestionAskedRef.current = false
  }

  // ── Draft session persistence ──────────────────────────────────────────────
  // Persist an in-progress Q&A (or a generated-but-unused result) so the user
  // can close the modal — or even refresh / navigate away — and resume exactly
  // where they left off. Keyed per user so drafts don't leak between accounts
  // on a shared browser.
  const sessionKey = `yp_ai_summary_session::${userName || ''}`
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h — drop stale drafts.

  const clearSession = () => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(sessionKey)
    } catch {
      /* ignore */
    }
  }

  const restoreSession = (): boolean => {
    if (typeof window === 'undefined') return false
    try {
      const raw = localStorage.getItem(sessionKey)
      if (!raw) return false
      const s = JSON.parse(raw)
      if (!s || s.v !== 1 || !Array.isArray(s.messages) || s.messages.length === 0)
        return false
      if (
        typeof s.savedAt === 'number' &&
        Date.now() - s.savedAt > SESSION_TTL_MS
      ) {
        clearSession()
        return false
      }

      const restoredAnswers: Record<string, string> = s.answers ?? {}
      // Strip transient streaming flags — everything is fully rendered now.
      setMessages((s.messages as Message[]).map(m => ({ ...m, streaming: false })))
      setAnswers(restoredAnswers)
      answersRef.current = restoredAnswers
      setCurrentQuestionIndex(s.currentQuestionIndex ?? 0)
      setGeneratedSummary(s.generatedSummary ?? '')
      setGeneratedInterest(s.generatedInterest ?? '')
      const restoredPhase = s.phase === 'result' ? 'result' : 'chat'
      setPhase(restoredPhase)
      if (restoredPhase === 'result') {
        setStrengthDone(true)
        setInterestDone(true)
        setActiveTab('strength')
      }
      setGreetingShown(true)
      setAwaitingPrefillNext(!!s.awaitingPrefillNext)
      // Resume the "Generate My Summary" step (all answered, not yet generated).
      if (restoredPhase === 'chat' && s.awaitingGenerate) {
        setAwaitingGenerate(true)
        setAnswersToGenerate(restoredAnswers)
      }

      prefillModeRef.current = !!s.prefillMode
      prefillAnswersRef.current = s.prefillAnswers ?? null
      cvEducationRef.current = Array.isArray(s.cvEducation) ? s.cvEducation : []
      cvRunRef.current = !!s.cvRun
      firstQuestionAskedRef.current = true
      msgIdRef.current =
        typeof s.msgId === 'number' ? s.msgId : s.messages.length
      sessionActiveRef.current = true
      return true
    } catch {
      return false
    }
  }

  // Types the CV-derived answer into its bubble one character-group at a time so
  // it reads like a live AI response, then reveals the Edit / Next controls.
  const typeOutPrefillAnswer = (
    msgId: string,
    fullText: string,
    onDone: () => void,
  ) => {
    if (prefillTypingRef.current) clearInterval(prefillTypingRef.current)
    let i = 0
    // Reveal several chars per tick on a short interval so the answer types out
    // quickly (~1s even for long answers) while still reading like a live reply.
    const step = Math.max(2, Math.ceil(fullText.length / 55))
    prefillTypingRef.current = setInterval(() => {
      i = Math.min(i + step, fullText.length)
      const slice = fullText.slice(0, i)
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, text: slice } : m)),
      )
      if (i >= fullText.length) {
        if (prefillTypingRef.current) clearInterval(prefillTypingRef.current)
        prefillTypingRef.current = null
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, streaming: false } : m)),
        )
        onDone()
      }
    }, 25)
  }

  // Stop any in-flight typewriter if the modal unmounts.
  useEffect(
    () => () => {
      if (prefillTypingRef.current) clearInterval(prefillTypingRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!isOpen) return

    // If session is already active, resume without resetting
    if (sessionActiveRef.current) return

    // Resume a saved in-progress session (survives close, refresh, navigation).
    if (restoreSession()) return

    resetState()
    sessionActiveRef.current = true

    cvRunRef.current = willPrefillFromCv
    // CV flow: show the loader immediately (parse first), then greet AFTER
    // parsing — so the greeting never appears before the loader.
    if (willPrefillFromCv) setIsParsingCv(true)

    const t = setTimeout(() => {
      const name = userName || 'there'
      if (willPrefillFromCv) {
        setGreetingShown(true)
        return
      }
      const greeting = `Hi ${name}! ✨ I'm Dan AI, your personal profile summary builder.\n\nI'll ask you ${TOTAL} quick questions to craft your personalised profile summary. Let's get started!`
      addAiMessage(greeting, () => setGreetingShown(true))
    }, 400)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Ask first question once greeting is shown AND API questions are available.
  // When a CV is uploaded, parse it first and pre-fill the answers (the manual
  // flow is used unchanged when there is no CV or parsing yields nothing).
  useEffect(() => {
    if (
      !isOpen ||
      !greetingShown ||
      questions.length === 0 ||
      firstQuestionAskedRef.current
    )
      return
    firstQuestionAskedRef.current = true
    if (cvRunRef.current) {
      const t = setTimeout(() => {
        startCvPrefill()
      }, 400)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => askQuestion(0), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetingShown, questions, isOpen])

  // Persist a snapshot of the live session whenever meaningful progress changes,
  // so a close / refresh / navigation can be resumed. Skip transient moments
  // (generating, parsing the CV, typing out an answer) — we only save stable,
  // resumable states, and only once there's real progress to keep.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isOpen || !sessionActiveRef.current) return
    if (isGenerating || isParsingCv || isTypingPrefill) return
    const hasProgress =
      Object.keys(answers).length > 0 ||
      phase === 'result' ||
      awaitingPrefillNext
    if (!hasProgress) return
    try {
      const snapshot = {
        v: 1,
        savedAt: Date.now(),
        messages: messages.map(m => ({ ...m, streaming: false })),
        answers,
        currentQuestionIndex,
        phase: phase === 'generating' ? 'chat' : phase,
        generatedSummary,
        generatedInterest,
        awaitingPrefillNext,
        awaitingGenerate,
        prefillMode: prefillModeRef.current,
        prefillAnswers: prefillAnswersRef.current,
        cvEducation: cvEducationRef.current,
        cvRun: cvRunRef.current,
        msgId: msgIdRef.current,
      }
      localStorage.setItem(sessionKey, JSON.stringify(snapshot))
    } catch {
      /* ignore quota / serialization errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    messages,
    answers,
    currentQuestionIndex,
    phase,
    generatedSummary,
    generatedInterest,
    awaitingPrefillNext,
    awaitingGenerate,
    isGenerating,
    isParsingCv,
    isTypingPrefill,
  ])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAiTyping])

  // While the user reads/scrolls the streaming result, decide whether we should
  // keep following the bottom: at (or near) the bottom → follow; scrolled up →
  // pause so their reading position is respected.
  const handleResultScroll = () => {
    const el = resultPanelRef.current
    if (!el) return
    autoScrollRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  // Follow the bottom as the summary streams in — but only while auto-scroll is
  // still on (i.e. the user hasn't scrolled up to read earlier content).
  useEffect(() => {
    if (phase !== 'result') return
    if (!autoScrollRef.current) return
    const el = resultPanelRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [phase, strengthStream.displayedText, interestStream.displayedText])

  // Each time a fresh result begins, reset to "follow the bottom".
  useEffect(() => {
    if (phase === 'result') autoScrollRef.current = true
  }, [phase])

  useEffect(() => {
    if (!isAiTyping && phase === 'chat')
      setTimeout(() => inputRef.current?.focus(), 100)
  }, [isAiTyping, phase])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // The answer action sheet layers over the chat, so Escape dismisses the
      // sheet first rather than tearing down the whole builder.
      if (openAnswerMenuId) {
        setOpenAnswerMenuId(null)
        return
      }
      handleClose()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [isOpen, onClose, openAnswerMenuId])

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const addAiMessage = (text: string, onDone?: () => void, type?: 'validation', description?: string) => {
    const id = nextMsgId()
    setIsAiTyping(true)
    setTimeout(() => {
      setIsAiTyping(false)
      setMessages(prev => [...prev, { id, role: 'ai', text, ...(type ? { type } : {}), ...(description ? { description } : {}) }])
      onDone?.()
    }, Math.min(800 + text.length * 8, 2000))
  }

  const questionTransitions = [
    '',
    'Love that! 🙌 Now, ',
    "You're on a roll! ✨ ",
    'That\'s gold — ',
    'Brilliant! Keep it coming — ',
    'This is shaping up beautifully! 🚀 ',
    "You're really standing out! Now, ",
    'Almost there — one more — ',
    'So close! Just, ',
    'Last one — make it count! 🎯 '
  ]

  const askQuestion = (index: number) => {
    if (index >= questions.length) return
    const transition = questionTransitions[index] ?? ''
    const q = questions[index]
    // In CV pre-fill mode, if the CV produced an answer for this question, show
    // it as the user's answer (editable) and wait for "Next". Blank answers fall
    // through to the normal manual input.
    const prefillVal = prefillModeRef.current
      ? prefillAnswersRef.current?.[q.id]?.trim() ?? ''
      : ''
    addAiMessage(
      `${transition}${q.question}`,
      prefillVal
        ? () => {
            const msgId = nextMsgId()
            // Add an empty user bubble, then type the CV answer into it so it
            // reads like a live AI response. Edit / Next appear once it finishes.
            setMessages(prev => [
              ...prev,
              {
                id: msgId,
                role: 'user',
                text: '',
                questionIndex: index,
                streaming: true,
              },
            ])
            setAnswers(prev => ({ ...prev, [q.id]: prefillVal }))
            setIsTypingPrefill(true)
            typeOutPrefillAnswer(msgId, prefillVal, () => {
              setIsTypingPrefill(false)
              setAwaitingPrefillNext(true)
            })
          }
        : undefined,
      undefined,
      q.description
    )
  }

  // Parse the uploaded CV, seed the answers, then start the one-by-one review.
  // The orb loader (below) is shown while this runs — once, not per question.
  const startCvPrefill = async () => {
    setIsParsingCv(true)
    try {
      // Pass the profile's education + skills so the CV pre-fill can answer from
      // BOTH the CV and the saved profile (user.educations / user.skills).
      const result = await runCvPrefill(resumeUrl ?? '', questions, userName, {
        education: resolvedProfile.education,
        skills: resolvedProfile.existingSkills,
      })
      const seeded = result?.answers ?? null
      // Keep the CV's own education so generation can reflect it (grades, extra
      // entries) alongside the saved profile educations.
      cvEducationRef.current = result?.education ?? []
      if (seeded && Object.values(seeded).some(v => v.trim())) {
        prefillAnswersRef.current = seeded
        prefillModeRef.current = true
      } else {
        prefillModeRef.current = false
      }
    } catch {
      prefillModeRef.current = false
    } finally {
      setIsParsingCv(false)
      const name = userName || 'there'
      // How many of the TOTAL questions we could pre-fill from the CV.
      const filledCount = prefillModeRef.current
        ? Object.values(prefillAnswersRef.current ?? {}).filter(
            v => (v ?? '').trim() !== '',
          ).length
        : 0
      const missingCount = Math.max(0, TOTAL - filledCount)
      // Greet AFTER the loader (once). Falls back to the manual greeting if the
      // CV yielded nothing usable. When pre-filled, tell the user how many
      // answers came from their CV (no "long-press" hint — that's mobile-only).
      const greeting = prefillModeRef.current
        ? `Hi ${name}! ✨ Great news — I filled in ${filledCount} of ${TOTAL} answers from your CV!${
            missingCount > 0
              ? ` Now let's cover the ${missingCount} I couldn't find — your own words here will make the summary complete.`
              : ` Just review each answer, edit if needed, and hit Next.`
          }`
        : `Hi ${name}! ✨ I'm Dan AI, your personal profile summary builder.\n\nI'll ask you ${TOTAL} quick questions to craft your personalised profile summary. Let's get started!`
      addAiMessage(greeting, () => {
        setTimeout(() => askQuestion(0), 300)
      })
    }
  }

  // "Next" accepts the pre-filled (or edited) answer and moves to the next
  // question — or, after the last one, surfaces the "Generate My Summary" step.
  const handlePrefillNext = () => {
    if (!awaitingPrefillNext) return
    setAwaitingPrefillNext(false)
    const nextIndex = currentQuestionIndex + 1
    setCurrentQuestionIndex(nextIndex)
    if (nextIndex < TOTAL) {
      setTimeout(() => askQuestion(nextIndex), 300)
    } else {
      // All answers reviewed — offer the explicit "Generate My Summary" step
      // (the button below) instead of generating immediately.
      const finalAnswers = { ...answersRef.current }
      setTimeout(() => {
        addAiMessage(
          "All set! 🎉 When you're ready, tap Generate My Summary to build your profile.",
          () => {
            setAnswersToGenerate(finalAnswers)
            setAwaitingGenerate(true)
          }
        )
      }, 300)
    }
  }

  // Final step: run the generation once the user taps "Generate My Summary".
  const handleGenerateClick = () => {
    if (!awaitingGenerate) return
    const finalAnswers = answersToGenerate ?? { ...answersRef.current }
    setAwaitingGenerate(false)
    setAnswersToGenerate(null)
    addAiMessage(
      '🚀 Analyzing your responses and crafting your personalized profile summary...',
      () => runGeneration(finalAnswers)
    )
  }

  // Send while editing a pre-filled answer → update it in place and return to
  // the [Edit] [Next] controls (does not advance).
  const handlePrefillEditSave = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    const q = questions[currentQuestionIndex]
    if (!q) return
    setMessages(prev =>
      prev.map(m =>
        m.role === 'user' && m.questionIndex === currentQuestionIndex
          ? { ...m, text: trimmed }
          : m
      )
    )
    setAnswers(prev => ({ ...prev, [q.id]: trimmed }))
    setInputValue('')
    setEditingPrefill(false)
  }

  const getValidation = (questionType: string, maxLength: number) => {
    if (questionType === 'interests') {
      return { minLength: 2, errorMessage: "Could you share a little more detail?" }
    }
    if (maxLength <= 400) {
      return { minLength: 2, errorMessage: "Please elaborate a bit more — it helps create a better summary!" }
    }
    return { minLength: 2, errorMessage: "Tell me a bit more — the details will make your summary shine!" }
  }

  const handleSend = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isAiTyping || isGenerating) return

    const currentQ = questions[currentQuestionIndex]
    if (currentQ) {
      const maxLen = parseInt(currentQ.max_length, 10) || 300
      const { minLength, errorMessage } = getValidation(currentQ.question_type, maxLen)
      const wordCount = trimmed.split(/\s+/).length
      if (wordCount < minLength) {
        setMessages(prev => [
          ...prev,
          { id: nextMsgId(), role: 'user', text: trimmed, questionIndex: currentQuestionIndex }
        ])
        setInputValue('')
        addAiMessage(errorMessage, undefined, 'validation')
        return
      }
    }

    setMessages(prev => [
      ...prev,
      { id: nextMsgId(), role: 'user', text: trimmed, questionIndex: currentQuestionIndex }
    ])
    setInputValue('')

    const activeQ = questions[currentQuestionIndex]
    if (!activeQ) return
    const newAnswers = { ...answers, [activeQ.id]: trimmed }
    setAnswers(newAnswers)

    const nextIndex = currentQuestionIndex + 1

    if (nextIndex < TOTAL) {
      setCurrentQuestionIndex(nextIndex)
      setTimeout(() => askQuestion(nextIndex), 400)
    } else {
      setCurrentQuestionIndex(nextIndex)
      // All questions answered — offer the explicit "Generate My Summary" step
      // (the button below) instead of generating immediately.
      setTimeout(() => {
        addAiMessage(
          "All set! 🎉 When you're ready, tap Generate My Summary to build your profile.",
          () => {
            setAnswersToGenerate(newAnswers)
            setAwaitingGenerate(true)
          }
        )
      }, 400)
    }
  }

  const runGeneration = async (answersToUse: Record<string, string>) => {
    setIsGenerating(true)
    setIsAiTyping(false)
    setPhase('generating') // ← show brain loader
    setHasError(false)
    setFailedAnswers(null)
    setUsedFallback(false)
    setStrengthDone(false)
    setInterestDone(false)

    try {
      if (!systemPrompts)
        throw new Error('AI prompts not loaded yet — please try again.')
      // Merge the CV's parsed education into the profile education so the
      // generated Education section reflects the CV (extra entries, grades),
      // not just the saved profile educations.
      const profileForGen: ProfileData = {
        ...resolvedProfile,
        education: mergeEducationContext(
          cvEducationRef.current,
          resolvedProfile.education ?? []
        )
      }

      // Stream the summary from the model. `onSafe` only ever receives COMPLETE
      // words (see safeStreamPrefix), so the live view never shows a half-typed
      // word. On the first chunk we switch from the loader to the result view.
      let switched = false
      const showResult = () => {
        if (switched) return
        switched = true
        setIsGenerating(false)
        setPhase('result')
        setActiveTab('strength')
        strengthStream.beginStream()
      }
      const onSafe = (safe: string) => {
        if (!safe) return
        showResult()
        strengthStream.setLiveText(safe)
      }

      let strength: string
      let fellback: boolean
      try {
        const res = await generateStream(
          profileForGen,
          questions,
          answersToUse,
          systemPrompts,
          onSafe
        )
        strength = res.strength
        fellback = res.usedFallback
      } catch (streamErr) {
        // Streaming unsupported / failed → one full (non-streamed) response plus
        // the word-safe client typewriter, so generation still succeeds.
        console.warn('[AI] streaming failed, using full response', streamErr)
        const res = await generate(
          profileForGen,
          questions,
          answersToUse,
          systemPrompts
        )
        setIsGenerating(false)
        setUsedFallback(res.usedFallback)
        setGeneratedSummary(res.strength)
        setPhase('result')
        setActiveTab('strength')
        setTimeout(() => {
          strengthStream.startStream(res.strength, () => setStrengthDone(true))
        }, 350)
        return
      }

      // Streaming finished — reveal the final, fully-cleaned text (this also
      // adds the last word that safeStreamPrefix held back mid-stream).
      if (!switched) {
        setIsGenerating(false)
        setPhase('result')
        setActiveTab('strength')
      }
      setUsedFallback(fellback)
      setGeneratedSummary(strength)
      strengthStream.setLiveText(strength)
      strengthStream.endStream()
      setStrengthDone(true)
    } catch (err) {
      console.error('[AI] All providers failed:', err)
      setIsGenerating(false)
      setPhase('chat') // ← fall back to chat to show error
      setHasError(true)
      setFailedAnswers(answersToUse)
      setMessages(prev => [
        ...prev,
        {
          id: nextMsgId(),
          role: 'ai',
          text: 'Something went wrong while generating your profile. Hit Retry to try again.'
        }
      ])
    }
  }

  const handleRetry = () => {
    if (failedAnswers) runGeneration(failedAnswers)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (editingPrefill) handlePrefillEditSave()
      else handleSend()
    }
  }

  const handleUse = async () => {
    // Auth gate (defense in depth): the save below calls the addAISummary
    // strict Server Action (add-summary).
    let authed = false
    ensureAuthed('generate your AI summary', () => {
      authed = true
    })
    if (!authed) return

    const qa_json = questions.map(q => ({
      question: q.question,
      answer: answers[q.id] ?? ''
    }))
    const ai_modal = usedFallback
      ? AI_CONFIG.fallback ?? AI_CONFIG.primary
      : AI_CONFIG.primary

    // console.log('Generated Strength:', generatedSummary)
    // console.log('qa_json:', qa_json)

    try {
      await addAISummary({
        qa_json,
        strengths_summary: generatedSummary,
        interests_summary: '',
        ai_modal
      })
      // toast.success("Profile summary saved successfully!");
    } catch (err) {
      if (isUnauthenticatedError(err)) openGate('generate your AI summary')
      console.error('[addAISummary] Failed to save summary:', err)
    }

    onSummaryGenerated({
      strength: generatedSummary,
      interest: ''
    })
    // Flow complete — drop the saved draft so the next open starts fresh.
    clearSession()
    resetState()
    onClose()
  }

  const handleClose = () => {
    if (phase === 'result' || phase === 'generating') {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  const handleCopy = (type: 'strength' | 'interest') => {
    navigator.clipboard.writeText(
      type === 'strength' ? generatedSummary : generatedInterest
    )
    setIsCopied(type)
    setTimeout(() => setIsCopied(null), 2000)
  }

  const handleRestart = () => {
    // Explicit "start over" — discard any saved draft.
    clearSession()
    resetState()
    sessionActiveRef.current = true
    addAiMessage(
      `Let's try again! I'll ask you the same ${TOTAL} questions — take your time with each answer.`,
      () => setGreetingShown(true)
    )
  }

  // ─── Edit / Delete Answer Handlers ────────────────────────────────────────

  // Simple edit: jump straight into inline editing of that answer bubble — no
  // confirmation popup. Seeds the inline textarea with the current answer.
  const handleAnswerEditRequest = (qIndex: number) => {
    const q = questions[qIndex]
    const previousAnswer = q ? answers[q.id] ?? '' : ''
    const targetMsg = messages.find(
      m => m.role === 'user' && m.questionIndex === qIndex
    )
    if (targetMsg) {
      setEditingMessageId(targetMsg.id)
      setEditingText(previousAnswer)
    }
  }

  const handleAnswerDeleteRequest = (qIndex: number) => {
    setPendingActionQuestionIndex(qIndex)
    setShowDeleteAnswerConfirm(true)
  }

  const rollbackToQuestion = (qIndex: number, prefillAnswer?: string) => {
    // Find the first user message for this question index
    const targetMsgIdx = messages.findIndex(
      m => m.role === 'user' && m.questionIndex === qIndex
    )
    if (targetMsgIdx === -1) return

    // Deleting rolls the flow back to an earlier question, so we're no longer at
    // the final step. Clear the "Generate My Summary" and pre-fill "Save & Next"
    // states so those buttons don't linger while the question is re-asked.
    setAwaitingGenerate(false)
    setAnswersToGenerate(null)
    setAwaitingPrefillNext(false)

    // Also remove the AI question message right before the user answer
    // Walk backwards from targetMsgIdx to find the preceding AI question message
    let sliceFrom = targetMsgIdx
    for (let i = targetMsgIdx - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'ai' && m.type !== 'validation') {
        sliceFrom = i
        break
      }
    }

    // Keep messages up to (but not including) the AI question for this index
    const keptMessages = messages.slice(0, sliceFrom)
    setMessages(keptMessages)

    // Remove answers from this question onward
    const newAnswers = { ...answers }
    for (let i = qIndex; i < questions.length; i++) {
      delete newAnswers[questions[i].id]
    }
    setAnswers(newAnswers)

    // Reset to this question
    setCurrentQuestionIndex(qIndex)
    setInputValue(prefillAnswer ?? '')

    // Re-ask the question after a brief delay
    setTimeout(() => askQuestion(qIndex), 300)
  }

  const saveInlineEdit = () => {
    if (!editingMessageId) return
    const trimmed = editingText.trim()
    if (!trimmed) return

    // Find the message being edited
    const msg = messages.find(m => m.id === editingMessageId)
    if (!msg || msg.questionIndex === undefined) return

    const q = questions[msg.questionIndex]
    if (!q) return

    // Validate word count
    const maxLen = parseInt(q.max_length, 10) || 300
    const { minLength } = getValidation(q.question_type, maxLen)
    const wordCount = trimmed.split(/\s+/).length
    if (wordCount < minLength) return

    // Update the message text in place
    setMessages(prev =>
      prev.map(m => m.id === editingMessageId ? { ...m, text: trimmed } : m)
    )

    // Update the answer
    setAnswers(prev => ({ ...prev, [q.id]: trimmed }))

    // Clear editing state
    setEditingMessageId(null)
    setEditingText('')
  }

  const cancelInlineEdit = () => {
    setEditingMessageId(null)
    setEditingText('')
  }

  const confirmDeleteAnswer = () => {
    if (pendingActionQuestionIndex === null) return
    const qIndex = pendingActionQuestionIndex
    setShowDeleteAnswerConfirm(false)
    setPendingActionQuestionIndex(null)
    rollbackToQuestion(qIndex)
  }

  // ─── Derived display values ────────────────────────────────────────────────
  // While streaming: show the streamed slice.
  // After done: show the editable stored value.

  const strengthDisplayValue = strengthDone
    ? generatedSummary
    : strengthStream.displayedText
  const interestDisplayValue = interestDone
    ? generatedInterest
    : interestStream.displayedText

  // The answer whose action sheet is open. The sheet quotes this answer back
  // before offering Edit / Delete, the same as the mobile app.
  const answerSheetMsg = openAnswerMenuId
    ? messages.find(m => m.id === openAnswerMenuId) ?? null
    : null

  const progress = Math.min((currentQuestionIndex / TOTAL) * 100, 100)
  const allDone = strengthDone

  if (!mounted || !visible) return null

  return createPortal(
    <>
      {/* Styles moved to ai_summary.module.css */}


      <div
        className={`sgm-overlay${!animating ? ' closing' : ''}`}
        onClick={handleClose}
      >
        <div
          className={`sgm-modal${!animating ? ' closing' : ''}${isLight ? ' light' : ''}`}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className='sgm-header'>
            <div className='sgm-header-top'>
              <div className='sgm-header-identity'>
                <div>
                  <div className='sgm-title'>Profile Summary Builder</div>
                  <div className='sgm-subtitle'>Powered by Dan AI</div>
                </div>
              </div>
              <button className='sgm-close-btn' onClick={handleClose}>
                <X size={14} />
              </button>
            </div>
            <div className='sgm-progress-wrap'>
              <div className='sgm-progress-bar'>
                <div
                  className='sgm-progress-fill'
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className='sgm-progress-label'>
                {phase === 'result'
                  ? 'Complete ✓'
                  : phase === 'generating'
                  ? 'Generating…'
                  : <span style={{ color: '#1c98f7', fontWeight: 600 }}>({Math.min(currentQuestionIndex + 1, TOTAL)} / {TOTAL})</span>}
              </span>
            </div>
          </div>

          {/* ── Messages (hidden once result phase begins, or while parsing CV) ── */}
          {phase === 'chat' && !isParsingCv && (
            <div className='sgm-messages full'>
              {messages.map(msg => (
                <div key={msg.id} className={`sgm-msg ${msg.role}`}>
                  {msg.role === 'ai' && (
                    <div className='sgm-msg-avatar'>
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width={100}
                        height={100}
                        viewBox='0 0 100 100'
                        fill='none'
                      >
                        <circle
                          cx={50}
                          cy={50}
                          r={50}
                          fill='url(#paint0_linear_3499_465)'
                        />
                        <path
                          d='M48.0128 36.8143L50.8352 43.7693C52.0151 46.678 54.322 48.9849 57.2307 50.1648L64.1857 52.9872C65.4715 53.5096 65.4715 55.3304 64.1857 55.8518L57.2307 58.6742C54.322 59.8541 52.0151 62.161 50.8352 65.0696L48.0128 72.0247C47.4904 73.3105 45.6696 73.3105 45.1482 72.0247L42.3258 65.0696C41.1459 62.161 38.839 59.8541 35.9304 58.6742L28.9753 55.8518C27.6895 55.3294 27.6895 53.5086 28.9753 52.9872L35.9304 50.1648C38.839 48.9849 41.1459 46.678 42.3258 43.7693L45.1482 36.8143C45.6696 35.5285 47.4904 35.5285 48.0128 36.8143ZM65.1461 28.647L65.9713 31.0264C66.622 32.9031 68.0969 34.378 69.9736 35.0287L72.353 35.8539C73.2311 36.1587 73.2311 37.4003 72.353 37.7051L69.9736 38.5303C68.0969 39.181 66.622 40.6559 65.9713 42.5326L65.1461 44.912C64.8413 45.7901 63.5997 45.7901 63.2949 44.912L62.4697 42.5326C61.819 40.6559 60.3441 39.181 58.4674 38.5303L56.088 37.7051C55.2099 37.4003 55.2099 36.1587 56.088 35.8539L58.4674 35.0287C60.3441 34.378 61.819 32.9031 62.4697 31.0264L63.2949 28.647C63.5987 27.7689 64.8413 27.7689 65.1461 28.647Z'
                          fill='white'
                        />
                        <defs>
                          <linearGradient
                            id='paint0_linear_3499_465'
                            x1={21}
                            y1={35}
                            x2='81.5'
                            y2='66.5'
                            gradientUnits='userSpaceOnUse'
                          >
                            <stop stopColor='#356FEE' />
                            <stop offset={1} stopColor='#1C98F7' />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  )}
                  <div className='sgm-msg-content'>
                    {/* Inline edit mode for user messages */}
                    {msg.role === 'user' && editingMessageId === msg.id ? (
                      <div className='sgm-inline-edit-wrap'>
                        <textarea
                          className='sgm-inline-edit-textarea'
                          value={editingText}
                          onChange={e => setEditingText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              saveInlineEdit()
                            }
                            if (e.key === 'Escape') cancelInlineEdit()
                          }}
                          rows={2}
                          autoFocus
                        />
                        <div className='sgm-inline-edit-actions'>
                          <button className='sgm-inline-edit-save' onClick={saveInlineEdit}>
                            <Check size={12} />
                            Save
                          </button>
                          <button className='sgm-inline-edit-cancel' onClick={cancelInlineEdit}>
                            <X size={12} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={`sgm-msg-bubble${msg.type === 'validation' ? ' sgm-msg-validation' : ''}`}>
                          {msg.text}
                          {msg.streaming && (
                            <span
                              className='sgm-stream-cursor'
                              style={{ background: '#fff' }}
                            />
                          )}
                          {msg.description && msg.role === 'ai' && !msg.type && (
                            <>
                              <div className='sgm-msg-divider' />
                              <div className='sgm-msg-description' style={{ whiteSpace: 'pre-line' }}>
                                {msg.description.replace(/\\n/g, '\n').split('\n').map((line: string, i: number) => {
                                  const trimmed = line.replace(/^•\s*/, '').trim()
                                  if (!trimmed) return null
                                  const isBullet = line.trim().startsWith('•')
                                  return isBullet
                                    ? <div key={i} style={{ display: 'flex', gap: '6px', marginTop: '2px' }}><span>•</span><span>{trimmed}</span></div>
                                    : <div key={i}>{trimmed}</div>
                                })}
                              </div>
                            </>
                          )}
                        </div>
                        {/* Three-dot trigger on each user answer — opens the
                            "Your Answer" action sheet rendered below. */}
                        {msg.role === 'user' && msg.questionIndex !== undefined && !isAiTyping && !isGenerating && !editingMessageId && !editingPrefill && !isTypingPrefill && (
                          <div className='sgm-answer-menu-wrap'>
                            <button
                              className='sgm-answer-menu-trigger'
                              title='Options'
                              aria-label='Answer options'
                              onClick={() =>
                                setOpenAnswerMenuId(
                                  openAnswerMenuId === msg.id ? null : msg.id
                                )
                              }
                            >
                              <MoreVertical size={15} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {isAiTyping && (
                <div className='sgm-typing'>
                  <div className='sgm-msg-avatar'>
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      width={100}
                      height={100}
                      viewBox='0 0 100 100'
                      fill='none'
                    >
                      <circle
                        cx={50}
                        cy={50}
                        r={50}
                        fill='url(#paint0_linear_3499_465)'
                      />
                      <path
                        d='M48.0128 36.8143L50.8352 43.7693C52.0151 46.678 54.322 48.9849 57.2307 50.1648L64.1857 52.9872C65.4715 53.5096 65.4715 55.3304 64.1857 55.8518L57.2307 58.6742C54.322 59.8541 52.0151 62.161 50.8352 65.0696L48.0128 72.0247C47.4904 73.3105 45.6696 73.3105 45.1482 72.0247L42.3258 65.0696C41.1459 62.161 38.839 59.8541 35.9304 58.6742L28.9753 55.8518C27.6895 55.3294 27.6895 53.5086 28.9753 52.9872L35.9304 50.1648C38.839 48.9849 41.1459 46.678 42.3258 43.7693L45.1482 36.8143C45.6696 35.5285 47.4904 35.5285 48.0128 36.8143ZM65.1461 28.647L65.9713 31.0264C66.622 32.9031 68.0969 34.378 69.9736 35.0287L72.353 35.8539C73.2311 36.1587 73.2311 37.4003 72.353 37.7051L69.9736 38.5303C68.0969 39.181 66.622 40.6559 65.9713 42.5326L65.1461 44.912C64.8413 45.7901 63.5997 45.7901 63.2949 44.912L62.4697 42.5326C61.819 40.6559 60.3441 39.181 58.4674 38.5303L56.088 37.7051C55.2099 37.4003 55.2099 36.1587 56.088 35.8539L58.4674 35.0287C60.3441 34.378 61.819 32.9031 62.4697 31.0264L63.2949 28.647C63.5987 27.7689 64.8413 27.7689 65.1461 28.647Z'
                        fill='white'
                      />
                      <defs>
                        <linearGradient
                          id='paint0_linear_3499_465'
                          x1={21}
                          y1={35}
                          x2='81.5'
                          y2='66.5'
                          gradientUnits='userSpaceOnUse'
                        >
                          <stop stopColor='#356FEE' />
                          <stop offset={1} stopColor='#1C98F7' />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <div className='sgm-typing-bubble'>
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── AI loader (generating phase) ── */}
          {phase === 'generating' && <AiGenLoader variant='generate' />}

          {/* ── Same loader while reading the CV (shown once, during parse) ── */}
          {phase === 'chat' && isParsingCv && <AiGenLoader variant='cv' />}

          {/* ── Fallback badge ── */}
          {/* {phase === 'result' && usedFallback && (
            <div className='sgm-fallback-badge'>
              <div className='sgm-fallback-dot' />
              Generated via backup AI ({AI_CONFIG.primary} unavailable)
            </div>
          )} */}

          {/* ══════════════════════════════════════════
               RESULT PHASE — Tabs + Streaming Content
              ══════════════════════════════════════════ */}
          {phase === 'result' && (
            <>
              {/* Single full-CV section (no tabs) */}
              <div
                className='sgm-result-panel'
                ref={resultPanelRef}
                onScroll={handleResultScroll}
              >
                {/* ── Strength tab ── */}
                {activeTab === 'strength' && (
                  <div
                    className={`sgm-result-card${
                      isEditing === 'strength' ? ' editing' : ''
                    }`}
                  >
                    <div className='sgm-result-header'>
                      <div className='sgm-result-label-group'>
                        <div className='sgm-result-icon'>
                          <Zap size={13} />
                        </div>
                        <span className='sgm-result-title'>
                          Professional Strength
                        </span>
                      </div>
                      <div className='sgm-result-meta'>
                        {strengthStream.isStreaming && (
                          <span className='sgm-streaming-badge'>
                            <span
                              className='sgm-tab-pulse'
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                display: 'inline-block',
                                background: '#3b82f6',
                                flexShrink: 0,
                                animation:
                                  'sgm-tab-pulse 0.85s ease-in-out infinite'
                              }}
                            />
                            Writing…
                          </span>
                        )}
                        {strengthDone && (
                          <>
                            <button
                              type='button'
                              onClick={() => handleCopy('strength')}
                              aria-label='Copy summary'
                              title={
                                isCopied === 'strength'
                                  ? 'Copied!'
                                  : 'Copy summary'
                              }
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px 4px',
                                borderRadius: 6,
                                fontSize: 12,
                                color:
                                  isCopied === 'strength'
                                    ? '#22c55e'
                                    : isLight
                                      ? '#64748b'
                                      : '#94a3b8',
                                transition: 'color 0.15s ease'
                              }}
                            >
                              {isCopied === 'strength' ? (
                                <Check size={13} />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                            <span className='sgm-result-word-count'>
                              {
                                generatedSummary.split(/\s+/).filter(Boolean)
                                  .length
                              }{' '}
                              words
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Streaming view */}
                    {strengthStream.isStreaming && (
                      <div className='sgm-stream-text'>
                        <div className='sgm-md-content'>
                          {renderMarkdown(strengthStream.displayedText)}
                        </div>
                        <span className='sgm-stream-cursor' />
                      </div>
                    )}

                    {/* Read-only view (after done, not editing) */}
                    {!strengthStream.isStreaming &&
                      strengthDone &&
                      isEditing !== 'strength' && (
                        <div className='sgm-md-content'>
                          {renderMarkdown(generatedSummary)}
                        </div>
                      )}

                    {/* Editable view (editing mode) — clean, non-markdown text */}
                    {!strengthStream.isStreaming &&
                      strengthDone &&
                      isEditing === 'strength' && (
                        <textarea
                          className='sgm-result-textarea editing'
                          value={editDraft}
                          onChange={e => setEditDraft(e.target.value)}
                          rows={8}
                        />
                      )}

                    {/* Not started yet (edge case) */}
                    {!strengthStream.isStreaming && !strengthDone && (
                      <div className='sgm-waiting-state'>
                        <TypingDots />
                        <span>Preparing…</span>
                      </div>
                    )}

                    <div className='sgm-result-card-footer'>
                      <button
                        className={`sgm-btn-edit${
                          isEditing === 'strength' ? ' active' : ''
                        }`}
                        disabled={!strengthDone}
                        onClick={() => {
                          if (isEditing === 'strength') {
                            // Save: commit the edited plain text as the summary.
                            const trimmed = editDraft.trim()
                            if (trimmed) setGeneratedSummary(trimmed)
                            setIsEditing(null)
                          } else {
                            // Edit: seed the box with a clean, non-markdown copy.
                            setEditDraft(stripMarkdown(generatedSummary))
                            setIsEditing('strength')
                          }
                        }}
                      >
                        {isEditing === 'strength' ? (
                          <>
                            <Save size={11} />
                            Save
                          </>
                        ) : (
                          <>
                            <Pencil size={11} />
                            Edit
                          </>
                        )}
                      </button>
                      {/* <button
                        className="sgm-btn-copy"
                        disabled={!strengthDone}
                        onClick={() => handleCopy("strength")}
                      >
                        {isCopied === "strength" ? (
                          <>
                            <Check size={11} />
                            Copied!
                          </>
                        ) : (
                          "Copy"
                        )}
                      </button> */}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className='sgm-result-footer'>
                <button
                  className='sgm-btn-use'
                  onClick={handleUse}
                  disabled={!allDone}
                >
                  <Check size={13} />
                  {allDone ? 'Use Summary' : 'Generating…'}
                </button>
              </div>
            </>
          )}

          {/* ── Error + Retry ── */}
          {phase === 'chat' && hasError && (
            <div className='sgm-error-area'>
              <div className='sgm-error-banner'>
                <div className='sgm-error-dot' />
                AI generation failed. Your answers are saved — no need to start
                over.
              </div>
              <button className='sgm-btn-retry' onClick={handleRetry}>
                <RotateCcw size={14} />
                Retry Generation
              </button>
            </div>
          )}

          {/* ── Pre-fill review: full-width Save & Next (CV mode only). Editing an
               answer now happens via each bubble's three-dot menu. ── */}
          {phase === 'chat' && !hasError && awaitingPrefillNext && !editingPrefill && !editingMessageId && (
            <div
              className='sgm-input-area'
              style={{ justifyContent: 'center' }}
            >
              <button
                onClick={handlePrefillNext}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  maxWidth: 440,
                  padding: '13px 22px',
                  borderRadius: 24,
                  cursor: 'pointer',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  background:
                    'linear-gradient(91.13deg, #5433ff 2.22%, #20bdff 97.08%)',
                  boxShadow: '0 6px 18px rgba(84,51,255,0.3)',
                  transition: 'all 0.15s ease'
                }}
              >
                Save &amp; Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* ── Final step: explicit "Generate My Summary" button (both flows) ── */}
          {phase === 'chat' && !hasError && awaitingGenerate && !isAiTyping && (
            <div
              className='sgm-input-area'
              style={{ justifyContent: 'center' }}
            >
              <button
                onClick={handleGenerateClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 28px',
                  borderRadius: 24,
                  cursor: 'pointer',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  background:
                    'linear-gradient(91.13deg, #5433ff 2.22%, #20bdff 97.08%)',
                  boxShadow: '0 6px 18px rgba(84,51,255,0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Sparkles size={15} />
                Generate My Summary
              </button>
            </div>
          )}

          {/* ── Chat input (also used to edit a pre-filled answer) ── */}
          {phase === 'chat' &&
            !hasError &&
            !isParsingCv &&
            !isTypingPrefill &&
            !awaitingGenerate &&
            (!awaitingPrefillNext || editingPrefill) && (
            <div className='sgm-input-area'>
              {/* {currentQuestionIndex < TOTAL && !isAiTyping && (
                <div className="sgm-input-hint">
                  <ChevronRight size={10} />
                  {questions[currentQuestionIndex]?.placeholder}
                </div>
              )} */}
              <div className='sgm-input-row'>
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  className='sgm-input'
                  value={inputValue}
                  onChange={e => {
                    const maxLen = parseInt(questions[currentQuestionIndex]?.max_length, 10) || 300
                    const val = e.target.value.length > maxLen ? e.target.value.slice(0, maxLen) : e.target.value
                    setInputValue(val)
                    const el = e.target
                    el.style.height = 'auto'
                    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
                    const maxHeight = lineHeight * 2
                    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
                    el.style.overflowY =
                      el.scrollHeight > maxHeight ? 'auto' : 'hidden'
                  }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder={(() => {
                    if (isAiTyping || isGenerating) return 'AI is thinking...'
                    const raw = questions[currentQuestionIndex]?.placeholder || 'Type your answer...'
                    return raw.length > 50 ? raw.slice(0, 50) + '…' : raw
                  })()}
                  disabled={isAiTyping || isGenerating}
                />
              </div>
              <button
                className='sgm-send-btn'
                onClick={editingPrefill ? handlePrefillEditSave : handleSend}
                disabled={!inputValue.trim() || isAiTyping || isGenerating}
              >
                <SendHorizontal size={14} />
              </button>
            </div>
          )}

          {/* ── "Your Answer" action sheet ──
              Mirrors the mobile app: instead of a dropdown pinned to the
              bubble, a centered card layers over the chat, quotes the answer
              back, and offers Edit / Delete & Retype / Cancel. */}
          {answerSheetMsg && (
            <div
              className='sgm-answer-sheet-overlay'
              onClick={() => setOpenAnswerMenuId(null)}
            >
              <div
                className='sgm-answer-sheet'
                role='dialog'
                aria-modal='true'
                aria-label='Your answer'
                onClick={e => e.stopPropagation()}
              >
                <div className='sgm-answer-sheet-icon'>
                  <PenLine size={20} />
                </div>
                <div className='sgm-answer-sheet-title'>Your Answer</div>
                <div className='sgm-answer-sheet-quote'>
                  &ldquo;{answerSheetMsg.text}&rdquo;
                </div>
                <button
                  className='sgm-answer-sheet-btn primary'
                  onClick={() => {
                    setOpenAnswerMenuId(null)
                    handleAnswerEditRequest(answerSheetMsg.questionIndex!)
                  }}
                >
                  <PenLine size={15} />
                  Edit Answer
                </button>
                <button
                  className='sgm-answer-sheet-btn danger'
                  onClick={() => {
                    setOpenAnswerMenuId(null)
                    handleAnswerDeleteRequest(answerSheetMsg.questionIndex!)
                  }}
                >
                  <Trash2 size={15} />
                  Delete &amp; Retype
                </button>
                <button
                  className='sgm-answer-sheet-btn neutral'
                  onClick={() => setOpenAnswerMenuId(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={showCloseConfirm}
        icon={<TriangleAlert />}
        iconVariant="warning"
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={() => {
          setShowCloseConfirm(false)
          resetState()
          onClose()
        }}
        title='Profile Summary Not Saved'
        message={`Your profile summary hasn't been saved to your profile. Close anyway?`}
        confirmText='Discard'
        cancelText='Close'
      />
      <ConfirmModal
        isOpen={showRegenerateConfirm}
        icon={<RefreshCw />}
        iconVariant="warning"
        onClose={() => setShowRegenerateConfirm(false)}
        onConfirm={() => {
          setShowRegenerateConfirm(false)
          handleRestart()
        }}
        title='Regenerate Profile Summary with Dan AI?'
        message={
          willPrefillFromCv
            ? `This will restart all ${TOTAL} questions — and since you've uploaded a CV, Dan AI will pre-fill your answers from it.`
            : `This will restart all ${TOTAL} questions. Continue?`
        }
        confirmText='Continue'
        cancelText='Cancel'
      />
      <ConfirmModal
        isOpen={showDeleteAnswerConfirm}
        icon={<Trash2 />}
        iconVariant="danger"
        onClose={() => {
          setShowDeleteAnswerConfirm(false)
          setPendingActionQuestionIndex(null)
        }}
        onConfirm={confirmDeleteAnswer}
        title='Delete Answer?'
        message={
          pendingActionQuestionIndex !== null
            ? `This will delete your answer for question ${pendingActionQuestionIndex + 1} and all answers after it. You'll restart from that question.`
            : ''
        }
        confirmText='Delete'
        cancelText='Cancel'
      />
      {authGateModal}
    </>,
    document.body
  )
}