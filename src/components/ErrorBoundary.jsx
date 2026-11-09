import { Component } from 'react'
import { Link } from 'react-router-dom'

/**
 * Route-level error boundary.
 *
 * Without one, any render error unmounts the entire React tree — the app's chrome
 * disappears and the user is left looking at the page background, which on this theme
 * is pure black. That is what "the artist page turns black" looks like, and it is
 * indistinguishable from a device fault.
 *
 * This keeps the failure inside the content area, says what happened, and offers a way
 * out (retry the render, reload the document, go home). It also logs to the console so
 * a real cause can be read off a device over USB.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.reset = this.reset.bind(this)
    this.reload = this.reload.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep the stack available without shipping it to a server.
    console.error('[jimmy-state] render error', error, info?.componentStack)
  }

  reset() {
    this.setState({ error: null })
  }

  reload() {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="error-screen" role="alert">
        <span className="eyebrow">Something broke on this screen</span>
        <h1>That page could not be shown</h1>
        <p>
          The rest of the app is fine — nothing was lost. Reloading usually clears it; if it keeps happening, the
          message below is what to report.
        </p>
        <pre className="error-detail">{String(error?.message || error).slice(0, 300)}</pre>
        <div className="row wrap gap-8">
          <button type="button" className="btn btn-primary btn-sm" onClick={this.reload}>
            Reload
          </button>
          <button type="button" className="btn btn-sm" onClick={this.reset}>
            Try again
          </button>
          <Link to="/" className="btn btn-sm" onClick={this.reset}>
            Go home
          </Link>
        </div>
      </div>
    )
  }
}
