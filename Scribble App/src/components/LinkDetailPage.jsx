import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAppContext } from '../context/AppContext.jsx'
import { getCategoryAccent } from '../theme.js'
import DetailFooter from './DetailFooter.jsx'
import MoveToCard from './MoveToCard.jsx'
import UnderlineSvg from '../assets/Underline.svg?react'

export function openUrl(url) {
  if (!url) return
  let u = url.trim()
  const digits = u.replace(/\D/g, '')
  if (/^[+()\-.\s\d]+$/.test(u) && digits.length >= 7 && digits.length <= 15) {
    window.location.href = 'tel:' + u.replace(/[^\d+]/g, '')
    return
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u
  window.open(u, '_blank', 'noopener,noreferrer')
}

function displayUrl(url) {
  if (!url) return ''
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/$/, '')
}
function hostOf(url) {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url)
    return u.hostname.replace(/^www\./, '')
  } catch { return displayUrl(url) }
}
function fullUrl(url) {
  const u = (url || '').trim()
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : 'https://' + u
}

function LinkPageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="#595959" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="#595959" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function LinkDetailPage({ link, categoryId, projectId, onClose }) {
  const { categories, updateProjectLink, toggleProjectLinkActivated, setProjectLinkScheduled, moveProjectLink } = useAppContext()
  const [isOpen, setIsOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTop, setMoveTop] = useState(null)
  const [copied, setCopied] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const titleRef = useRef(null)
  const scrollRef = useRef(null)
  const scrollTitleRef = useRef(null)
  const pageRef = useRef(null)

  const accent = useMemo(() => {
    const idx = categories.findIndex(c => c.id === categoryId)
    return idx === -1 ? null : getCategoryAccent(idx)
  }, [categories, categoryId])

  const projectName = useMemo(
    () => categories.find(c => c.id === categoryId)?.projects.find(p => p.id === projectId)?.name || '',
    [categories, categoryId, projectId]
  )

  useEffect(() => { requestAnimationFrame(() => setIsOpen(true)) }, [])

  // Seed the editable title once (uncontrolled so the caret behaves)
  useEffect(() => {
    if (titleRef.current) titleRef.current.textContent = link.title || displayUrl(link.url)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link.id])

  // Dynamic header title: fade in once the big title scrolls out the top
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const check = () => {
      const t = titleRef.current, h = scrollTitleRef.current
      if (!t || !h) return
      const show = t.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().top + 8
      h.style.opacity = show ? '1' : '0'
      h.style.transform = show ? 'translateY(0)' : 'translateY(8px)'
      if (show) h.textContent = (t.textContent || '').trim()
    }
    check()
    scroll.addEventListener('scroll', check, { passive: true })
    return () => scroll.removeEventListener('scroll', check)
  }, [])

  const saveTitle = useCallback(() => {
    const text = (titleRef.current?.textContent || '').trim()
    if (text && text !== link.title) updateProjectLink(categoryId, projectId, link.id, text, link.url)
    else if (!text && titleRef.current) titleRef.current.textContent = link.title || displayUrl(link.url)
  }, [categoryId, projectId, link.id, link.title, link.url, updateProjectLink])

  const handleDone = () => { saveTitle(); setIsOpen(false); setTimeout(onClose, 360) }
  const handleTopButton = (e) => {
    e.preventDefault()
    if (editingTitle) { titleRef.current?.blur(); saveTitle(); setEditingTitle(false) }
    else handleDone()
  }
  const handleTitleKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur() } }

  const openMove = useCallback(() => {
    const titleEl = titleRef.current, pageEl = pageRef.current
    if (titleEl && pageEl) {
      const pageH = pageEl.getBoundingClientRect().height
      const top = titleEl.getBoundingClientRect().bottom - pageEl.getBoundingClientRect().top + 16
      setMoveTop(Math.min(Math.max(72, top), pageH / 2))
    }
    setMoveOpen(true)
  }, [])
  const saveMove = useCallback((sel) => {
    moveProjectLink(categoryId, projectId, sel.categoryId, sel.projectId, link.id)
    setMoveOpen(false)
  }, [categoryId, projectId, link.id, moveProjectLink])

  const handleCopy = useCallback(() => {
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1200) }
    navigator.clipboard?.writeText(link.url || '').then(flash).catch(() => {})
  }, [link.url])

  const previewSrc = `https://image.thum.io/get/width/800/${fullUrl(link.url)}`

  return (
    <div
      ref={pageRef}
      className={`note-detail-page${isOpen ? ' open' : ''}`}
      style={accent ? { '--accent-base': accent.base, '--accent-dark': accent.dark, '--accent-light': accent.light, '--accent-base-rgb': accent.baseRgb } : undefined}
    >
      <div className="note-detail-header">
        <LinkPageIcon/>
        <span className="note-scroll-title" ref={scrollTitleRef} />
        <button className="note-detail-done" onMouseDown={handleTopButton}>{editingTitle ? 'Save' : 'Done'}</button>
      </div>

      <div className="todo-detail-scroll" ref={scrollRef}>
        <div
          ref={titleRef}
          className="todo-detail-title"
          contentEditable
          suppressContentEditableWarning
          autoCapitalize="sentences"
          onFocus={() => setEditingTitle(true)}
          onKeyDown={handleTitleKeyDown}
          onBlur={saveTitle}
        />

        <div className="todo-detail-underline">
          <UnderlineSvg style={{ display: 'block', color: 'var(--accent-base)' }} />
        </div>

        <div className="link-preview-card" onClick={() => openUrl(link.url)}>
          <div className="link-preview-image">
            {!imgFailed
              ? <img src={previewSrc} alt="" loading="lazy" onError={() => setImgFailed(true)} />
              : (
                <div className="link-preview-fallback">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="var(--accent-dark)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="var(--accent-dark)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
          </div>
          <div className="link-preview-divider"/>
          <div className="link-preview-body">
            <span className="link-preview-title">{link.title || hostOf(link.url)}</span>
            <span className="link-preview-url">{displayUrl(link.url)}</span>
          </div>
        </div>
      </div>

      {moveOpen && (
        <MoveToCard
          categories={categories}
          currentCategoryId={categoryId}
          currentProjectId={projectId}
          topPx={moveTop}
          onCancel={() => setMoveOpen(false)}
          onSave={saveMove}
        />
      )}

      <DetailFooter
        activated={!!link.activated}
        scheduledDate={link.scheduledDate}
        onToggleActive={() => toggleProjectLinkActivated(categoryId, projectId, link.id)}
        onSchedule={(date) => setProjectLinkScheduled(categoryId, projectId, link.id, date)}
        onClearSchedule={() => setProjectLinkScheduled(categoryId, projectId, link.id, null)}
        accent={accent}
        projectName={projectName}
        onProjectClick={openMove}
        menuOpen={moveOpen}
        onCopy={handleCopy}
        copied={copied}
      />
    </div>
  )
}
