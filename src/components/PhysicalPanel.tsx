import { useRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

type PhysicalPanelProps = HTMLAttributes<HTMLDivElement> & {
  as?: 'div' | 'section' | 'aside' | 'article'
  children: ReactNode
  intensity?: 'soft' | 'normal'
}

export function PhysicalPanel({
  children,
  className,
  intensity = 'normal',
  onPointerDown,
  onPointerLeave,
  onPointerMove,
  onPointerUp,
  style,
  ...props
}: PhysicalPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)

  function resetSurface() {
    const node = ref.current

    if (!node) return

    node.style.setProperty('--tilt-x', '0deg')
    node.style.setProperty('--tilt-y', '0deg')
    node.style.setProperty('--lift', '0px')
    node.classList.remove('is-pressed')
  }

  return (
    <div
      ref={ref}
      className={['physical-surface', className].filter(Boolean).join(' ')}
      data-intensity={intensity}
      style={style}
      onPointerMove={(event) => {
        const node = ref.current

        if (node && !frameRef.current) {
          frameRef.current = window.requestAnimationFrame(() => {
            const rect = node.getBoundingClientRect()
            const strength = intensity === 'soft' ? 3.8 : 5.6
            const relativeX = (event.clientX - rect.left) / rect.width - 0.5
            const relativeY = (event.clientY - rect.top) / rect.height - 0.5

            node.style.setProperty('--tilt-x', `${relativeY * -strength}deg`)
            node.style.setProperty('--tilt-y', `${relativeX * strength}deg`)
            node.style.setProperty('--lift', intensity === 'soft' ? '-1px' : '-2px')
            frameRef.current = 0
          })
        }

        onPointerMove?.(event)
      }}
      onPointerDown={(event) => {
        ref.current?.classList.add('is-pressed')
        onPointerDown?.(event)
      }}
      onPointerUp={(event) => {
        ref.current?.classList.remove('is-pressed')
        onPointerUp?.(event)
      }}
      onPointerLeave={(event) => {
        if (frameRef.current) {
          window.cancelAnimationFrame(frameRef.current)
          frameRef.current = 0
        }

        resetSurface()
        onPointerLeave?.(event)
      }}
      {...props}
    >
      {children}
    </div>
  )
}
