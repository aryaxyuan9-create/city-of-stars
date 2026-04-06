import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { StoryData } from './CityOfStars'

type StoryReaderProps = {
  stories: StoryData[]
  initialIndex: number
  onClose: () => void
}

function useTypewriter(text: string, isActive: boolean, speed = 38) {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    if (!isActive) { setDisplayed(''); return }
    let i = 0
    setDisplayed('')
    const interval = setInterval(() => {
      if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++ }
      else clearInterval(interval)
    }, speed)
    return () => clearInterval(interval)
  }, [text, isActive, speed])

  return displayed
}

export function StoryReader({ stories, initialIndex, onClose }: StoryReaderProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(initialIndex)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [typingActive, setTypingActive] = useState(false)

  const story = stories[index]

  // Fade in on mount
  useEffect(() => {
    if (overlayRef.current) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.inOut' })
    }
    const t1 = setTimeout(() => setImgLoaded(true), 200)
    const t2 = setTimeout(() => setTypingActive(true), 600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Reset image + typewriter when story changes
  useEffect(() => {
    setImgLoaded(false)
    setTypingActive(false)
    const t1 = setTimeout(() => setImgLoaded(true), 150)
    const t2 = setTimeout(() => setTypingActive(true), 500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [index])

  const handleClose = () => {
    if (overlayRef.current) {
      gsap.to(overlayRef.current, { opacity: 0, duration: 0.4, ease: 'power2.inOut', onComplete: onClose })
    } else {
      onClose()
    }
  }

  const goPrev = () => setIndex((i) => (i - 1 + stories.length) % stories.length)
  const goNext = () => setIndex((i) => (i + 1) % stories.length)

  const displayedText = useTypewriter(story.text, typingActive, 42)

  const navBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(230,230,250,0.12)',
    color: 'rgba(230,230,250,0.5)',
    borderRadius: '50%',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '20px',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s, color 0.2s, border-color 0.2s',
  }

  const navBtnHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.13)'
    e.currentTarget.style.color = 'rgba(230,230,250,0.9)'
    e.currentTarget.style.borderColor = 'rgba(230,230,250,0.3)'
  }
  const navBtnLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
    e.currentTarget.style.color = 'rgba(230,230,250,0.5)'
    e.currentTarget.style.borderColor = 'rgba(230,230,250,0.12)'
  }

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        opacity: 0,
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        minHeight: '100vh',
        padding: '5rem',
        gap: '5rem',
        boxSizing: 'border-box',
      }}
    >
      {/* 模糊背景 */}
      <div style={{
        position: 'absolute', inset: 0,
        backdropFilter: 'blur(18px) brightness(0.45)',
        background: 'rgba(5,3,20,0.6)',
        zIndex: 0,
      }} />

      {/* Back button — 左上角，绝对定位在整个覆盖层 */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute', top: '2.5rem', left: '5rem',
          zIndex: 2,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(230,230,250,0.12)',
          color: 'rgba(230,230,250,0.55)',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '14px',
          borderRadius: '999px',
          padding: '6px 18px',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'background 0.2s, color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.11)'
          e.currentTarget.style.color = 'rgba(230,230,250,0.9)'
          e.currentTarget.style.borderColor = 'rgba(230,230,250,0.28)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = 'rgba(230,230,250,0.55)'
          e.currentTarget.style.borderColor = 'rgba(230,230,250,0.12)'
        }}
      >
        ← Back
      </button>

      {/* 左栏 */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        {/* 图片 */}
        <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
          <img
            key={story.id}
            src={story.imageUrl || ''}
            alt=""
            style={{
              width: '90%',
              maxHeight: '70vh',
              objectFit: 'contain',
              border: '0.5px solid rgba(255,255,255,0.15)',
              cursor: 'zoom-in',
              filter: imgLoaded
                ? 'contrast(1.05) saturate(0.9)'
                : 'blur(12px) grayscale(60%)',
              transition: 'filter 1.1s cubic-bezier(0.25,0.46,0.45,0.94)',
            }}
            onClick={() => window.open(story.imageUrl || '', '_blank')}
          />
        </div>

        {/* 目录导航：上一张 + 当前 + 下一张，竖排 */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '10px',
          marginTop: 'auto', paddingTop: '2rem',
        }}>
          {[
            (index - 1 + stories.length) % stories.length,
            index,
            (index + 1) % stories.length,
          ].filter((v, i, arr) => arr.indexOf(v) === i).map((i) => {
            const s = stories[i]
            return (
              <div
                key={s.id}
                onClick={() => setIndex(i)}
                style={{
                  cursor: 'pointer',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: '13px',
                  color: i === index
                    ? 'rgba(245,197,24,0.9)'
                    : 'rgba(255,255,255,0.28)',
                  fontWeight: i === index ? 500 : 400,
                  transition: 'color 0.2s',
                  display: 'flex', gap: '10px', alignItems: 'baseline',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.08em' }}>
                  P.{String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ maxWidth: '18ch', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {s.title || s.text?.slice(0, 20) || 'untitled'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 右栏 */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 元数据 — 一行，右对齐，顶部 */}
        <div style={{
          display: 'flex', gap: '20px', alignItems: 'baseline',
          justifyContent: 'flex-end',
          paddingTop: '0',
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Location', value: story.location || 'NYC' },
            { label: 'Date',     value: story.date },
            { label: 'Author',   value: story.author_name || 'anonymous' },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{label}</div>
              <div style={{ fontSize: '13px', color: '#fff', fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 章节编号 */}
        <div style={{
          marginTop: '3rem',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'monospace',
          letterSpacing: '0.1em',
        }}>
          {['I','II','III','IV','V','VI','VII','VIII','IX','X'][index] || `${index + 1}`}.
        </div>

        {/* 主标题 */}
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(2.5rem, 5vw, 4rem)',
          fontWeight: 400,
          fontStyle: 'italic',
          lineHeight: 0.95,
          letterSpacing: '-0.01em',
          color: '#ffd700',
          margin: '1rem 0 3rem',
        }}>
          {story.title || story.text?.slice(0, 40) || 'untitled'}
        </h1>

        {/* 正文 */}
        <p style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '16px',
          lineHeight: 1.85,
          color: 'rgba(255,255,255,0.65)',
          maxWidth: '85%',
        }}>
          {displayedText || ''}
          <span style={{ animation: 'blink 1s step-end infinite' }}>|</span>
        </p>

        {/* 底部装饰线 + 下一篇 */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '2rem',
          borderTop: '0.5px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.22)',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
          }}>
            {stories[(index + 1) % stories.length]?.location
              ? `Next · ${stories[(index + 1) % stories.length].location}`
              : 'Next · NYC'}
          </div>
        </div>
      </div>

      {/* pointer-events 覆盖层 */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'auto' }} />
    </div>
  )
}
