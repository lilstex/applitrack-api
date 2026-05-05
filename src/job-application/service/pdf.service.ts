import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as ejs from 'ejs';
import * as path from 'path';

type ResumeTemplate =
  | 'modern'
  | 'corporate'
  | 'minimal'
  | 'editorial'
  | 'executive';

const VALID_TEMPLATES: ResumeTemplate[] = [
  'modern',
  'corporate',
  'minimal',
  'editorial',
  'executive',
];

@Injectable()
export class PdfService {
  private get launchOptions(): puppeteer.LaunchOptions {
    return {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    };
  }

  private viewsPath(): string {
    return path.join(__dirname, '../../views');
  }

  private async renderTemplate(
    templateName: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const templatePath = path.join(this.viewsPath(), `${templateName}.ejs`);
    return ejs.renderFile(templatePath, data);
  }

  private async htmlToPdf(
    html: string,
    options: {
      footer?: boolean;
      margins?: puppeteer.PDFOptions['margin'];
    } = {},
  ): Promise<Buffer> {
    const browser = await puppeteer.launch(this.launchOptions);
    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
      });

      // Ensure web fonts are fully loaded before rendering
      await page.evaluateHandle('document.fonts.ready');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: options.footer ?? false,
        headerTemplate: '<div></div>',
        footerTemplate: options.footer
          ? `<div style="
              font-family: 'Inter', sans-serif;
              font-size: 9px;
              width: 100%;
              display: flex;
              justify-content: space-between;
              padding: 0 48px;
              color: #94a3b8;
              border-top: 1px solid #f1f5f9;
              padding-top: 5px;
            ">
              <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
            </div>`
          : '<div></div>',
        margin: options.margins ?? {
          top: '0px',
          right: '0px',
          bottom: '0px',
          left: '0px',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  async generateCvPdf(
    data: Record<string, unknown>,
    profile: any,
    template: string = 'modern',
  ): Promise<Buffer> {
    // Sanitise template selection
    const resolvedTemplate: ResumeTemplate = VALID_TEMPLATES.includes(
      template as ResumeTemplate,
    )
      ? (template as ResumeTemplate)
      : 'modern';

    try {
      const html = await this.renderTemplate(resolvedTemplate, {
        ai: data,
        user: profile,
        template: resolvedTemplate,
      });

      return this.htmlToPdf(html, {
        footer: true,
        margins: { top: '0px', right: '0px', bottom: '24px', left: '0px' },
      });
    } catch (error) {
      console.error(
        `CV generation failed (template="${resolvedTemplate}"):`,
        error,
      );
      throw new InternalServerErrorException('Could not generate CV PDF');
    }
  }

  // Generate cover letter PDF
  async generateCoverLetterPdf(
    coverLetter: string,
    profile: any,
    companyName: string,
    jobTitle: string,
  ): Promise<Buffer> {
    try {
      const html = await this.renderTemplate('cover-letter', {
        coverLetter,
        user: profile,
        companyName,
        jobTitle,
      });

      return this.htmlToPdf(html, {
        footer: false,
        margins: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
    } catch (error) {
      console.error('Cover letter generation failed:', error);
      throw new InternalServerErrorException(
        'Could not generate cover letter PDF',
      );
    }
  }
}
