// One-at-a-time gate for floating prompts: the install pop, the push
// priming card and the update card. Whoever claims the slot shows;
// everyone else waits and is woken when the slot frees. The bottom
// of the screen never stacks two asks on top of each other.

type Listener = () => void

let holder: string | null = null
const listeners = new Set<Listener>()

export function claimPrompt(name: string): boolean {
  if (holder === name) return true
  if (holder !== null) return false
  holder = name
  return true
}

export function releasePrompt(name: string): void {
  if (holder !== name) return
  holder = null
  listeners.forEach((fn) => {
    try {
      fn()
    } catch { /* a listener must never break the gate */ }
  })
}

export function onPromptFree(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
