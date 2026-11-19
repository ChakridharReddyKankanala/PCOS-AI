import Container from '../components/Container'
import PageHero from '../components/PageHero'
import FeatureInfluence from '../components/FeatureInfluence'
import ReadoutTracks from '../components/ReadoutTracks'
import Pipeline from '../components/visuals/Pipeline'
import ScanImage from '../components/visuals/ScanImage'
import { primaryBtn } from '../components/buttons'
import { SAMPLE_IMPORTANCE, SAMPLE_ROWS } from '../content/sample'
import { Link } from '../lib/router'

const PARTS = [
  {
    title: 'The ultrasound model',
    text: 'EfficientNet-B0 extracts image features and a gated-attention layer pools them before the classifier. The image model returns a two-class probability.',
  },
  {
    title: 'The clinical model',
    text: 'A Random Forest reads 41 clinical features, including follicle and endometrium measurements. All required form values must be provided; BMI and two ratios are calculated from their source values.',
  },
  { title: 'The combination', text: 'When both model probabilities are available, the server averages them equally. If only one is available, that result is used by itself.' },
]

const LIMITS = [
  'The 35 and 65 percent band edges are display settings in config.js. They have not been clinically validated.',
  'The clinical model returns no estimate when required values are missing. An ultrasound estimate requires an uploaded scan.',
  'SHAP values describe how clinical features affect this model result; Grad-CAM++ highlights image regions used by the image model. Neither establishes medical causation.',
  'Outputs are estimates for research. They are not a diagnosis.',
]

export default function How() {
  return (
    <>
      <PageHero page="how" tag="Model • Inputs • Limits" title="How the screening works">
        Ultrasound images and clinical markers are processed by separate models. When both results are available, they are
        averaged equally into one estimate.
      </PageHero>

      <section className="border-t border-line bg-paper py-20">
        <Container>
          <h2 className="text-3xl font-semibold">The pipeline</h2>
          <div className="mt-12">
            <Pipeline />
          </div>
        </Container>
      </section>

      <Container className="py-20">
        <div className="grid gap-12 md:grid-cols-3 md:gap-10">
          {PARTS.map((p) => (
            <div key={p.title}>
              <h3 className="text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 max-w-[44ch] text-ink-2">{p.text}</p>
            </div>
          ))}
        </div>
      </Container>

      <section className="bg-sono py-20 text-sono-ink">
        <Container>
          <h2 className="text-3xl font-semibold text-white">What you get back</h2>
          <p className="mt-3 max-w-[58ch] text-lg text-sono-dim">An example result, with the same pieces the screening page shows.</p>
          <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div className="[&_figcaption]:text-sono-dim">
              <ScanImage slot="example" follicles={12} seed={3} peripheral />
            </div>
            <div className="rounded-xl bg-paper p-6 text-ink sm:p-8">
              <ReadoutTracks rows={SAMPLE_ROWS} compact className="mt-0" />
              <div className="mt-8 border-t border-line pt-6">
                <FeatureInfluence rows={SAMPLE_IMPORTANCE} heading={false} limit={5} />
              </div>
            </div>
          </div>
          <p className="mt-8 text-sm text-sono-dim">These numbers are illustrative. They are not output from a trained model.</p>
        </Container>
      </section>

      <Container className="py-20">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <h2 className="text-3xl font-semibold">Limits to keep in mind</h2>
          <ul className="max-w-[62ch] list-disc space-y-3 pl-5 text-lg text-ink-2 marker:text-teal">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <Link to="/screen" className={`${primaryBtn} mt-12`}>
          Start a screening
        </Link>
      </Container>
    </>
  )
}
