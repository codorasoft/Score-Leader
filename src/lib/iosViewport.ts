// An iPhone running the app from its Home Screen icon can get stuck with a shorter screen than
// it has: after the keyboard closes (and sometimes after coming back from another app), the
// browser keeps measuring the screen at its smaller size, so the bottom tab bar floats in the
// middle of the screen with the page showing underneath it. It stays that way until the app is
// closed. Hiding the app for a moment and showing it again makes the browser measure the screen
// again, which puts the bar back on the bottom edge.

// The tallest screen seen at each width: a turn of the phone changes both, and is no fault
const tallest = new Map<number, number>()
// Up to a few pixels of difference is the browser rounding, not a stuck screen
const SLACK = 4

const typing = () => {
  const el = document.activeElement
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

function note() {
  const width = window.innerWidth
  tallest.set(width, Math.max(tallest.get(width) ?? 0, window.innerHeight))
}

/** Measures the screen again when it is shorter than it was at this width; true when it did */
export function remeasure(root: HTMLElement): boolean {
  note()
  const best = tallest.get(window.innerWidth) ?? 0
  // While the keyboard is open the screen is meant to be shorter
  if (typing() || best - window.innerHeight <= SLACK) return false
  const top = window.scrollY
  root.style.display = 'none'
  void root.offsetHeight
  root.style.display = ''
  window.scrollTo(0, top)
  note()
  return true
}

const standalone = () =>
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
  window.matchMedia?.('(display-mode: standalone)').matches === true

/** Watches for the stuck screen; only in the app opened from an iPhone's Home Screen */
export function keepFullScreen(root: HTMLElement, isStandalone = standalone()) {
  if (!isStandalone || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return () => {}
  note()
  // Wait for the keyboard to finish closing before measuring
  let timer: ReturnType<typeof setTimeout> | undefined
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => remeasure(root), 300)
  }
  const back = () => { if (document.visibilityState === 'visible') later() }
  window.addEventListener('resize', note)
  document.addEventListener('focusout', later)
  document.addEventListener('visibilitychange', back)
  window.addEventListener('pageshow', later)
  return () => {
    clearTimeout(timer)
    window.removeEventListener('resize', note)
    document.removeEventListener('focusout', later)
    document.removeEventListener('visibilitychange', back)
    window.removeEventListener('pageshow', later)
  }
}

/** For tests: forget the screen sizes seen */
export function resetForTests() {
  tallest.clear()
}
