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
/**
 * Drag-by-handle behaviour shared by DraggableModal and WorldMapModal.
 * Spread `handleProps` on the handle and apply `style` (a translate) to the moving element.
 * Mousedowns on buttons inside the handle (e.g. a close ×) are ignored so they still click.
 */
export function useDraggable() {
  const [pos, setPos]  = useState({ x: 0, y: 0 })
  const dragging       = useRef(false)
  const start          = useRef({})

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0 || e.target.closest('button')) return
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
    handleProps: { onMouseDown, style: { cursor: 'grab', userSelect: 'none' } },
    style: { transform: `translate(${pos.x}px, ${pos.y}px)` },
  }
}

export function DraggableModal({ title, onClose, children, maxWidth = 520 }) {
  const { handleProps, style } = useDraggable()

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="modal"
        style={{ maxWidth, ...style }}
      >
        <h2
          onMouseDown={handleProps.onMouseDown}
          style={{ ...handleProps.style, marginBottom: 18 }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
