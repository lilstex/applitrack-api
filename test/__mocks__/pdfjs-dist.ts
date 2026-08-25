// Jest manual mock for 'pdfjs-dist' (see moduleNameMapper in package.json:
// "^pdfjs-dist/.*$" -> this file). The real 'pdfjs-dist/legacy/build/pdf.mjs'
// is an ESM module built for browser/worker environments and isn't practical
// to load under ts-jest. None of this repo's service-level tests exercise
// real PDF text extraction — they only care about what happens to the text
// once it reaches OpenAI (see openai.service.spec.ts). This mock returns a
// single page of fixed, non-empty text for any PDF buffer it's handed, which
// is enough for OpenAIService#extractDataFromPdf to proceed past its
// "empty PDF" guard and call the (also mocked) OpenAI client.

export function getDocument() {
  return {
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [{ str: 'Mock resume text extracted from PDF fixture.' }],
        }),
      }),
    }),
  };
}
