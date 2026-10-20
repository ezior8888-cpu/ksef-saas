'use client'

import { useEffect, useRef, type CSSProperties } from 'react'

interface LetterGlitchProps {
  glitchColors?: string[]
  className?: string
  glitchSpeed?: number
  centerVignette?: boolean
  outerVignette?: boolean
  smooth?: boolean
  characters?: string
}

interface Rgb {
  r: number
  g: number
  b: number
}

interface Letter {
  char: string
  color: Rgb
  startColor: Rgb
  targetColor: Rgb
  colorProgress: number
}

const FONT_SIZE = 16
const CHAR_WIDTH = 10
const CHAR_HEIGHT = 20

// Used only when every color passed in fails to parse, so the canvas is never blank
const FALLBACK_COLOR: Rgb = { r: 255, g: 255, b: 255 }

const hexToRgb = (hex: string): Rgb | null => {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
  const expanded = hex.replace(shorthandRegex, (_, r: string, g: string, b: string) => r + r + g + g + b + b)
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expanded)

  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : null
}

const rgbToCss = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`

const interpolateColor = (start: Rgb, end: Rgb, factor: number): Rgb => ({
  r: Math.round(start.r + (end.r - start.r) * factor),
  g: Math.round(start.g + (end.g - start.g) * factor),
  b: Math.round(start.b + (end.b - start.b) * factor)
})

const containerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  backgroundColor: '#000000',
  overflow: 'hidden'
}

const canvasStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%'
}

const outerVignetteStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  background: 'radial-gradient(circle, rgba(9, 11, 12, 0.5) 20%, rgba(9, 11, 12, 0.9) 70%)'
}

const centerVignetteStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  background: 'radial-gradient(circle, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0) 60%)'
}

const LetterGlitch = ({
  glitchColors = ['#5ee9b5', '#00bc7d', '#009966'],
  className = '',
  glitchSpeed = 100,
  centerVignette = false,
  outerVignette = true,
  smooth = true,
  characters = 'र€£¥₽₩₺₴₦₱₲₵₡₢₭'
}: LetterGlitchProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Callers pass a fresh array literal on every render, so depend on its contents instead
  const colorsKey = glitchColors.join(',')

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) return

    const ctx = canvas.getContext('2d')

    if (!ctx) return

    const palette = colorsKey.split(',').reduce<Rgb[]>((acc, color) => {
      const rgb = hexToRgb(color)

      if (rgb) acc.push(rgb)

      return acc
    }, [])

    if (palette.length === 0) palette.push(FALLBACK_COLOR)

    const symbols = Array.from(characters)

    const grid = { columns: 0, rows: 0 }
    let letters: Letter[] = []
    let animationId = 0
    let lastGlitchTime = 0

    const getRandomChar = () => symbols[Math.floor(Math.random() * symbols.length)]
    const getRandomColor = () => palette[Math.floor(Math.random() * palette.length)]

    const initializeLetters = (columns: number, rows: number) => {
      grid.columns = columns
      grid.rows = rows

      letters = Array.from({ length: columns * rows }, () => {
        const color = getRandomColor()

        return { char: getRandomChar(), color, startColor: color, targetColor: color, colorProgress: 1 }
      })
    }

    const drawLetters = () => {
      if (letters.length === 0) return

      const { width, height } = canvas.getBoundingClientRect()

      ctx.clearRect(0, 0, width, height)
      ctx.font = `${FONT_SIZE}px monospace`
      ctx.textBaseline = 'top'

      letters.forEach((letter, index) => {
        const x = (index % grid.columns) * CHAR_WIDTH
        const y = Math.floor(index / grid.columns) * CHAR_HEIGHT

        ctx.fillStyle = rgbToCss(letter.color)
        ctx.fillText(letter.char, x, y)
      })
    }

    const resizeCanvas = () => {
      const parent = canvas.parentElement

      if (!parent) return

      const dpr = window.devicePixelRatio || 1
      const rect = parent.getBoundingClientRect()

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr

      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      initializeLetters(Math.ceil(rect.width / CHAR_WIDTH), Math.ceil(rect.height / CHAR_HEIGHT))
      drawLetters()
    }

    const updateLetters = () => {
      if (letters.length === 0) return

      const updateCount = Math.max(1, Math.floor(letters.length * 0.05))

      for (let i = 0; i < updateCount; i++) {
        const letter = letters[Math.floor(Math.random() * letters.length)]

        if (!letter) continue

        letter.char = getRandomChar()
        letter.targetColor = getRandomColor()

        if (smooth) {
          letter.startColor = letter.color
          letter.colorProgress = 0
        } else {
          letter.color = letter.targetColor
          letter.colorProgress = 1
        }
      }
    }

    const handleSmoothTransitions = () => {
      let needsRedraw = false

      letters.forEach(letter => {
        if (letter.colorProgress >= 1) return

        letter.colorProgress = Math.min(1, letter.colorProgress + 0.05)
        letter.color = interpolateColor(letter.startColor, letter.targetColor, letter.colorProgress)
        needsRedraw = true
      })

      if (needsRedraw) drawLetters()
    }

    // `time` comes from requestAnimationFrame, so no impure clock read during render
    const animate = (time: number) => {
      if (time - lastGlitchTime >= glitchSpeed) {
        updateLetters()
        drawLetters()
        lastGlitchTime = time
      }

      if (smooth) handleSmoothTransitions()

      animationId = requestAnimationFrame(animate)
    }

    resizeCanvas()
    animationId = requestAnimationFrame(animate)

    let resizeTimeout: ReturnType<typeof setTimeout>

    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        cancelAnimationFrame(animationId)
        resizeCanvas()
        animationId = requestAnimationFrame(animate)
      }, 100)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationId)
      clearTimeout(resizeTimeout)
      window.removeEventListener('resize', handleResize)
    }
  }, [characters, colorsKey, glitchSpeed, smooth])

  return (
    <div style={containerStyle} className={className}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {outerVignette && <div style={outerVignetteStyle} />}
      {centerVignette && <div style={centerVignetteStyle} />}
    </div>
  )
}

export default LetterGlitch
