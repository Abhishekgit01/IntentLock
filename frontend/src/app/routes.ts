import { createBrowserRouter } from 'react-router'
import Root from './Root'
import Home from '@/pages/Home'
import Demo from '@/pages/Demo'
import Verifiers from '@/pages/Verifiers'
import Lifecycle from '@/pages/Lifecycle'
import Evidence from '@/pages/Evidence'
import Threats from '@/pages/Threats'
import NotFound from '@/pages/NotFound'
import Onboard from '@/onboard/Onboard'

// The workbench is a full-screen page outside the shared layout, loaded on demand (three.js is large).
const workbench = { HydrateFallback: () => null, lazy: async () => ({ Component: (await import('@/workbench/WorkbenchShell')).default }) }

export const router = createBrowserRouter([
  { path: '/deepdive', ...workbench },
  { path: '/workbench', ...workbench },
  { path: '/onboard', Component: Onboard },
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: 'demo', Component: Demo },
      { path: 'verifiers', Component: Verifiers },
      { path: 'lifecycle', Component: Lifecycle },
      { path: 'evidence', Component: Evidence },
      { path: 'threats', Component: Threats },
      { path: '*', Component: NotFound },
    ],
  },
])
