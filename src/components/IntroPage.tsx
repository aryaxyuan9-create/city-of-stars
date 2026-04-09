import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

interface IntroPageProps {
  onEnter: () => void
}

export function IntroPage({ onEnter }: IntroPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [lines, setLines] = useState<number>(0)

  // 背景旋转光影
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let raf: number
    let t = 0

    const resize = () => {
      cv.width = window.innerWidth
      cv.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const orbs = [
      { ox: 0.35, oy: 0.45, r: 0.38, color: 'rgba(74,18,128,0.75)', speed: 0.00045 },
      { ox: 0.65, oy: 0.55, r: 0.28, color: 'rgba(100,40,180,0.55)', speed: -0.00038 },
      { ox: 0.50, oy: 0.28, r: 0.22, color: 'rgba(50,20,100,0.5)',   speed: 0.00062 },
      { ox: 0.20, oy: 0.72, r: 0.18, color: 'rgba(130,60,200,0.38)', speed: -0.0005 },
    ]

    function draw() {
      const W = cv!.width, H = cv!.height
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#080514'
      ctx.fillRect(0, 0, W, H)
      orbs.forEach(o => {
        const x = o.ox * W + Math.cos(t * o.speed * 1000) * W * 0.06
        const y = o.oy * H + Math.sin(t * o.speed * 800)  * H * 0.05
        const r = o.r * Math.min(W, H)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, o.color)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      })
      t++
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  // 逐行淡入时序
  useEffect(() => {
    const delays = [600, 2000, 3400, 4800, 6000, 7200]
    const timers = delays.map((d, i) =>
      setTimeout(() => setLines(i + 1), d)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // ripple keyframes
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes ripple {
        0%   { transform: scale(1);   opacity: 1; }
        100% { transform: scale(2.2); opacity: 0; }
      }
    `
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  const handleEnter = () => {
    const cv = canvasRef.current
    if (cv) {
      gsap.to(cv, { filter: 'blur(0px)', opacity: 1, duration: 2.2, ease: 'power2.inOut' })
    }
    if (containerRef.current) {
      gsap.to(containerRef.current.querySelector('.content'), {
        opacity: 0, duration: 0.8, ease: 'power2.inOut',
        onComplete: () => {
          gsap.to(containerRef.current, {
            opacity: 0, duration: 1.2, ease: 'power2.inOut',
            onComplete: onEnter
          })
        }
      })
    }
  }

  const fadeStyle = (n: number): React.CSSProperties => ({
    opacity: lines >= n ? 1 : 0,
    transform: lines >= n ? 'translateY(0)' : 'translateY(8px)',
    transition: 'opacity 1.6s ease, transform 1.6s ease',
    margin: 0,
    fontFamily: "'Cormorant', Georgia, serif",
    fontStyle: 'italic',
    lineHeight: 1.5,
  })

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#080514',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          filter: 'blur(48px)',
          opacity: 0.65,
        }}
      />

      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,5,20,0.4)', pointerEvents: 'none' }} />

      <div className="content" style={{
        position: 'relative', zIndex: 2,
        textAlign: 'center',
        padding: '0 48px',
        maxWidth: '560px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '28px',
      }}>

        <p style={{ ...fadeStyle(1), fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 400, color: 'rgba(255,255,255,0.88)' }}>
          Every star here was once a real moment.
        </p>

        <p style={{ ...fadeStyle(2), fontSize: 'clamp(14px, 1.8vw, 18px)', fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>
          Happy, sad, or somewhere in between.
        </p>

        <p style={{ ...fadeStyle(3), fontSize: 'clamp(14px, 1.8vw, 18px)', fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>
          Post whatever you want to leave behind. It stays here, as a part of the city sky.
        </p>

        <p style={{ ...fadeStyle(4), fontSize: 'clamp(14px, 1.8vw, 18px)', fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>
          You can do the same — or just wander, and read what strangers chose to remember.
        </p>

        <p style={{ ...fadeStyle(5), fontSize: 'clamp(15px, 2vw, 20px)', fontWeight: 400, color: 'rgba(255,255,255,0.75)' }}>
          Nothing here is too small to matter.
        </p>

        <div style={{
          ...fadeStyle(6),
          marginTop: '12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        }}>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '8px' }}>

            {/* 外圈脉冲光晕 */}
            <div style={{
              position: 'absolute',
              width: '120px', height: '120px',
              borderRadius: '50%',
              border: '0.5px solid rgba(245,197,24,0.25)',
              animation: 'ripple 2.4s ease-out infinite',
            }} />
            <div style={{
              position: 'absolute',
              width: '120px', height: '120px',
              borderRadius: '50%',
              border: '0.5px solid rgba(245,197,24,0.15)',
              animation: 'ripple 2.4s ease-out infinite 0.8s',
            }} />
            <div style={{
              position: 'absolute',
              width: '120px', height: '120px',
              borderRadius: '50%',
              border: '0.5px solid rgba(245,197,24,0.08)',
              animation: 'ripple 2.4s ease-out infinite 1.6s',
            }} />

            {/* 中心按钮圆形 */}
            <button
              onClick={handleEnter}
              style={{
                position: 'relative', zIndex: 2,
                width: '88px', height: '88px',
                borderRadius: '50%',
                background: 'rgba(245,197,24,0.06)',
                border: '0.5px solid rgba(245,197,24,0.45)',
                fontFamily: "'Cormorant', Georgia, serif",
                fontStyle: 'italic',
                fontSize: '13px',
                color: 'rgba(245,197,24,0.85)',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.4s ease',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: '2px',
                lineHeight: 1.3,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(245,197,24,0.12)'
                e.currentTarget.style.borderColor = 'rgba(245,197,24,0.8)'
                e.currentTarget.style.color = 'rgba(245,197,24,1)'
                e.currentTarget.style.transform = 'scale(1.06)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(245,197,24,0.06)'
                e.currentTarget.style.borderColor = 'rgba(245,197,24,0.45)'
                e.currentTarget.style.color = 'rgba(245,197,24,0.85)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <span>enter</span>
              <span style={{ fontSize: '16px', letterSpacing: 0 }}>→</span>
            </button>
          </div>

          <div style={{
            fontFamily: 'monospace',
            fontSize: '9px',
            letterSpacing: '0.2em',
            color: 'rgba(196,174,244,0.25)',
            textTransform: 'uppercase',
          }}>
            your story is already out there
          </div>
        </div>

      </div>
    </div>
  )
}
