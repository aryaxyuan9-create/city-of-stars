import { useEffect, useState } from 'react'

export function NYCClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const t = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const d = now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      setTime(t)
      setDate(d)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      position: 'fixed',
      bottom: '28px',
      right: '28px',
      zIndex: 10,
      textAlign: 'right',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: 'monospace',
        fontSize: '18px',
        letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.55)',
        lineHeight: 1,
        marginBottom: '4px',
      }}>
        {time}
      </div>
      <div style={{
        fontFamily: 'monospace',
        fontSize: '8px',
        letterSpacing: '0.2em',
        color: 'rgba(255,255,255,0.2)',
        textTransform: 'uppercase',
      }}>
        {date} · EST
      </div>
    </div>
  )
}
