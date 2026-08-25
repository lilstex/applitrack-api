import * as fs from 'fs';
import * as path from 'path';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OpenAIService } from './openai.service';
import { User } from 'src/user/schema/user.schema';

// The service constructs `new OpenAI(...)` in its own constructor, so we
// mock the whole 'openai' module. Every test that needs a specific AI
// response sets `mockParse.mockResolvedValueOnce(...)`.
const mockParse = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { parse: mockParse } },
  }));
});

describe('OpenAIService', () => {
  let service: OpenAIService;
  let userModel: { findByIdAndUpdate: jest.Mock };
  // Fresh per test: generateTailoredContent mutates `credits` and calls
  // `save()` on whatever profile it's given, so a shared/reused object
  // would leak state (and mock call history) across tests. Rebuilding this
  // in beforeEach means every test — including ones added by later tasks —
  // starts from the same known-good baseline without needing to remember to
  // defensively clone it.
  let baseProfile: any;

  beforeEach(async () => {
    mockParse.mockReset();
    userModel = { findByIdAndUpdate: jest.fn().mockResolvedValue(undefined) };
    baseProfile = {
      _id: 'user-1',
      credits: 100,
      save: jest.fn().mockResolvedValue(undefined),
      fullName: 'Emmanuel Mbagwu',
      workExperience: [],
      projects: [],
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OpenAIService,
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = moduleRef.get(OpenAIService);
  });

  describe('generateTailoredContent — baseline regression', () => {
    it('returns the parsed CV and charges credits', async () => {
      mockParse.mockResolvedValueOnce({
        choices: [{ message: { parsed: { professionalSummary: 'ok' } } }],
      });

      const result = await service.generateTailoredContent(
        baseProfile,
        'Backend Engineer role',
      );

      expect(result).toEqual({ professionalSummary: 'ok' });
      expect(baseProfile.credits).toBe(90); // COST_PER_CV default 10
    });

    it('refunds credits when the OpenAI call throws', async () => {
      mockParse.mockRejectedValueOnce(new Error('rate limited'));

      await expect(
        service.generateTailoredContent(baseProfile, 'Backend Engineer role'),
      ).rejects.toThrow('AI generation failed');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('user-1', {
        $inc: { credits: 10 },
      });
    });
  });

  describe('extractDataFromPdf — problem/company fields', () => {
    it('accepts null problem and company for a project with no such context', async () => {
      mockParse.mockResolvedValueOnce({
        choices: [
          {
            message: {
              parsed: {
                fullName: 'Emmanuel Mbagwu',
                phoneNumber: null,
                linkedinUrl: null,
                githubUrl: null,
                portfolioUrl: null,
                summary: 'Engineer',
                skills: [],
                workExperience: [],
                education: [],
                certifications: [],
                projects: [
                  {
                    name: 'Personal Site',
                    description: 'A portfolio site',
                    url: null,
                    techStack: [],
                    highlights: [],
                    problem: null,
                    company: null,
                  },
                ],
                languages: [],
                awards: [],
                volunteerWork: [],
              },
            },
          },
        ],
      });

      // A minimal valid single-page PDF buffer isn't practical to hand-craft
      // here; extractDataFromPdf's PDF parsing (pdfjs-dist) is not what this
      // test targets — it targets whether the parsed OpenAI response carrying
      // problem/company round-trips through the method's return value
      // untouched. Call the private prompt-independent path directly via the
      // public method with a real tiny PDF fixture instead:
      const fixturePath = path.join(
        __dirname,
        '../../../test/__fixtures__/minimal.pdf',
      );
      const buffer = fs.readFileSync(fixturePath);

      const result = await service.extractDataFromPdf(buffer);

      expect(result.projects?.[0]).toMatchObject({
        name: 'Personal Site',
        problem: null,
        company: null,
      });

      const sentFormat = JSON.stringify(
        mockParse.mock.calls[0][0].response_format,
      );
      expect(sentFormat).toContain('"problem"');
      expect(sentFormat).toContain('"company"');
    });
  });

  describe('generateTailoredContent — problem-solver framing prompt', () => {
    it('instructs the model to lead with the problem before the solution', async () => {
      mockParse.mockResolvedValueOnce({
        choices: [{ message: { parsed: { professionalSummary: 'ok' } } }],
      });

      await service.generateTailoredContent(
        baseProfile,
        'Backend Engineer role',
      );

      const sentPrompt = mockParse.mock.calls[0][0].messages[1]
        .content as string;
      expect(sentPrompt).toContain('# PROBLEM-SOLVER FRAMING');
      expect(sentPrompt).toContain('Problem → Action → Outcome');
      expect(sentPrompt).toContain(
        'do NOT invent one — this is a truthfulness violation exactly like a fabricated metric',
      );
    });
  });

  describe('generateProposal — problem-solver framing prompt', () => {
    it('instructs the model to state the problem before the portfolio pitch', async () => {
      mockParse.mockResolvedValueOnce({
        choices: [{ message: { parsed: { proposal: 'ok', metadata: {} } } }],
      });

      await service.generateProposal(baseProfile, 'Need help with X');

      const sentPrompt = mockParse.mock.calls[0][0].messages[1]
        .content as string;
      expect(sentPrompt).toContain(
        'state the problem it solved before describing what it does',
      );
    });
  });

  describe('generateEmail — problem-solver framing prompt', () => {
    it('prefers framing the lead achievement as a problem solved', async () => {
      mockParse.mockResolvedValueOnce({
        choices: [
          { message: { parsed: { subject: 'ok', body: 'ok', wordCount: 2 } } },
        ],
      });

      await service.generateEmail(baseProfile, 'Need a backend engineer', {
        tone: 'direct',
        deliverableType: 'resume',
      });

      const sentPrompt = mockParse.mock.calls[0][0].messages[1]
        .content as string;
      expect(sentPrompt).toContain(
        'frame it as the problem you solved, not just the metric alone',
      );
    });
  });
});
