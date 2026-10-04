export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// Messenger cannot be pre-filled through a link, so phones use the share sheet (pick Messenger
// there); desktops get the text copied and messenger.com opened to paste it.
export async function shareToMessenger(text: string): Promise<'shared' | 'cancelled' | 'copied' | 'failed'> {
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch {
      return 'cancelled'
    }
  }
  if (!(await copyText(text))) return 'failed'
  window.open('https://www.messenger.com/', '_blank', 'noopener')
  return 'copied'
}
