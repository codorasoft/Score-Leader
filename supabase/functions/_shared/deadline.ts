// A cancel for work that must not outlive its caller or a time limit: aborted when `caller` is
// (the browser closed the request) or after `ms`, whichever comes first. Call done() when the work
// is over, so nothing is left running.
export function deadline(caller: AbortSignal, ms: number) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, ms)
  const onCallerGone = () => controller.abort()
  if (caller.aborted) controller.abort()
  else caller.addEventListener('abort', onCallerGone, { once: true })
  return {
    signal: controller.signal,
    // Why the work was cancelled, or null while it was not
    reason: (): 'timeout' | 'cancelled' | null => (controller.signal.aborted ? (timedOut ? 'timeout' : 'cancelled') : null),
    done: () => {
      clearTimeout(timer)
      caller.removeEventListener('abort', onCallerGone)
    },
  }
}
