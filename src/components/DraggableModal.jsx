import { useCallback, useRef, useState } from 'react'

/**
 * Drop-in replacement for the overlay+modal pattern.
 * The <h2> title bar is the drag handle.
 *
 * Usage:
 *   <DraggableModal title="Edit record" onClose={onCancel} maxWidth={520}>
 *     <form onSubmit={submit}>
 *       ... fields ...
 *     </form>
 *   </DraggableModal>
 */
export function DraggableModal({ title, onClose, children, maxWidth = 520 }) {
  const [pos, setPos]  = useState({ x: 0, y: 0 })
  const dragging       = useRef(false)
  const start          = useRef({})

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

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="modal"
        style={{ maxWidth, transform: `translate(${pos.x}px, ${pos.y}px)` }}
      >
        <h2
          onMouseDown={onMouseDown}
          style={{ cursor: 'grab', userSelect: 'none', marginBottom: 18 }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
