import { motion } from 'framer-motion'

interface GlitchTextProps {
  text: string
  className?: string
}

export function GlitchText({ text, className }: GlitchTextProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <motion.span
        className="relative z-10 block"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {text}
      </motion.span>

      {/* Glitch Layer 1 (Red/Cyan Offset) */}
      <motion.span
        className="absolute left-0 top-0 -z-10 block w-full text-red-500 opacity-70 mix-blend-screen"
        initial={{ x: 0 }}
        animate={{
          x: [0, -2, 2, -1, 0],
          clipPath: [
            'inset(0 0 0 0)',
            'inset(10% 0 10% 0)',
            'inset(40% 0 40% 0)',
            'inset(80% 0 5% 0)',
            'inset(0 0 0 0)',
          ],
        }}
        transition={{
          repeat: Infinity,
          repeatType: 'mirror',
          duration: 2,
          ease: 'easeInOut',
          repeatDelay: 3,
        }}
      >
        {text}
      </motion.span>

      {/* Glitch Layer 2 (Blue/Magenta Offset) */}
      <motion.span
        className="absolute left-0 top-0 -z-10 block w-full text-blue-500 opacity-70 mix-blend-screen"
        initial={{ x: 0 }}
        animate={{
          x: [0, 2, -2, 1, 0],
          clipPath: [
            'inset(0 0 0 0)',
            'inset(15% 0 50% 0)',
            'inset(60% 0 10% 0)',
            'inset(20% 0 60% 0)',
            'inset(0 0 0 0)',
          ],
        }}
        transition={{
          repeat: Infinity,
          repeatType: 'mirror',
          duration: 2.5,
          ease: 'easeInOut',
          repeatDelay: 2,
        }}
      >
        {text}
      </motion.span>
    </div>
  )
}
