declare module 'foliate-js/mobi.js' {
  export interface MobiSection {
    createDocument(): Promise<Document>
  }
  export interface MobiBook {
    sections?: MobiSection[]
    metadata?: Record<string, unknown>
    toc?: unknown
    getCover?: () => Promise<Blob | null>
  }
  export const isMOBI: (file: Blob) => Promise<boolean>
  export class MOBI {
    constructor(options: { unzlib: (data: Uint8Array) => Uint8Array })
    open(file: Blob): Promise<MobiBook>
  }
}
