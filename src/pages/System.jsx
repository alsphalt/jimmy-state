import { useEffect } from 'react'
import { IconTube } from '../components/Icons.jsx'

/**
 * The System tool is a complete document at /tools/system.html — its own header, theme
 * and scripts. It used to be framed inside this page, which put JIMMY STATE's logo,
 * settings icon and bottom tabs around a tool that already has its own chrome.
 *
 * So this route no longer renders anything: it replaces itself with the document.
 * `replace` matters — it keeps this bounce out of history, so the tool's Back button
 * lands on whatever the user came from instead of looping into the redirect.
 */
export default function System() {
  useEffect(() => {
    window.location.replace('/tools/system.html')
  }, [])

  return (
    <div className="sys-boot" role="status" aria-live="polite">
      <IconTube size={26} />
      <span>Opening System…</span>
    </div>
  )
}
