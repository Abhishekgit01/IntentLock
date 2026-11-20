import { Eye, ShieldCheck, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { THREATS } from '@/lib/data'
import { PageHeader, Reveal } from '@/components/ui'

const COLS = [
  { key: 'prevented', label: 'Prevented', Icon: ShieldCheck, tone: 'text-ok', chip: 'bg-ok/12 border-ok' },
  { key: 'detected', label: 'Detected', Icon: Eye, tone: 'text-flame-deep', chip: 'bg-flame/15 border-flame-deep' },
  { key: 'accepted', label: 'Accepted', Icon: TriangleAlert, tone: 'text-bad', chip: 'bg-bad/10 border-bad' },
] as const

export default function Threats() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-10 md:px-10">
      <PageHeader index="06" label="Threat model" parts={[{ t: 'What it stops. What it' }, { t: 'doesn’t.', em: true }]}>
        Four places an attack can start, and what the guard does about each. Accepted risks are listed in the open.
      </PageHeader>
      <Reveal>
        <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label="Threat model matrix">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <caption className="sr-only">Threat model: four attack surfaces against whether the risk is prevented, detected or accepted.</caption>
            <thead>
              <tr className="border-b-2 border-edge">
                <th scope="col" className="w-[26%] px-6 py-4 font-mono text-xs font-medium uppercase tracking-wider text-soft">Attack surface</th>
                {COLS.map((c) => (
                  <th key={c.key} scope="col" className="px-5 py-4">
                    <span className={`flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider ${c.tone}`}>
                      <c.Icon className="size-4" aria-hidden />
                      {c.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {THREATS.map((t, ri) => (
                <motion.tr key={t.id} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -10% 0px' }} transition={{ delay: ri * 0.08, duration: 0.55 }} className="group border-b border-line align-top transition-colors last:border-0 hover:bg-sand/50">
                  <th scope="row" className="px-6 py-6 font-normal">
                    <span className="block font-display text-3xl font-extrabold uppercase">{t.title}</span>
                    <span className="mt-1 block text-sm text-soft">{t.vector}</span>
                  </th>
                  {COLS.map((c) => {
                    const text = t[c.key]
                    return (
                      <td key={c.key} className="border-l border-line px-5 py-6">
                        {text ? (
                          <motion.p whileHover={{ y: -3 }} className={`rounded-2xl border-2 p-3.5 text-[15px] leading-snug ${c.chip}`}>
                            <c.Icon className={`mb-2 size-5 ${c.tone}`} aria-hidden />
                            <span className="sr-only">{c.label}: </span>
                            {text}
                          </motion.p>
                        ) : (
                          <p className="px-3.5 font-mono text-soft" aria-label={`Not ${c.label.toLowerCase()}`}>—</p>
                        )}
                      </td>
                    )
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  )
}
