import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Artwork, Loading } from '../components/ui.jsx'
import { IconAlert, IconChevron, IconExternal, IconLink, IconPlay } from '../components/Icons.jsx'
import { api } from '../lib/api.js'
import { useLibrary, useToast } from '../context/LibraryContext.jsx'

/**
 * TikTok link → playable post.
 *
 * Deliberately no download button: TikTok exposes no public file URL, and the
 * "direct mp4" pattern used in demos (`api.tiktok.com/aweme/v1/play?...`) is not a
 * real endpoint. Playback goes through TikTok's own embed.
 */
export default function TikTokLink() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState({ loading: false, error: null, data: null })
  const { toast } = useToast()
  const { toggleSavedVideo, savedVideoIds } = useLibrary()

  const submit = async (event) => {
    event.preventDefault()
    if (state.loading) return
    const value = url.trim()
    if (!value) {
      setState({ loading: false, error: 'Paste a TikTok link first.', data: null })
      return
    }
    setState({ loading: true, error: null, data: null })
    try {
      const data = await api.tiktok(value)
      setState({ loading: false, error: null, data })
    } catch (err) {
      setState({ loading: false, error: err.message, data: null })
    }
  }

  const onPaste = (event) => {
    const text = event.clipboardData?.getData('text') || ''
    if (!/tiktok\.com/i.test(text)) return
    event.preventDefault()
    setUrl(text)
    // Paste is a clear intent, so resolve immediately instead of asking for a tap.
    setState({ loading: true, error: null, data: null })
    api
      .tiktok(text)
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((err) => setState({ loading: false, error: err.message, data: null }))
  }

  const clear = () => {
    setUrl('')
    setState({ loading: false, error: null, data: null })
  }

  return (
    <>
      <div className="row gap-8" style={{ marginBottom: 8 }}>
        <IconLink size={18} />
        <span className="eyebrow">Tool</span>
      </div>
      <h1>TikTok link to video</h1>
      <p className="small muted" style={{ marginTop: 6, marginBottom: 18 }}>
        Paste a public TikTok link — including <code>vm.</code> and <code>vt.</code> short links — and it plays here in
        TikTok&rsquo;s own player.
      </p>

      <form onSubmit={submit}>
        <div className="search-field">
          <IconLink size={17} className="mute" />
          <input
            type="url"
            inputMode="url"
            className="input"
            placeholder="https://www.tiktok.com/@user/video/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onPaste={onPaste}
            spellCheck="false"
            autoComplete="off"
            aria-label="TikTok video link"
          />
          {url && (
            <button type="button" className="icon-btn ghost" aria-label="Clear" onClick={clear}>
              ✕
            </button>
          )}
        </div>
        <div className="row gap-8" style={{ marginTop: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={state.loading}>
            {state.loading ? 'Resolving…' : 'Load video'}
          </button>
          <button type="button" className="btn" onClick={clear} disabled={state.loading}>
            Clear
          </button>
        </div>
      </form>

      {state.error && (
        <div className="notice notice-err" style={{ marginTop: 16 }} role="alert">
          <IconAlert size={16} />
          <div>{state.error}</div>
        </div>
      )}

      {state.loading && <Loading label="Reading the link" />}

      {state.data && (
        <section style={{ marginTop: 20 }}>
          <div className="card" style={{ padding: 14 }}>
            <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
              {state.data.thumbnail ? (
                <Artwork src={state.data.thumbnail} alt="" style={{ width: 56, height: 56, borderRadius: 12 }} />
              ) : null}
              <div className="grow">
                <strong style={{ display: 'block', fontSize: 15, lineHeight: 1.3 }}>
                  {state.data.title || 'TikTok post'}
                </strong>
                <span className="tiny mute">
                  {state.data.author || 'Unknown creator'} · id {state.data.videoId}
                </span>
              </div>
            </div>

            <div className="tt-frame">
              <iframe
                src={state.data.embedUrl}
                title={`TikTok ${state.data.videoId}`}
                allow="encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>

            <div className="row gap-8 wrap" style={{ marginTop: 12 }}>
              <a className="chip" href={state.data.shareUrl} target="_blank" rel="noreferrer noopener">
                Open on TikTok <IconExternal size={12} />
              </a>
              <button
                type="button"
                className="chip"
                aria-pressed={savedVideoIds.has(`tt-${state.data.videoId}`)}
                onClick={() =>
                  toggleSavedVideo({
                    videoId: `tt-${state.data.videoId}`,
                    title: state.data.title || 'TikTok post',
                    channel: state.data.author || 'TikTok',
                    thumbnail: state.data.thumbnail,
                    watchUrl: state.data.shareUrl,
                    kind: 'tiktok',
                    source: 'tiktok',
                  })
                }
              >
                {savedVideoIds.has(`tt-${state.data.videoId}`) ? 'Saved' : 'Save to library'}
              </button>
              <button
                type="button"
                className="chip"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.data.shareUrl)
                    toast('Link copied', { message: state.data.shareUrl, type: 'ok' })
                  } catch {
                    toast('Copy failed', { message: 'Select the link and copy it manually.', type: 'err' })
                  }
                }}
              >
                Copy link
              </button>
            </div>

            {state.data.partial && (
              <p className="tiny mute" style={{ marginTop: 10 }}>
                Caption and author came back empty (TikTok oEmbed: {state.data.metadataError || 'no response'}). The
                video itself is unaffected.
              </p>
            )}
            <p className="tiny mute" style={{ marginTop: 8 }}>
              Playback is TikTok&rsquo;s official embed. TikTok publishes no public file URL, so there is no download
              button here — a “direct mp4” link would simply be dead.
            </p>
          </div>

          <Link to="/videos" className="row gap-6 small mute" style={{ marginTop: 16 }}>
            <IconPlay size={14} /> Browse videos <IconChevron size={14} />
          </Link>
        </section>
      )}
    </>
  )
}
