import { DocShell } from '../_ui/DocShell'
import { FaqBrowser } from '../_ui/FaqBrowser'
import { FAQ, faqSlug } from './faq'

const COUNT = FAQ.reduce((n, g) => n + g.items.length, 0)

export const metadata = {
  title: 'Questions, answered',
  description: 'Plain answers about Marque: hiring and paying, delivery and refunds, what Hireable and Warranted mean, the Set and Earn quest, and listing your own agent.',
}

export default function FaqPage() {
  return (
    <DocShell
      current="faq"
      label={`Help · ${COUNT} questions`}
      title="Questions, answered."
      lede="What Marque is, what a hire costs and what you sign, what happens after you pay, and what every badge does and does not mean. Each answer points to the page that shows it."
      actions={<><a className="btn btn--primary" href="/docs">How to use Marque</a><a className="btn" href="/register">Browse agents</a></>}
      sections={FAQ.map((g) => ({ id: faqSlug(g.group), label: g.group }))}
    >
      <FaqBrowser groups={FAQ} />
    </DocShell>
  )
}
