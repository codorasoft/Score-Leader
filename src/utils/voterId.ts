interface Storage { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }

const KEY = 'scoreleader.voter'

// One vote per phone: a random id made the first time this browser opens a vote, and kept. Nothing
// about the device goes into it; an id worked out from the model, screen and language is the same on
// two phones of one model, and the second voter was told they had already voted.
export function getVoterId(storage: Storage = localStorage): string {
  try {
    const saved = storage.getItem(KEY)
    if (saved) return saved
  } catch { /* storage blocked: fall through to a new id */ }
  const id = crypto.randomUUID()
  try { storage.setItem(KEY, id) } catch { /* storage full or blocked: this visit can still vote */ }
  return id
}
