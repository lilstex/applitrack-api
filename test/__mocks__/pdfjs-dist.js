// Jest mock for pdfjs-dist (ESM-only package, cannot load in CJS test env)
module.exports = {
  getDocument: jest.fn(),
};
