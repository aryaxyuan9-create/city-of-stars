import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { StoryData } from './CityOfStars'
import { supabase } from '../lib/supabase'

type StoryReaderProps = {
  stories: StoryData[]
  initialIndex: number
  onClose: () => void
  onStoryChange?: (storyId: string) => void
  onImageLoad?: (storyId: string, imageUrl: string) => void
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

export function StoryReader({ stories, initialIndex, onClose, onStoryChange, onImageLoad }: StoryReaderProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(initialIndex)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [typingActive, setTypingActive] = useState(false)
  const [visible, setVisible] = useState(true)
  const [echoes, setEchoes] = useState<Array<{
    id: string
    text: string
    author_name?: string
    created_at: string
  }>>([])
  const [echoText, setEchoText] = useState('')
  const [echoName, setEchoName] = useState('')
  const [echoSubmitting, setEchoSubmitting] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [zoomedImage, setZoomedImage] = useState(false)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

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

  // 懒加载：当前 story 没有 imageUrl 时从 Supabase 拉取
  useEffect(() => {
    if (story.imageUrl) return
    supabase
      .from('stories')
      .select('id,image_url')
      .eq('id', story.id)
      .single()
      .then(({ data }) => {
        if (data?.image_url) {
          onImageLoad?.(story.id, data.image_url)
        }
      })
  }, [story.id, story.imageUrl])

  /* 切换故事时拉取 echoes（暂时隐藏）
  useEffect(() => {
    setEchoes([])
    supabase
      .from('echoes')
      .select('id, text, author_name, created_at')
      .eq('story_id', story.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) setEchoes(data)
      })
  }, [story.id])

  const handleEchoSubmit = async () => {
    if (!echoText.trim() || echoSubmitting) return
    setEchoSubmitting(true)
    const { data, error } = await supabase
      .from('echoes')
      .insert({
        story_id: story.id,
        text: echoText.trim().slice(0, 50),
        author_name: echoName.trim() || null,
      })
      .select()
      .single()
    if (!error && data) {
      setEchoes(prev => [...prev, data])
      setEchoText('')
    }
    setEchoSubmitting(false)
  }
  */
  const handleEchoSubmit = async () => {}

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

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index])

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
        gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr',
        gridTemplateRows: isMobile ? 'auto 1fr' : '1fr',
        padding: isMobile ? '1.5rem' : '5rem',
        gap: isMobile ? '1.5rem' : '5rem',
        overflowY: isMobile ? 'auto' : 'hidden',
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
          position: 'absolute', top: isMobile ? '16px' : '2.5rem', left: isMobile ? '16px' : '5rem',
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
        <div style={{ marginTop: isMobile ? '3rem' : '2.5rem', display: 'flex', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 0.32s ease' }}>
          <img
            src={story.imageUrl || ''}
            alt=""
            style={{
              width: isMobile ? '100%' : '90%',
              maxHeight: isMobile ? '40vh' : '70vh',
              objectFit: 'contain',
              cursor: 'zoom-in',
              filter: imgLoaded
                ? 'contrast(1.05) saturate(0.9)'
                : 'blur(12px) grayscale(60%)',
              transition: 'filter 1.1s cubic-bezier(0.25,0.46,0.45,0.94)',
            }}
            onClick={() => setZoomedImage(true)}
          />
        </div>

        {/* 目录导航：上一张 + 当前 + 下一张，竖排 */}
        <div style={{
          display: isMobile ? 'none' : 'flex', flexDirection: 'column', gap: '10px',
          marginTop: 'auto', paddingTop: '2rem',
          pointerEvents: 'auto',
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
                onClick={() => {
                  if (i === index) return
                  setVisible(false)
                  setTimeout(() => {
                    setIndex(i)
                    onStoryChange?.(stories[i].id)
                    setVisible(true)
                  }, 320)
                }}
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
        padding: isMobile ? '0' : undefined,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.32s ease, transform 0.32s ease',
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

        {/* 主标题 */}
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: isMobile ? 'clamp(1.4rem, 6vw, 2rem)' : 'clamp(1.8rem, 3.5vw, 2.8rem)',
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

        {/* Echo 区域 */}
        <div style={{
          marginTop: '3rem',
          paddingTop: '2rem',
          borderTop: '0.5px solid rgba(255,255,255,0.08)',
          display: 'none',
        }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: '9px',
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.25)',
            textTransform: 'uppercase',
            marginBottom: '1.2rem',
          }}>
            {echoes.length > 0 ? `${echoes.length} echo${echoes.length > 1 ? 's' : ''}` : 'echoes'}
          </div>

          {echoes.length > 0 && (
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {echoes.map(echo => (
                <div key={echo.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontStyle: 'italic',
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.65)',
                    lineHeight: 1.6,
                  }}>
                    {echo.text}
                  </div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    letterSpacing: '0.12em',
                    color: 'rgba(255,255,255,0.2)',
                  }}>
                    — {echo.author_name || 'a stranger'}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={echoText}
                onChange={e => setEchoText(e.target.value.slice(0, 50))}
                onKeyDown={e => e.key === 'Enter' && handleEchoSubmit()}
                placeholder="leave an echo..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '0.5px solid rgba(255,255,255,0.12)',
                  padding: '8px 40px 8px 0',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: '13px',
                  color: '#FDF5E6',
                  outline: 'none',
                  letterSpacing: '0.02em',
                }}
              />
              <span style={{
                position: 'absolute',
                right: 0,
                bottom: '10px',
                fontFamily: 'monospace',
                fontSize: '9px',
                color: echoText.length > 40
                  ? 'rgba(242,180,74,0.6)'
                  : 'rgba(255,255,255,0.18)',
              }}>
                {50 - echoText.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                value={echoName}
                onChange={e => setEchoName(e.target.value)}
                placeholder="your name (optional)"
                maxLength={20}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                  padding: '6px 0',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.5)',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleEchoSubmit}
                disabled={!echoText.trim() || echoSubmitting}
                style={{
                  background: 'none',
                  border: '0.5px solid rgba(245,197,24,0.3)',
                  borderRadius: '2px',
                  padding: '5px 14px',
                  fontFamily: 'monospace',
                  fontSize: '9px',
                  letterSpacing: '0.15em',
                  color: echoText.trim()
                    ? 'rgba(245,197,24,0.7)'
                    : 'rgba(255,255,255,0.2)',
                  cursor: echoText.trim() ? 'pointer' : 'default',
                  textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                {echoSubmitting ? '...' : 'echo ✦'}
              </button>
            </div>
          </div>
        </div>

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

      {/* 左箭头 */}
      <div
        onClick={goPrev}
        style={{
          position: 'absolute',
          left: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          opacity: 0.4,
          transition: 'opacity 0.25s',
          pointerEvents: 'auto',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = '1'
          ;(e.currentTarget.querySelector('.line-nav-l') as HTMLElement).style.width = '32px'
          ;(e.currentTarget.querySelector('.line-nav-l') as HTMLElement).style.background = 'rgba(245,197,24,0.7)'
          ;(e.currentTarget.querySelector('.arr-nav-l') as HTMLElement).style.color = 'rgba(245,197,24,1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = '0.4'
          ;(e.currentTarget.querySelector('.line-nav-l') as HTMLElement).style.width = '20px'
          ;(e.currentTarget.querySelector('.line-nav-l') as HTMLElement).style.background = 'rgba(255,255,255,0.45)'
          ;(e.currentTarget.querySelector('.arr-nav-l') as HTMLElement).style.color = 'rgba(245,197,24,0.8)'
        }}
      >
        <div style={{ position: 'relative', width: '20px', height: '1px' }}>
          <div
            className="line-nav-l"
            style={{
              position: 'absolute', right: 0, top: 0,
              height: '1px', width: '20px',
              background: 'rgba(255,255,255,0.45)',
              transition: 'all 0.3s',
            }}
          />
          <span
            className="arr-nav-l"
            style={{
              position: 'absolute', left: 0, top: '-7px',
              fontSize: '12px',
              color: 'rgba(245,197,24,0.8)',
              transition: 'color 0.25s',
              lineHeight: 1,
            }}
          >‹</span>
        </div>
        <span style={{
          fontFamily: "'Cormorant', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '0.06em',
        }}>prev</span>
      </div>

      {/* 右箭头 */}
      <div
        onClick={goNext}
        style={{
          position: 'absolute',
          right: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          opacity: 0.4,
          transition: 'opacity 0.25s',
          pointerEvents: 'auto',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = '1'
          ;(e.currentTarget.querySelector('.line-nav-r') as HTMLElement).style.width = '32px'
          ;(e.currentTarget.querySelector('.line-nav-r') as HTMLElement).style.background = 'rgba(245,197,24,0.7)'
          ;(e.currentTarget.querySelector('.arr-nav-r') as HTMLElement).style.color = 'rgba(245,197,24,1)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = '0.4'
          ;(e.currentTarget.querySelector('.line-nav-r') as HTMLElement).style.width = '20px'
          ;(e.currentTarget.querySelector('.line-nav-r') as HTMLElement).style.background = 'rgba(255,255,255,0.45)'
          ;(e.currentTarget.querySelector('.arr-nav-r') as HTMLElement).style.color = 'rgba(245,197,24,0.8)'
        }}
      >
        <span style={{
          fontFamily: "'Cormorant', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '12px',
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '0.06em',
        }}>next</span>
        <div style={{ position: 'relative', width: '20px', height: '1px' }}>
          <div
            className="line-nav-r"
            style={{
              position: 'absolute', left: 0, top: 0,
              height: '1px', width: '20px',
              background: 'rgba(255,255,255,0.45)',
              transition: 'all 0.3s',
            }}
          />
          <span
            className="arr-nav-r"
            style={{
              position: 'absolute', right: 0, top: '-7px',
              fontSize: '12px',
              color: 'rgba(245,197,24,0.8)',
              transition: 'color 0.25s',
              lineHeight: 1,
            }}
          >›</span>
        </div>
      </div>

      {/* Lightbox */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          {/* ✕ close */}
          <button
            onClick={e => { e.stopPropagation(); setZoomedImage(false) }}
            style={{
              position: 'absolute', top: 24, right: 28,
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.5)', fontSize: 22,
              cursor: 'pointer', lineHeight: 1, padding: '4px 8px',
              fontFamily: 'monospace',
              transition: 'color 0.2s',
              zIndex: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
          >✕</button>

          <img
            src={story.imageUrl || ''}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '92vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              filter: 'contrast(1.05) saturate(0.9)',
              cursor: 'default',
            }}
          />
        </div>
      )}
    </div>
  )
}
