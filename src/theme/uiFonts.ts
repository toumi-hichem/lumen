// Self-hosted brand and UI webfonts, bundled with the app rather than fetched
// from Google Fonts. Two reasons:
//   1. Offline-first: CDN fonts never load without a network, so the UI fell
//      back to system fonts whenever the device was offline.
//   2. Cross-origin isolation: enabling COOP/COEP (require-corp) so onnxruntime
//      can run multi-threaded blocks any cross-origin subresource without CORP.
//      Bundled fonts are same-origin and load cleanly under that policy.
//
// Latin subset only, limited to the weights the app actually uses, to keep the
// precached payload small. Spectral is the brand display serif and the default
// reader font, so its italics are included for ebook body text.
import '@fontsource/spectral/latin-300.css'
import '@fontsource/spectral/latin-400.css'
import '@fontsource/spectral/latin-400-italic.css'
import '@fontsource/spectral/latin-500.css'
import '@fontsource/spectral/latin-500-italic.css'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/spectral/latin-700.css'
import '@fontsource/hanken-grotesk/latin-400.css'
import '@fontsource/hanken-grotesk/latin-500.css'
import '@fontsource/hanken-grotesk/latin-600.css'
import '@fontsource/hanken-grotesk/latin-700.css'
import '@fontsource/hanken-grotesk/latin-800.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
