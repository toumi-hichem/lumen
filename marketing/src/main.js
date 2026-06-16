import './style.css'
import { allThemesTs, themeToTs, themes } from './themes.js'

const FEATURES = [
  { t: 'Universal formats', d: 'EPUB, MOBI, AZW3, PDF and plain text open in one place — no converting, no per-format apps.', i: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>' },
  { t: 'On-device read-aloud', d: 'Supertonic neural text-to-speech runs fully offline. No cloud round-trip, no latency, no listening in.', i: '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>' },
  { t: 'Read-along highlighting', d: 'The sentence being spoken lights up as you listen, so your eyes never lose the line.', i: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>' },
  { t: 'Bookmarks, highlights & notes', d: 'Mark passages in five colors and keep your notes beside the text where you left them.', i: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>' },
  { t: 'Modular themes & fonts', d: 'Ten reading themes and adjustable typography, swappable in a tap and driven by tokens.', i: '<circle cx="12" cy="12" r="10"/>' },
  { t: 'Reading stats', d: 'Time read, pages turned and streaks — all measured on device, for your eyes only.', i: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>' },
  { t: 'Full library backup', d: 'Export and restore your entire library, highlights and progress in a single portable file.', i: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>' },
  { t: 'Installable PWA', d: 'Install Lumen straight from the browser. It behaves like a native app and works offline.', i: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>' },
]

const PRIVACY = [
  'No account required.',
  'No tracking, no analytics.',
  'Read-aloud runs offline.',
  'Your library backs up to a file you control.',
]

const el = (html) => {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}

function strokeIcon(paths, size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

function renderFeatures() {
  const grid = document.getElementById('featureGrid')
  for (const f of FEATURES) {
    grid.appendChild(
      el(`<div class="feature-card"><div class="ico">${strokeIcon(f.i)}</div><h3>${f.t}</h3><p>${f.d}</p></div>`),
    )
  }
}

function renderPrivacy() {
  const wrap = document.getElementById('privacyPoints')
  const check = strokeIcon('<path d="M20 6 9 17l-5-5"/>', 18)
  for (const p of PRIVACY) {
    wrap.appendChild(el(`<div class="pt"><span class="ck">${check}</span><span class="t">${p}</span></div>`))
  }
}

async function copyText(text, btn, label) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* clipboard unavailable */
  }
  const prev = btn.textContent
  btn.textContent = 'Copied'
  setTimeout(() => {
    btn.textContent = label ?? prev
  }, 1600)
}

function renderThemes() {
  const grid = document.getElementById('themeGrid')
  const swatchKeys = [
    ['Yellow', 'yellow'],
    ['Green', 'green'],
    ['Blue', 'blue'],
    ['Pink', 'pink'],
    ['Purple', 'purple'],
  ]
  for (const t of themes) {
    const c = t.tokens.color
    const r = t.tokens.reader
    const h = t.tokens.highlight
    const swatches = swatchKeys
      .map(
        ([label, key]) =>
          `<div class="sw"><div class="chip" style="background:${h[key]};border:1px solid ${c.border}"></div><div class="k">${label}</div></div>`,
      )
      .join('')

    const card = el(`
      <div class="theme-card">
        <div class="head">
          <div>
            <div style="display:flex;align-items:center;gap:9px">
              <h3>${t.name}</h3>
              <span class="mode">${t.mode === 'dark' ? 'Dark' : 'Light'}</span>
            </div>
            <p class="desc">${t.desc}</p>
          </div>
          <button class="copy-btn" data-copy>Copy TS</button>
        </div>
        <div class="tmock" style="border:1px solid ${c.border};background:${r.pageBackground}">
          <div class="tmock-top" style="background:${c.surfaceAlt};border-bottom:1px solid ${c.border}">
            <span class="l" style="color:${c.textMuted}">Chapter One</span>
            <span class="r" style="color:${c.textMuted}">Aa</span>
          </div>
          <div class="tmock-body">
            <div class="chap" style="color:${r.pageText}">First Impressions</div>
            <p style="color:${r.pageText}">It is a truth universally acknowledged, that a single man in possession of <span style="background:${h.yellow};padding:0 2px;border-radius:3px">a good fortune</span>, must be in want of a wife. <span style="background:${r.readalongBackground};border-radius:3px">However little known the feelings of such a man may be, this truth is so well fixed in the minds of the surrounding families.</span> Read on in the <a style="color:${r.pageLink};text-decoration:underline">first chapter</a>.</p>
            <div class="sel" style="color:${r.pageText}">Selection <span style="background:${r.selectionBackground};border-radius:3px">looks like this</span>.</div>
          </div>
          <div class="tmock-tool" style="background:${c.surfaceAlt};border-top:1px solid ${c.border}">
            <span class="play" style="background:${c.primary}"><svg width="11" height="11" viewBox="0 0 24 24" fill="${c.onPrimary}"><path d="M8 5v14l11-7z"/></svg></span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${c.textMuted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>
            <div class="bar" style="background:${c.border}"><span style="width:44%;background:${c.accent}"></span></div>
            <span style="font-family:var(--f-mono);font-size:9px;color:${c.textMuted}">44%</span>
          </div>
        </div>
        <div class="swatches">${swatches}</div>
        <details class="ts">
          <summary>View Theme object</summary>
          <pre></pre>
        </details>
      </div>
    `)

    const ts = themeToTs(t)
    card.querySelector('details pre').textContent = ts
    const btn = card.querySelector('[data-copy]')
    btn.addEventListener('click', () => copyText(ts, btn, 'Copy TS'))
    grid.appendChild(card)
  }

  const fullTs = allThemesTs()
  document.getElementById('fullTs').textContent = fullTs
  const copyAll = document.getElementById('copyAll')
  copyAll.addEventListener('click', () => copyText(fullTs, copyAll, 'Copy themes.ts'))
}

function setupToggle() {
  const root = document.documentElement
  const btn = document.getElementById('modeToggle')
  const label = document.getElementById('toggleLabel')
  const sync = () => {
    const dark = root.getAttribute('data-mode') === 'dark'
    label.textContent = dark ? 'Light' : 'Dark'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#11151b' : '#f6f7f9')
  }
  btn.addEventListener('click', () => {
    const dark = root.getAttribute('data-mode') === 'dark'
    root.setAttribute('data-mode', dark ? 'light' : 'dark')
    sync()
  })
  sync()
}

renderFeatures()
renderPrivacy()
renderThemes()
setupToggle()
