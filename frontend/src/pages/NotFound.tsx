import { ArrowLink, Headline } from '@/components/ui'

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[1280px] px-5 pb-10 pt-44 md:px-10">
      <Headline parts={[{ t: 'This page was' }, { t: 'reverted.', em: true }]} className="display-type text-[clamp(3rem,8vw,6.5rem)]" />
      <p className="mt-6 max-w-md text-lg text-soft">Nothing lives at this address. Funds are safe.</p>
      <ArrowLink to="/" className="mt-8">Back to start</ArrowLink>
    </section>
  )
}
