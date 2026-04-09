import { useEffect, useState } from 'react'

interface CursorHintProps {
  hoveredType: 'sphere' | 'star' | null
}

export function CursorHint({ hoveredType }: CursorHintProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY })
      setVisible(true)
    }
    const leave = () => setVisible(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseleave', leave)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseleave', leave)
    }
  }, [])

  const label =
    hoveredType === 'sphere' ? 'leave a memory' :
    hoveredType === 'star'   ? 'read their story' :
    null

  if (!visible || !label) return null

  return (
    <div style={{
      position: 'fixed',
      left: pos.x + 16,
      top: pos.y - 8,
      zIndex: 9999,
      pointerEvents: 'none',
      fontFamily: "'Cormorant', Georgia, serif",
      fontStyle: 'italic',
      fontSize: '11px',
      letterSpacing: '0.14em',
      color: hoveredType === 'sphere'
        ? 'rgba(245,197,24,1)'
        : 'rgba(220,200,255,1)',
      whiteSpace: 'nowrap',
      transition: 'opacity 0.2s ease',
      opacity: visible ? 1 : 0,
      textShadow: hoveredType === 'sphere'
        ? '0 0 12px rgba(245,197,24,0.6), 0 1px 3px rgba(0,0,0,0.9)'
        : '0 0 12px rgba(196,174,244,0.5), 0 1px 3px rgba(0,0,0,0.9)',
    }}>
      {label}
    </div>
  )
}
