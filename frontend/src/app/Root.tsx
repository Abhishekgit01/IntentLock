import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowUpRight, LockKeyhole, Menu, Moon, Play, Sun, X } from 'lucide-react'
import { IntentLockProvider, useIntentLock } from '@/lib/useIntentLockEvents'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { runAttackFromAnywhere } from '@/lib/actions'
import { SCRIPTS } from '@/lib/script'
import { InkFilters, Marquee, fmtClock } from '@/components/ui'

export const PAGES = [
  { to: '/', label: 'Home', end: true },
  { to: '/demo', label: 'Live demo' },
  { to: '/verifiers', label: 'Verifiers' },
  { to: '/lifecycle', label: 'Lifecycle' },
  { to: '/evidence', label: 'Evidence' },
  { to: '/threats', label: 'Threat model' },
]

function Nav() {
  const { state, run } = useIntentLock()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  const running = state.status === 'running'
  const progress = state.status === 'idle' ? 0 : (state.elapsedMs / state.durationMs) * 100

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
      className="fixed inset-x-0 top-4 z-50 px-4"
    >
      <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-full border-2 border-edge bg-paper/90 backdrop-blur-md">
        <nav aria-label="Pages" className="flex items-center gap-2 py-2 pl-3 pr-2">
          <Link to="/" className="flex shrink-0 items-center gap-2.5 rounded-full pr-3" aria-label="IntentLock home">
            <motion.span whileHover={{ rotate: -12, scale: 1.1 }} className="grid size-10 place-items-center rounded-full bg-flame text-on-flame">
              <LockKeyhole className="size-5" aria-hidden />
            </motion.span>
            <span className="hidden font-display text-xl font-extrabold uppercase tracking-tight sm:block">IntentLock</span>
          </Link>
          <ul className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {PAGES.map((p) => (
              <li key={p.to}>
                <NavLink to={p.to} end={p.end} className="relative block rounded-full px-4 py-2 text-[15px] font-semibold">
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-flame" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />
                      )}
                      <span className={`relative ${isActive ? 'text-on-flame' : 'text-soft hover:text-ink'}`}>{p.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <button
              type="button"
              onClick={toggle}
              aria-label={isDark ? 'Switch to light cream mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="grid size-10 place-items-center rounded-full border border-edge bg-sand text-ink transition-colors hover:border-flame hover:text-flame-deep"
            >
              {isDark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </button>
            <button type="button" className="btn btn-dark btn-sm !px-4 !py-2.5" onClick={() => runAttackFromAnywhere(run, navigate)}>
              <Play className="size-4" aria-hidden fill="currentColor" />
              {running && state.scenario === 'attack' ? 'Replay attack' : 'Run the attack'}
            </button>
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full border-2 border-edge lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </nav>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              id="mobile-menu"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden border-t border-edge lg:hidden"
            >
              {PAGES.map((p, i) => (
                <motion.li key={p.to} initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.04 }}>
                  <NavLink to={p.to} end={p.end} className={({ isActive }) => `block px-6 py-3 font-display text-lg font-bold uppercase ${isActive ? 'bg-flame text-on-flame' : ''}`}>
                    {p.label}
                  </NavLink>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-transparent">
          <div className="h-full bg-flame transition-[width] duration-100 ease-linear" style={{ width: `${progress}%`, opacity: running ? 1 : 0 }} />
        </div>
      </div>
    </motion.header>
  )
}

/** Floating run indicator so the sequence stays visible while browsing other pages. */
function RunDock() {
  const { state } = useIntentLock()
  const { pathname } = useLocation()
  const show = state.status === 'running' && pathname !== '/demo'
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="fixed bottom-5 right-5 z-50 w-[min(360px,calc(100vw-2.5rem))]"
        >
          <Link to="/demo" className="block rounded-3xl border-2 border-edge bg-flame p-4 text-on-flame">
            <span className="flex items-center justify-between font-mono text-xs font-bold uppercase tracking-wider">
              <span className="flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-on-flame" aria-hidden />Running · {SCRIPTS[state.scenario].tabLabel}</span>
              <span className="tabular-nums">T+{fmtClock(state.elapsedMs)}</span>
            </span>
            <span className="mt-2 block font-display text-lg font-bold leading-snug">{state.caption}</span>
            <span className="mt-2 flex items-center gap-1 text-sm font-semibold">Watch live <ArrowUpRight className="size-4" aria-hidden /></span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Footer() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-contrast text-on-contrast">
      <Marquee items={['Clear signing advises', 'The guard enforces', '2 of 3 independent verifiers', 'No attestation, no execution', 'Verify offline']} className="border-b border-on-contrast/15 py-5 font-display text-2xl font-bold uppercase tracking-tight md:text-3xl" />
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-8 px-5 py-14 md:px-10">
        <div>
          <p className="display-type text-[clamp(3rem,9vw,7.5rem)]">IntentLock<span className="text-flame">.</span></p>
          <p className="mt-5 max-w-md text-on-contrast/70">A hackathon demo. No chain is connected; every event is scripted behind one hook, <code className="font-mono text-flame">useIntentLockEvents()</code>.</p>
        </div>
        <ul className="grid grid-cols-2 gap-x-10 gap-y-2 font-display text-lg font-bold uppercase">
          {PAGES.map((p) => (
            <li key={p.to}><Link to={p.to} className="underline-offset-4 hover:text-flame hover:underline">{p.label}</Link></li>
          ))}
        </ul>
      </div>
      <p className="mx-auto max-w-[1280px] px-5 pb-8 font-mono text-xs text-on-contrast/60 md:px-10">Diagrams: React Flow, visx Sankey, Recharts.</p>
    </footer>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Orange curtain that wipes away on every route change. */
function Curtain() {
  const { pathname } = useLocation()
  return (
    <motion.div
      key={pathname}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] origin-top bg-flame"
      initial={{ scaleY: 1 }}
      animate={{ scaleY: 0 }}
      transition={{ duration: 0.65, ease: [0.7, 0, 0.2, 1] }}
    />
  )
}

export default function Root() {
  const { pathname } = useLocation()
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <IntentLockProvider>
          <InkFilters />
          <ScrollToTop />
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-flame focus:px-5 focus:py-2.5 focus:font-semibold focus:text-on-flame">
            Skip to content
          </a>
          <Nav />
          <Curtain />
          <motion.main key={pathname} id="main" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
            <Outlet />
          </motion.main>
          <Footer />
          <RunDock />
        </IntentLockProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}
