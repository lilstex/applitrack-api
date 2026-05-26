import { BadRequestException } from '@nestjs/common';

const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const PDF_EOF_MARKER = Buffer.from('%%EOF', 'ascii');

export function assertIsPdf(
  buffer: Buffer | undefined,
  opts: { maxSizeBytes?: number } = {},
): void {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Empty file');
  }

  const max = opts.maxSizeBytes ?? 5 * 1024 * 1024;
  if (buffer.length > max) {
    throw new BadRequestException('File too large');
  }

  if (buffer.length < 67) {
    throw new BadRequestException('File is not a valid PDF (too small)');
  }

  const head = buffer.subarray(0, PDF_HEADER.length);
  if (!head.equals(PDF_HEADER)) {
    throw new BadRequestException('File is not a valid PDF (header mismatch)');
  }

  const tailStart = Math.max(0, buffer.length - 1024);
  const tail = buffer.subarray(tailStart);
  if (tail.indexOf(PDF_EOF_MARKER) === -1) {
    throw new BadRequestException(
      'File is not a valid PDF (missing EOF marker)',
    );
  }
}
