import Container from '../components/Container'
import PageHero from '../components/PageHero'
import ScanImage from '../components/visuals/ScanImage'
import OvaryDiagram from '../components/visuals/OvaryDiagram'
import { CycleIcon, HormoneIcon, ScanIcon } from '../components/visuals/Icons'
import { textLink } from '../components/buttons'

const WHO = 'https://www.who.int/news-room/fact-sheets/detail/polycystic-ovary-syndrome'
const GUIDELINE = 'https://www.mja.com.au/journal/2024/221/7/summary-2023-international-evidence-based-guideline-assessment-and-management'

function External({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={textLink}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

const CRITERIA = [
  {
    Icon: CycleIcon,
    title: 'Irregular or absent periods',
    text: 'Cycles that are infrequent, unpredictable or missing, which points to ovulation not happening regularly.',
  },
  {
    Icon: HormoneIcon,
    title: 'Signs of high androgens',
    text: 'Excess facial or body hair, acne, oily skin or hair loss, or a raised testosterone level in a blood test.',
  },
  {
    Icon: ScanIcon,
    title: 'Polycystic ovaries',
    text: 'Seen on an ultrasound. In adults, a raised anti-Müllerian hormone (AMH) level can stand in for the ultrasound.',
  },
]

export default function About() {
  return (
    <>
      <PageHero page="about" tag="Overview • Diagnosis • Ultrasound" title="What PCOS is and how it is diagnosed">
        Polycystic ovary syndrome (PCOS) is a hormonal condition that affects the ovaries and the menstrual cycle. This
        page covers the basics the screening tool is built around.
      </PageHero>

      <section className="border-t border-line bg-paper py-20">
        <Container className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-3xl font-semibold">How common it is</h2>
            <p className="mt-4 max-w-[56ch] text-lg text-ink-2">
              The World Health Organization estimates that 10 to 13 percent of women of reproductive age have PCOS, and that up
              to 70 percent of them are undiagnosed. <External href={WHO}>WHO fact sheet</External>
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-semibold">What it can look like</h2>
            <ul className="mt-4 max-w-[56ch] list-disc space-y-1.5 pl-5 text-lg text-ink-2 marker:text-teal">
              <li>Irregular, infrequent or absent periods</li>
              <li>Excess facial or body hair</li>
              <li>Acne or oily skin</li>
              <li>Hair thinning</li>
              <li>Difficulty conceiving</li>
            </ul>
            <p className="mt-4 max-w-[56ch] text-ink-2">
              Symptoms vary and can change over time. Despite the name, ovarian cysts are not required for a diagnosis.
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-20">
        <h2 className="max-w-2xl text-balance text-3xl font-semibold sm:text-4xl">
          Diagnosis needs at least two of three features
        </h2>
        <p className="mt-4 max-w-[60ch] text-lg text-ink-2">
          A clinician looks for these once other causes have been ruled out. <External href={GUIDELINE}>2023 international guideline</External>
        </p>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {CRITERIA.map(({ Icon, title, text }) => (
            <div key={title}>
              <span className="grid h-14 w-14 place-items-center rounded-full bg-teal-tint text-teal-deep">
                <Icon />
              </span>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 max-w-[40ch] text-ink-2">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 max-w-[64ch] border-l-4 border-teal pl-4 text-ink-2">
          In this tool, a clinical model reads entered values such as cycle patterns, androgen signs, AMH and reported
          follicle measurements, while an image model analyzes an uploaded scan. Neither replaces a clinician weighing all
          diagnostic criteria.
        </p>
      </Container>

      <section className="bg-sono py-20 text-sono-ink">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold text-white sm:text-4xl">What the ultrasound shows</h2>
            <p className="mt-4 text-lg text-sono-dim">
              Each pair below is a synthetic scan and a diagram of the same idea. They are illustrations, not patient images.
            </p>
          </div>
          <div className="mt-12 grid gap-14 md:grid-cols-2 md:gap-10">
            <div>
              <h3 className="text-xl font-semibold text-white">Typical ovary</h3>
              <div className="mt-4 [&_figcaption]:hidden">
                <ScanImage slot="typical" follicles={5} seed={23} />
              </div>
              <div className="mx-auto mt-6 max-w-sm rounded-xl bg-paper p-4 text-ink">
                <OvaryDiagram variant="typical" />
              </div>
              <p className="mt-4 max-w-[48ch] text-sono-dim">
                A few follicles of different sizes, and sometimes one that has grown larger than the rest.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Polycystic morphology</h3>
              <div className="mt-4 [&_figcaption]:hidden">
                <ScanImage slot="pcom" follicles={17} seed={11} peripheral />
              </div>
              <div className="mx-auto mt-6 max-w-sm rounded-xl bg-paper p-4 text-ink">
                <OvaryDiagram variant="pcos" />
              </div>
              <p className="mt-4 max-w-[48ch] text-sono-dim">
                Many small follicles, often lined up near the edge of the ovary around denser tissue in the centre. The ovary
                can also be larger.
              </p>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-3xl font-semibold">Why combine imaging with clinical data</h2>
            <p className="mt-4 max-w-[56ch] text-lg text-ink-2">
              The scan shows the structure of the ovary. Hormone levels and symptoms show what is happening in the body.
              Clinicians weigh both, because either one alone can mislead. This project explores how a model can do the
              same.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-semibold">Sources</h2>
            <ul className="mt-4 space-y-2 text-lg">
              <li>
                <External href={WHO}>World Health Organization: Polycystic ovary syndrome</External>
              </li>
              <li>
                <External href={GUIDELINE}>Summary of the 2023 international evidence-based guideline, Medical Journal of Australia</External>
              </li>
            </ul>
          </div>
        </div>
      </Container>
    </>
  )
}
