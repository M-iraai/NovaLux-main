import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function BottomSheet({ isOpen, onClose, title, children }) {
  // ESC closes the sheet, and the page behind it stops scrolling while open.
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="sheet-overlay"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="sheet-panel fixed bottom-0 left-1/2 -translate-x-1/2 w-full bg-white rounded-t-3xl p-4 pb-5 z-50 overflow-y-auto max-h-[85vh]"
        dir="rtl"
        style={{ maxWidth: 'min(100%, 440px)' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-handle" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 text-lg font-extrabold text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-lav text-purple flex items-center justify-center border-0 hover:bg-purple/15 transition-colors"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}
