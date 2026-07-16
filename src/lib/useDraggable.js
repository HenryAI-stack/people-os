import { useCallback, useRef, useState } from 'react'

/**
 * Makes a modal draggable by its title bar.
 * Returns { modalStyle, dragHandleProps }
 * Apply dragHandleProps to the drag handle and modalStyle to the modal element.
 */
export function useDraggable() {
  const [pos, setPos]   = useState({ x: 0, y: 0 })
  const dragging        = useRef(false)
  const start           = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    dragging.current = true
    start.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }

    function onMove(ev) {
      if (!dragging.current) return
      setPos({
        x: start.current.px + ev.clientX - start.current.mx,
        y: start.current.py + ev.clientY - start.current.my,
      })
    }
    function onUp() {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }, [pos])

  return {
    modalStyle: { transform: `translate(${pos.x}px, ${pos.y}px)` },
    dragHandleProps: { onMouseDown, style: { cursor: 'grab', userSelect: 'none' } },
  }
}
