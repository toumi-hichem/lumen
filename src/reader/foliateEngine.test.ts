import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { FoliateEngine } from './foliateEngine'

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

const OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:test-book</dc:identifier>
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`

const NAV = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Nav</title></head>
  <body>
    <nav epub:type="toc">
      <ol><li><a href="ch1.xhtml">Chapter One</a></li></ol>
    </nav>
  </body>
</html>`

const CH1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter One</title></head>
  <body><p>Hello foliate world.</p></body>
</html>`

function makeEpub(): ArrayBuffer {
  const zipped = zipSync(
    {
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(CONTAINER),
      'OEBPS/content.opf': strToU8(OPF),
      'OEBPS/nav.xhtml': strToU8(NAV),
      'OEBPS/ch1.xhtml': strToU8(CH1),
    },
    { level: 0 },
  )
  return zipped.buffer.slice(0) as ArrayBuffer
}

describe('FoliateEngine', () => {
  it('opens an EPUB and exposes its table of contents', async () => {
    const engine = new FoliateEngine('epub')
    await engine.open(makeEpub())
    const toc = await engine.toc()
    expect(toc).toHaveLength(1)
    expect(toc[0].label).toBe('Chapter One')
    expect(toc[0].href).toContain('ch1.xhtml')
    engine.destroy()
  })
})
