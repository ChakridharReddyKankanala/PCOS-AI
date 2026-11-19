// Pictures used across the site.
//
// Each page has its own banner photo in public/images/. A photo is shown near its real size on the
// right and faded out toward the headline on the left, so the best photos have the subject on the
// right and calm space on the left. To change one, replace the file (3:2 landscape, 1920 px wide or
// more, no readable text or logos) or point `src` at another file. Only use images you have the right
// to publish.
//
// Crop settings (all optional):
//   h      photo height as a multiple of the banner height (1 = fits exactly, 1.5 = zoomed in)
//   top    how far the photo is shifted up when zoomed (0 = top edge aligned, 1 = bottom edge aligned)
//   shift  how much of the photo's width is pushed off the right edge (0 to 0.3 is typical)
// `ratio` is the photo's width divided by its height.

const photo = (file) => `${import.meta.env.BASE_URL}images/${file}`

export const HERO = {
  home: { src: photo('consultation.jpg'), ratio: 2048 / 1366, h: 1, top: 0, shift: 0 },
  screen: { src: photo('screen.jpg'), ratio: 1264 / 848, h: 1.1, top: 0.35, shift: 0 },
  about: { src: photo('about.jpg'), ratio: 1264 / 848, h: 1.1, top: 0.2, shift: 0 },
  how: { src: photo('how.jpg'), ratio: 1264 / 848, h: 1.12, top: 0.1, shift: 0 },
  // Shown as a rounded picture beside the sign-in form. `position` is the CSS background-position.
  signin: { src: photo('signin.jpg'), position: '60% 50%' },
}

// Small illustrations. By default each slot shows an original synthetic picture drawn in the
// browser, so the site needs no image files. To use a real image, copy it into public/images/ and
// set `src`, for example:
//   typical: { src: '/images/typical-ovary.jpg', credit: 'Image: your dataset, used with permission', ... }
// Clinical scans need consent or proper de-identification before they are published.

export const IMAGES = {
  example: {
    src: null,
    alt: 'Illustration of an ultrasound of an ovary',
    generatedCaption: 'Synthetic ultrasound, for illustration.',
    credit: '',
  },
  typical: {
    src: null,
    alt: 'Ultrasound of an ovary with a few follicles of different sizes',
    generatedCaption: 'Synthetic ultrasound, typical ovary.',
    credit: '',
  },
  pcom: {
    src: null,
    alt: 'Ultrasound of an ovary with many small follicles lined up near its edge',
    generatedCaption: 'Synthetic ultrasound, polycystic morphology.',
    credit: '',
  },
}
