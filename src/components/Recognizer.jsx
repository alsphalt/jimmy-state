import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LogoD from './LogoD.jsx'
import { IconAlert, IconMic, IconX } from './Icons.jsx'
import { MicRecorder, RECOGNITION_LIMITS } from '../lib/recorder.js'
import { api } from '../lib/api.js'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'

const BAR_COUNT = 32
const AUTO_STOP_SECONDS = 10

export default function Recognizer({ hero = false }) {
  const navigate = useNavigate()
  const { addIdentification } = useLibrary()
  const { toast } = useToast()

  const [phase, setPhase] = useState('idle') // idle | starting | listening | processing | error
  const [status, setStatus] = useState('')
  const [detail, setDetail] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState(() => new Array(BAR_COUNT).fill(0.12))

  const recorderRef = useRef(null)
  const abortRef = useRef(null)
  const lastPaint = useRef(0)
  const autoStop = useRef(false)

  useEffect(
    () => () => {
      recorderRef.current?.cancel()
      abortRef.current?.abort()
    },
    [],
  )

  const reset = useCallback(() => {
    setPhase('idle')
    setStatus('')
    setDetail('')
    setElapsed(0)
    setLevels(new Array(BAR_COUNT).fill(0.12))
  }, [])

  const submit = useCallback(
    async (blob, seconds, rms) => {
      setPhase('processing')
      setStatus('Matching your sample…')
      setDetail('Holding the fingerprint against the ACRCloud catalogue.')

      if (rms < 0.004) {
        setPhase('error')
        setStatus('That was almost silent.')
        setDetail('Turn the volume up or move closer to the speaker, then try again.')
        return
      }

      const controller = new AbortController()
      abortRef.current = controller
      const timer = setTimeout(() => controller.abort(), 25000)

      try {
        const data = await api.recognize(blob)
        clearTimeout(timer)
        if (!data.matched || !data.results?.exact) {
          setPhase('error')
          setStatus('No match found.')
          setDetail(data.error || 'Nothing in the catalogue matched that sample. Try again with a clearer section of the song.')
          return
        }
        const record = await addIdentification(data.results)
        toast(`Matched in ${Math.round(seconds)}s of audio`, {
          title: data.results.exact.title,
          message: `${data.results.total} result${data.results.total === 1 ? '' : 's'} · verified match saved to your library`,
          type: 'ok',
          ttl: 5000,
        })
        reset()
        navigate(`/results/${record.id}`, { state: { fresh: true } })
      } catch (err) {
        clearTimeout(timer)
        setPhase('error')
        if (err.code === 'OFFLINE') {
          setStatus('You are offline.')
          setDetail('Recognition needs a connection. Your library still works offline.')
        } else if (err.code === 'RATE_LIMITED') {
          setStatus('Slow down a moment.')
          setDetail(err.message)
        } else if (err.code === 'RECOGNITION_NOT_CONFIGURED') {
          setStatus('Recognition is not configured.')
          setDetail(err.message)
        } else {
          setStatus('Recognition failed.')
          setDetail(err.message || 'The recognition service could not be reached.')
        }
      } finally {
        abortRef.current = null
      }
    },
    [addIdentification, navigate, reset, toast],
  )

  const stopAndIdentify = useCallback(
    async (auto = false) => {
      const rec = recorderRef.current
      if (!rec?.recording) return
      let result
      try {
        result = rec.stop()
      } catch {
        reset()
        return
      }
      setLevels(new Array(BAR_COUNT).fill(0.12))
      setElapsed(0)

      if (result.seconds < 3 && !auto) {
        setPhase('error')
        setStatus('Too short.')
        setDetail('Record at least 3 seconds — 8 to 10 seconds gives the best chance of a match.')
        return
      }
      await submit(result.blob, result.seconds, result.rms)
    },
    [reset, submit],
  )

  const start = useCallback(async () => {
    if (phase === 'starting' || phase === 'listening' || phase === 'processing') return
    reset()
    setPhase('starting')
    setStatus('Asking for the microphone…')
    setDetail('Audio is used only for this match and is never stored on the server.')

    const rec = new MicRecorder()
    recorderRef.current = rec
    rec.onMaxDuration = () => {
      if (!autoStop.current) {
        autoStop.current = true
        stopAndIdentify(true)
      }
    }

    try {
      await rec.start((level, seconds) => {
        const now = performance.now()
        if (now - lastPaint.current < 90) return
        lastPaint.current = now
        setLevels((prev) => {
          const next = prev.slice(1)
          next.push(Math.max(0.08, Math.min(1, level)))
          return next
        })
        setElapsed(seconds)
        if (seconds >= AUTO_STOP_SECONDS && !autoStop.current) {
          autoStop.current = true
          stopAndIdentify(true)
        }
      })
      setPhase('listening')
      setStatus('Listening…')
      setDetail('Play the music near your phone. It stops on its own after 10 seconds.')
    } catch (err) {
      rec.cancel()
      recorderRef.current = null
      setPhase('error')
      setStatus(err.code === 'MIC_DENIED' ? 'Microphone blocked.' : 'Microphone unavailable.')
      setDetail(err.message)
    }
  }, [phase, reset, stopAndIdentify])

  const cancel = useCallback(() => {
    autoStop.current = false
    recorderRef.current?.cancel()
    recorderRef.current = null
    abortRef.current?.abort()
    abortRef.current = null
    reset()
    setStatus('Cancelled.')
  }, [reset])

  const listening = phase === 'listening'
  const processing = phase === 'processing'
  const busy = phase === 'starting' || listening || processing

  return (
    <div className={`recognizer ${hero ? 'hero' : ''}`}>
      <div className={`d-stage ${listening ? 'is-listening' : ''} ${processing ? 'is-processing' : ''}`}>
        <div className="d-rings" aria-hidden="true">
          <span className="d-ring" />
          <span className="d-ring" />
          <span className="d-ring" />
          <span className="d-ring" />
        </div>
        <button
          type="button"
          className="d-button"
          onClick={listening ? () => stopAndIdentify(false) : start}
          disabled={processing}
          aria-label={listening ? 'Stop and identify' : 'Identify a song'}
          aria-describedby="rec-status"
        >
          <LogoD size={78} glow={false} />
        </button>
      </div>

      <div className="wave" aria-hidden="true">
        {levels.map((l, i) => (
          <i
            key={i}
            style={{
              height: listening || processing ? `${6 + l * 24}px` : '6px',
              opacity: listening ? 0.9 : 0.35,
            }}
            className={listening || processing ? '' : 'is-idle'}
          />
        ))}
      </div>

      <div className="rec-status" id="rec-status" aria-live="polite">
        {phase === 'idle' && (
          <>
            <strong>Identify Any Song</strong>
            <p>Tap the D and hold your phone near the music. We listen for 10 seconds.</p>
          </>
        )}
        {phase === 'starting' && (
          <>
            <strong>Microphone…</strong>
            <p>Allow microphone access when your browser asks.</p>
          </>
        )}
        {listening && (
          <>
            <strong>Listening…</strong>
            <p>{detail}</p>
            <span className="rec-timer">{elapsed.toFixed(1)}s / {AUTO_STOP_SECONDS}s</span>
          </>
        )}
        {processing && (
          <>
            <strong className="row gap-8" style={{ justifyContent: 'center' }}>
              <span className="spinner" /> Matching…
            </strong>
            <p>{detail}</p>
          </>
        )}
        {phase === 'error' && (
          <>
            <strong style={{ color: '#ffb3ba' }}>{status}</strong>
            <p>{detail}</p>
          </>
        )}
      </div>

      {busy && (
        <div className="row gap-8">
          {listening && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => stopAndIdentify(false)}>
              <IconMic size={15} /> Stop &amp; identify
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={cancel}>
            <IconX size={15} /> Cancel
          </button>
        </div>
      )}

      {phase === 'error' && (
        <button type="button" className="btn btn-sm" onClick={start}>
          <IconAlert size={15} /> Try again
        </button>
      )}

      {phase === 'idle' && (
        <p className="tiny mute" style={{ textAlign: 'center', maxWidth: '36ch' }}>
          Microphone access is requested only while identifying. The sample goes to ACRCloud for matching and is not
          stored. Minimum {RECOGNITION_LIMITS.minSeconds}s, maximum {AUTO_STOP_SECONDS}s.
        </p>
      )}
    </div>
  )
}
