import { createFileRoute } from '@tanstack/react-router'
import {
  Cube,
  Graph,
  CalendarBlank,
  ArrowRight,
} from '@phosphor-icons/react'
import { DecodeText } from '@nxus/ui'
import { motion } from 'framer-motion'
import { miniApps } from '@/config/mini-apps'
import type { MiniApp } from '@/config/mini-apps'
import { ParticleGrid } from '@/components/particle-grid'

export const Route = createFileRoute('/')({
  component: GatewayPage,
})

const iconMap = {
  cube: Cube,
  graph: Graph,
  calendar: CalendarBlank,
} as const

/* --- Framer Motion Variants --- */

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.3,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 260,
      damping: 24,
    },
  },
}

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
}

/* --- Mini-App Card --- */

function MiniAppCard({ app }: { app: MiniApp }) {
  const Icon = iconMap[app.icon]

  return (
    <motion.a
      href={app.path}
      className="group block no-underline"
      variants={cardVariants}
    >
      <div className="gateway-holo-card h-full rounded-2xl bg-card p-5 relative z-10">
        {/* Card content sits above the ::before / ::after pseudo-elements */}
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div className="gateway-icon-box flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon size={24} weight="duotone" />
            </div>
            <div className="flex items-center gap-2">
              <div className="gateway-status-dot" title="Online" />
              <ArrowRight
                size={16}
                weight="bold"
                className="text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5"
              />
            </div>
          </div>

          <h3 className="mt-4 text-base font-semibold text-card-foreground">
            {app.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {app.description}
          </p>
        </div>
      </div>
    </motion.a>
  )
}

/* --- Gateway Page --- */

function GatewayPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Animated particle grid background */}
      <ParticleGrid />

      {/* Corner accent orbs */}
      <div className="gateway-corner-accent gateway-corner-accent--top-left" />
      <div className="gateway-corner-accent gateway-corner-accent--bottom-right" />
      <div className="gateway-corner-accent gateway-corner-accent--top-right" />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-2xl px-8 py-16">
        {/* Hero section */}
        <motion.div
          className="text-center space-y-3 mb-12"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.15 } },
          }}
        >
          {/* Title with decode effect */}
          <motion.div variants={fadeInUp}>
            <DecodeText
              text="nXus"
              className="text-4xl font-bold tracking-tight inline-block"
              duration={1800}
            />
            {/* Animated underline */}
            <div className="gateway-title-underline mx-auto w-24" />
          </motion.div>

          {/* Subtitle */}
          <motion.p
            className="text-sm text-muted-foreground"
            variants={fadeInUp}
          >
            Select a node to launch.
          </motion.p>
        </motion.div>

        {/* Connection line from hero to grid */}
        <div className="gateway-connection-line h-8" />

        {/* Card grid with staggered entrance */}
        <motion.div
          className="grid gap-5 sm:grid-cols-2"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {miniApps.map((app) => (
            <MiniAppCard key={app.id} app={app} />
          ))}
        </motion.div>
      </div>
    </div>
  )
}
