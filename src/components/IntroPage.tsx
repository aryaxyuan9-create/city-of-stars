import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

interface IntroPageProps {
  onEnter: () => void
  onClose?: () => void  // X button to dismiss (overlay mode)
  instant?: boolean     // skip staggered reveal (used when shown as overlay)
}

interface Star {
  baseX: number
  baseY: number
  x: number
  y: number
  radius: number
  phase: number
  speed: number
  driftX: number
  driftY: number
  parallax: number
}

export function IntroPage({ onEnter, onClose, instant = false }: IntroPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const starsRef     = useRef<Star[]>([])
  const mouseRef     = useRef({ x: 0, y: 0 })
  const rafRef       = useRef(0)
  const warpRef      = useRef(0)          // 0 = idle, increases to 1 on click
  const enteredRef   = useRef(false)

  const [lines, setLines]     = useState(0)
  const [hovered, setHovered] = useState(false)
  const [nycTime, setNycTime] = useState('')

  // ---------- canvas ----------
  useEffect(() => {
    const cv  = canvasRef.current!
    const ctx = cv.getContext('2d')!

    const buildStars = () => {
      const W = cv.width, H = cv.height
      const count = 280 + Math.floor(Math.random() * 120)
      starsRef.current = Array.from({ length: count }, () => {
        const bx = Math.random() * W
        const by = Math.random() * H
        return {
          baseX: bx, baseY: by, x: bx, y: by,
          radius:   0.5  + Math.random() * 1.3,
          phase:    Math.random() * Math.PI * 2,
          speed:    0.4  + Math.random() * 1.1,
          driftX:   (Math.random() - 0.5) * 0.07,
          driftY:   (Math.random() - 0.5) * 0.07,
          parallax: 0.015 + Math.random() * 0.055,
        }
      })
    }

    const resize = () => {
      cv.width  = window.innerWidth
      cv.height = window.innerHeight
      buildStars()
    }
    resize()
    window.addEventListener('resize', resize)

    let t = 0

    const draw = () => {
      const W = cv.width, H = cv.height
      const w = warpRef.current
      ctx.clearRect(0, 0, W, H)

      // clear (background comes from the container gradient)
      ctx.clearRect(0, 0, W, H)

      // corner nebula
      ;[
        [0, 0], [W, 0], [0, H], [W, H],
      ].forEach(([cx, cy]) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.52)
        g.addColorStop(0,   'rgba(55,8,95,0.38)')
        g.addColorStop(0.5, 'rgba(25,4,55,0.12)')
        g.addColorStop(1,   'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      })

      const mx = mouseRef.current.x - W / 2
      const my = mouseRef.current.y - H / 2

      starsRef.current.forEach((star) => {
        // drift
        star.baseX = (star.baseX + star.driftX + W) % W
        star.baseY = (star.baseY + star.driftY + H) % H

        // parallax
        star.x = star.baseX + mx * star.parallax
        star.y = star.baseY + my * star.parallax

        // twinkle
        const alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * star.speed * 0.018 + star.phase))

        if (w > 0) {
          // warp: stretch stars radially from center
          const dx = star.x - W / 2
          const dy = star.y - H / 2
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const nx = dx / dist
          const ny = dy / dist
          const tail = w * w * dist * 0.55 + w * 18

          ctx.save()
          ctx.globalAlpha = Math.min(1, alpha + w * 0.6)
          const g = ctx.createLinearGradient(
            star.x - nx * tail * 0.15, star.y - ny * tail * 0.15,
            star.x + nx * tail,         star.y + ny * tail
          )
          g.addColorStop(0, 'rgba(107,33,168,0)')
          g.addColorStop(0.4, 'rgba(200,180,255,0.6)')
          g.addColorStop(1, 'rgba(255,255,255,1)')
          ctx.strokeStyle = g
          ctx.lineWidth = star.radius * (0.8 + w * 2.5)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(star.x - nx * tail * 0.15, star.y - ny * tail * 0.15)
          ctx.lineTo(star.x + nx * tail,         star.y + ny * tail)
          ctx.stroke()
          ctx.restore()
        } else {
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      })

      t++

      // advance warp (slower = 0.007 ≈ ~2s to reach 0.6)
      if (w > 0 && w < 1) {
        warpRef.current = Math.min(1, w + 0.007)
      }
      // trigger onEnter once warp hits 0.6
      if (w >= 0.6 && !enteredRef.current) {
        enteredRef.current = true
        gsap.to(containerRef.current, {
          opacity: 0, duration: 1.2, ease: 'power2.in', onComplete: onEnter,
        })
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [onEnter])

  // mouse
  useEffect(() => {
    const h = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('mousemove', h)
    return () => window.removeEventListener('mousemove', h)
  }, [])

  // nyc time
  useEffect(() => {
    const tick = () => setNycTime(
      new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      })
    )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // staggered reveal — instant when used as overlay
  useEffect(() => {
    if (instant) { setLines(6); return }
    const timers = [500, 1100, 1900, 2800, 3700, 4600].map((d, i) =>
      setTimeout(() => setLines(i + 1), d)
    )
    return () => timers.forEach(clearTimeout)
  }, [instant])

  // fade in on mount
  useEffect(() => {
    if (!containerRef.current) return
    gsap.fromTo(containerRef.current, { opacity: 0 }, { opacity: 1, duration: instant ? 0.4 : 0, ease: 'power2.out' })
  }, [])

  const handleEnter = () => {
    if (warpRef.current > 0) return
    warpRef.current = 0.001
    // fade HUD text
    containerRef.current?.querySelectorAll('.hud').forEach((el, i) => {
      gsap.to(el, { opacity: 0, duration: 0.4, delay: i * 0.04, ease: 'power2.in' })
    })
  }

  const fade = (n: number): React.CSSProperties => ({
    opacity:   lines >= n ? 1 : 0,
    transform: lines >= n ? 'translateY(0)' : 'translateY(10px)',
    transition: instant ? 'none' : 'opacity 1.2s ease, transform 1.2s ease',
  })

  const mono: React.CSSProperties = {
    fontFamily: 'monospace',
    textTransform: 'uppercase' as const,
    lineHeight: 1.9,
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'linear-gradient(to bottom, #080514 0%, #120630 40%, #1e0848 70%, #4a1280 100%)', overflow: 'hidden' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* X close button — only shown in overlay mode */}
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 24, right: 28, zIndex: 10,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.35)', fontSize: 18, lineHeight: 1,
            padding: '4px 8px',
            fontFamily: 'monospace',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
        >✕</button>
      )}

      {/* ── HUD CORNERS ── */}

      {/* top-left */}
      <div className="hud" style={{ position: 'absolute', top: 24, left: 28, ...fade(1) }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.28)' }}>
          CELESTIAL PROTOCOL // V.84
        </div>
        <div style={{ ...mono, fontSize: 9, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.13)' }}>
          MEMORY PULSE · ACTIVE
        </div>
      </div>

      {/* top-right */}
      <div className="hud" style={{ position: 'absolute', top: 24, right: 28, textAlign: 'right', ...fade(1) }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.22)' }}>
          40.7128° N · 74.0060° W
        </div>
        <div style={{ ...mono, fontSize: 9, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.1)' }}>
          NEW YORK CITY
        </div>
      </div>


      {/* ── CENTERPIECE ── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>

        {/* CITY OF STARS label */}
        <div className="hud" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 52, ...fade(2) }}>
          <div style={{ width: 56, height: '0.5px', background: 'rgba(255,255,255,0.28)' }} />
          <span style={{ ...mono, fontSize: 10, letterSpacing: '0.46em', color: 'rgba(255,255,255,0.52)' }}>
            CITY OF STARS
          </span>
          <div style={{ width: 56, height: '0.5px', background: 'rgba(255,255,255,0.28)' }} />
        </div>

        {/* Main quote */}
        <p className="hud" style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(28px, 4vw, 54px)',
          fontWeight: 400,
          fontStyle: 'italic',
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.18,
          letterSpacing: '0.01em',
          maxWidth: '18ch',
          margin: '0 0 28px',
          ...fade(3),
        }}>
          Every star here was once a real moment.
        </p>

        {/* Secondary quote */}
        <p className="hud" style={{
          fontFamily: "'Cormorant', Georgia, serif",
          fontSize: 'clamp(12px, 1.35vw, 15px)',
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.14em',
          margin: '0 0 72px',
          ...fade(4),
        }}>
          somewhere in these streets, your story is waiting
        </p>

        {/* ENTER button */}
        <div className="hud" style={{ ...fade(5), pointerEvents: 'auto', position: 'relative' }}>
          {/* thin rule above */}
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)', marginBottom: 24 }} />

          <button
            onClick={handleEnter}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              padding: '10px 40px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* hover glow streak */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width:  hovered ? '220px' : '0px',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(107,33,168,0.7) 25%, rgba(255,255,255,0.95) 50%, rgba(107,33,168,0.7) 75%, transparent)',
              transition: 'width 0.38s cubic-bezier(0.4,0,0.2,1)',
              pointerEvents: 'none',
            }} />

            <span style={{
              ...mono,
              fontSize: 11,
              letterSpacing: '0.4em',
              color: hovered ? '#ffffff' : 'rgba(255,255,255,0.5)',
              transition: 'color 0.3s ease',
            }}>
              ENTER THE SKY
            </span>

            {/* under-line accent */}
            <div style={{
              width:  hovered ? 44 : 18,
              height: '0.5px',
              background: hovered ? 'rgba(107,33,168,0.9)' : 'rgba(255,255,255,0.18)',
              transition: 'all 0.35s ease',
            }} />
          </button>

          {/* thin rule below */}
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)', marginTop: 24 }} />
        </div>

      </div>
    </div>
  )
}
