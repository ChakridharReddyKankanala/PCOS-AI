import Container from '../components/Container'
import PageHero from '../components/PageHero'
import { ArrowIcon } from '../components/visuals/Icons'
import ReadoutTracks from '../components/ReadoutTracks'
import FeatureInfluence from '../components/FeatureInfluence'
import ScanImage from '../components/visuals/ScanImage'
import { primaryBtn, secondaryBtn } from '../components/buttons'
import { SAMPLE_IMPORTANCE, SAMPLE_ROWS } from '../content/sample'
import { Link } from '../lib/router'

export default function Home() {
  return (
    <>
      <PageHero
        page="home"
        size="tall"
        tag="Ultrasound • Clinical data • Research estimate"
        title="A PCOS screening from two kinds of evidence"
        actions={
          <>
            <Link to="/screen" className={primaryBtn}>
              Start a screening
              <ArrowIcon />
            </Link>
            <Link to="/how-it-works" className={secondaryBtn}>
              How it works
            </Link>
          </>
        }
      >
        This research prototype analyzes an ultrasound image and clinical markers separately, then averages the available
        results into one estimate.
      </PageHero>

      <section className="border-t border-line bg-paper py-20">
        <Container>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold sm:text-4xl">Two models, one estimate</h2>
          <div className="mt-12 grid gap-14 lg:grid-cols-3 lg:gap-10">
            <div>
              <div className="lg:h-[19.5rem]">
                <ScanImage slot="example" follicles={12} seed={3} peripheral caption={false} />
              </div>
              <h3 className="mt-6 text-xl font-semibold">It reads the scan</h3>
              <p className="mt-2 max-w-[44ch] text-ink-2">
                EfficientNet-B0 with gated attention estimates a probability from the image.
              </p>
            </div>
            <div>
              <div className="lg:h-[19.5rem]">
                <FeatureInfluence rows={SAMPLE_IMPORTANCE} heading={false} limit={5} />
              </div>
              <h3 className="mt-6 text-xl font-semibold">It reads clinical markers</h3>
              <p className="mt-2 max-w-[44ch] text-ink-2">
                A Random Forest uses the clinical values you enter. All required values must be present for an estimate.
              </p>
            </div>
            <div>
              <div className="lg:h-[19.5rem]">
                <ReadoutTracks rows={SAMPLE_ROWS} compact className="mt-0" />
              </div>
              <h3 className="mt-6 text-xl font-semibold">It combines the results</h3>
              <p className="mt-2 max-w-[44ch] text-ink-2">
                When both results are available, their probabilities are averaged with equal weight.
              </p>
            </div>
          </div>
          <p className="mt-10 text-sm text-ink-3">Every visual in this section is an example, not output from a trained model.</p>
        </Container>
      </section>

      <section className="bg-sono py-20 text-sono-ink">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold text-white sm:text-4xl">
              What polycystic ovaries can look like on ultrasound
            </h2>
            <p className="mt-4 text-lg text-sono-dim">
              Polycystic ovaries tend to show many small follicles, often along the edge of the ovary. A typical ovary has
              fewer, at different sizes.
            </p>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div className="[&_figcaption]:text-sono-dim">
              <ScanImage slot="typical" follicles={5} seed={23} />
            </div>
            <div className="[&_figcaption]:text-sono-dim">
              <ScanImage slot="pcom" follicles={17} seed={11} peripheral />
            </div>
          </div>
          <p className="mt-8">
            <a href="#/about" className="font-semibold text-beam underline underline-offset-4 hover:text-white">
              Learn how PCOS is diagnosed
            </a>
          </p>
        </Container>
      </section>

      <Container className="py-20">
        <div className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold sm:text-4xl">Ready to run a screening?</h2>
          <p className="mt-4 text-lg text-ink-2">
            Create an account, add a scan, enter clinical values and keep the result as a PDF report.
          </p>
          <Link to="/screen" className={`${primaryBtn} mt-8`}>
            Open the screening tool
          </Link>
        </div>
      </Container>
    </>
  )
}
