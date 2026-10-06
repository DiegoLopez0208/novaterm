import { useEffect, useRef } from 'react'

/** Contain keyboard focus in an overlay and restore the previous control. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controls = () => Array.from(root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    )).filter((element) => element.getClientRects().length > 0)
    ;(controls()[0] ?? root).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); close.current()
      }
      if (event.key !== 'Tab') return
      const items = controls()
      const first = items[0] ?? root
      const last = items.at(-1) ?? root
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    // A view switch can remove the focused button. Handle Escape and Tab even
    // when the browser temporarily returns focus to the document body.
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  return ref
}
