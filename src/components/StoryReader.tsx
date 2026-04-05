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
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(230,230,250,0.15)',
    color: 'rgba(230,230,250,0.6)',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '18px',
    cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 pointer-events-none"
      style={{ opacity: 0 }}
    >
      {/* Blur backdrop */}
      <div
        className="absolute inset-0"
        style={{ backdropFilter: 'blur(18px) brightness(0.5)', background: 'rgba(5,3,20,0.55)' }}
      />

      {/* ← Close */}
      <button
        onClick={handleClose}
        className="pointer-events-auto absolute top-10 left-10 z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
        style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(230,230,250,0.15)',
          color: 'rgba(230,230,250,0.65)',
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic',
        }}
      >
        ← Back
      </button>

      {/* Counter */}
      <div
        className="absolute top-10 right-10 z-10 pointer-events-none"
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: 'italic',
          color: 'rgba(230,230,250,0.35)',
          fontSize: '11px',
          letterSpacing: '0.1em',
        }}
      >
        {index + 1} / {stories.length}
      </div>

      {/* Main content */}
      <div className="absolute inset-0 flex items-center justify-center gap-12 px-20">

        {/* Prev */}
        <button className="pointer-events-auto" style={navBtn} onClick={goPrev}>‹</button>

        {/* Photo */}
        <img
          key={story.id}
          src={story.imageUrl || ''}
          alt=""
          style={{
            maxWidth: '38vw',
            maxHeight: '62vh',
            objectFit: 'contain',
            flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            filter: imgLoaded ? 'none' : 'blur(12px) grayscale(60%)',
            transition: 'filter 1.1s cubic-bezier(0.25,0.46,0.45,0.94)',
          }}
        />

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '30ch', gap: '20px' }}>

          {/* Metadata */}
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            lineHeight: '2',
            letterSpacing: '0.08em',
          }}>
            {story.author_name && (
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', marginBottom: '2px' }}>
                {story.author_name}
              </div>
            )}
            {story.location && (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>NYC · {story.location}</div>
            )}
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px' }}>{story.date}</div>
          </div>

          {/* Divider */}
          <div style={{ width: '32px', height: '1px', background: 'rgba(255,255,255,0.18)' }} />

          {/* Story text */}
          <p style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.88)',
            fontSize: 'clamp(0.9rem, 1.6vw, 1.05rem)',
            letterSpacing: '0.06em',
            lineHeight: '2',
          }}>
            {displayedText}
            <span style={{ animation: 'blink 1s step-end infinite' }}>|</span>
          </p>
        </div>

        {/* Next */}
        <button className="pointer-events-auto" style={navBtn} onClick={goNext}>›</button>

      </div>
    </div>
  )
}
