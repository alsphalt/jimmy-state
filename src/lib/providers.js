import { api } from './api.js'

/**
 * Provider availability, fetched once per session.
 *
 * Every optional source is asked for over the network, so a provider that is not
 * configured would otherwise answer 503 on each keystroke and log a console error.
 */
let pending = null

export function providerStatus() {
  if (!pending) {
    pending = api
      .providers()
      .then((data) => data?.providers || {})
      .catch(() => ({}))
  }
  return pending
}

export async function hasFullTracks() {
  const providers = await providerStatus()
  return Boolean(providers?.epidemic?.configured)
}
