/**
 * Local / container entry point.
 *
 * The Express app itself lives in app.js so it can also be mounted as a serverless
 * function (see api/[...route].js for the Vercel deployment). Importing app.js has no
 * side effects — it never binds a port — which is what makes both targets possible.
 */
import app, { PORT, startupSummary } from './app.js'

const listener = app.listen(PORT, () => {
  console.log(`JIMMY STATE api on http://localhost:${PORT}`)
  startupSummary().forEach((line) => console.log(line))
})

listener.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[jimmy-state] port ${PORT} is already in use — another copy of the API is probably running.\n` +
        `Stop it (ps -eo pid,args | grep "[s]erver/index.js") or start this one with PORT=3002.`,
    )
    process.exit(1)
  }
  throw err
})

export default app
