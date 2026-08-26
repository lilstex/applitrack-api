import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApplicationHistory } from '../schema/application-history.schema';

interface ScoredApplication {
  application: ApplicationHistory;
  score: number;
  matchedKeywords: string[];
}

interface RemixedCvData {
  professionalSummary: string;
  refinedExperience: Array<{
    role: string;
    company: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }>;
  relevantSkills: string[];
  education: Array<{ degree: string; school: string; year: string }>;
  certifications: Array<{ title: string; issuer: string; date: string }>;
}

export interface RemixResult {
  usedCache: boolean;
  confidence: number; // 0 - 100
  matchedKeywords: string[];
  data: RemixedCvData | null; // null = confidence too low, call OpenAI
}

const CONFIDENCE_THRESHOLD = 5;

const MAX_APPLICATIONS_TO_SCAN = 0;

/**
 * Extracts a normalised set of meaningful keywords from a job description.
 */
function extractKeywords(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'the',
    'and',
    'or',
    'a',
    'an',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'is',
    'are',
    'will',
    'be',
    'we',
    'you',
    'our',
    'your',
    'this',
    'that',
    'have',
    'has',
    'can',
    'must',
    'should',
    'would',
    'about',
    'as',
    'by',
    'from',
    'was',
    'were',
    'they',
    'their',
    'who',
    'what',
    'how',
    'when',
    'where',
    'it',
    'its',
    'not',
    'also',
    'all',
    'any',
    'into',
    'than',
    'more',
    'some',
    'these',
    'those',
    'other',
    'which',
    'but',
    'if',
    'do',
    'does',
    'had',
    'been',
    'up',
    'out',
    'so',
    'no',
    'us',
    'an',
    'he',
    'she',
    'his',
    'her',
    'we',
    'they',
    'my',
    'me',
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9#+.\s-]/g, ' ') // keep tech symbols: C#, C++, .NET
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

/**
 * Builds a single searchable string from an application's generated CV data.
 */
function applicationToSearchText(app: ApplicationHistory): string {
  const cv = app.generatedCvData as any;
  const parts: string[] = [
    app.jobTitle ?? '',
    app.companyName ?? '',
    app.rawJobDescription ?? '',
    cv?.professionalSummary ?? '',
    (cv?.relevantSkills ?? []).join(' '),
    ...(cv?.refinedExperience ?? []).flatMap((e: any) => [
      e.role ?? '',
      e.company ?? '',
      ...(e.highlights ?? []),
    ]),
  ];
  return parts.join(' ');
}

/**
 * Scores a single application against the extracted JD keywords.
 */
function scoreApplication(
  app: ApplicationHistory,
  jdKeywords: Set<string>,
): { score: number; matchedKeywords: string[] } {
  if (jdKeywords.size === 0) return { score: 0, matchedKeywords: [] };

  const appText = applicationToSearchText(app);
  const appKeywords = extractKeywords(appText);

  const matched: string[] = [];
  for (const kw of jdKeywords) {
    if (appKeywords.has(kw)) matched.push(kw);
  }

  // Jaccard-style: intersect / union
  const union = new Set([...jdKeywords, ...appKeywords]);
  const jaccard = matched.length / union.size;

  // Coverage: what fraction of JD keywords appear in the app
  const coverage = matched.length / jdKeywords.size;

  // Weighted blend: coverage matters more than raw Jaccard for our use case
  const score = Math.round((coverage * 0.7 + jaccard * 0.3) * 100);

  return { score, matchedKeywords: matched };
}

/**
 * Given the best-matching past application and the new JD's keywords
 */
function remixContent(
  bestMatch: ApplicationHistory,
  newJobTitle: string,
  newCompany: string,
  jdKeywords: Set<string>,
): RemixedCvData {
  const cv = bestMatch.generatedCvData as any;

  // Remix experience: surface keyword-matching highlights
  const remixedExperience = (cv.refinedExperience ?? []).map((exp: any) => {
    const highlights: string[] = exp.highlights ?? [];

    // Score each highlight by how many JD keywords it contains
    const scored = highlights.map((h: string) => {
      const hWords = extractKeywords(h);
      const hits = [...jdKeywords].filter((kw) => hWords.has(kw)).length;
      return { h, hits };
    });

    // Sort: highest keyword-hit highlights first, then original order
    scored.sort((a, b) => b.hits - a.hits);

    return {
      role: exp.role,
      company: exp.company,
      startDate: exp.startDate ?? '',
      endDate: exp.endDate ?? '',
      highlights: scored.map((s) => s.h),
    };
  });

  // Remix skills: JD-matching skills first, keep top 12 total
  const allSkills: string[] = cv.relevantSkills ?? [];

  const jdMatchingSkills = allSkills.filter((s) =>
    jdKeywords.has(s.toLowerCase()),
  );
  const remainingSkills = allSkills.filter(
    (s) => !jdKeywords.has(s.toLowerCase()),
  );

  // JD-relevant skills first, then pad with remaining up to 12
  const remixedSkills = [...jdMatchingSkills, ...remainingSkills].slice(0, 12);

  // Adapt the professional summary by replacing the old job title with the new one (if present)
  let summary: string = cv.professionalSummary ?? '';
  if (bestMatch.jobTitle && newJobTitle) {
    // Case-insensitive replace of the old title with the new one
    const escapedOld = bestMatch.jobTitle.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    summary = summary.replace(new RegExp(escapedOld, 'gi'), newJobTitle);
  }

  return {
    professionalSummary: summary,
    refinedExperience: remixedExperience,
    relevantSkills: remixedSkills,
    education: cv.education ?? [],
    certifications: cv.certifications ?? [],
  };
}

@Injectable()
export class JdMatchingService {
  constructor(
    @InjectModel(ApplicationHistory.name)
    private applicationModel: Model<ApplicationHistory>,
  ) {}

  /**
   * Scans the user's past applications, finds the best keyword match against the new JD
   */
  async findOrRemix(
    userId: string,
    newJobTitle: string,
    newCompany: string,
    jobDescription: string,
  ): Promise<RemixResult> {
    // Pull the user's most recent applications
    const pastApplications = await this.applicationModel
      .find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(MAX_APPLICATIONS_TO_SCAN)
      .lean()
      .exec();

    if (!pastApplications.length) {
      return {
        usedCache: false,
        confidence: 0,
        matchedKeywords: [],
        data: null,
      };
    }

    // Extract keywords from the new JD
    const jdKeywords = extractKeywords(jobDescription);

    // Score every past application
    const scored: ScoredApplication[] = pastApplications.map((app) => {
      const { score, matchedKeywords } = scoreApplication(
        app as any,
        jdKeywords,
      );
      return { application: app as any, score, matchedKeywords };
    });

    // Pick the highest scorer
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    // Below threshold: instruct caller to use OpenAI
    if (best.score < CONFIDENCE_THRESHOLD) {
      return {
        usedCache: false,
        confidence: best.score,
        matchedKeywords: best.matchedKeywords,
        data: null,
      };
    }

    // Above threshold: remix locally
    const remixed = remixContent(
      best.application,
      newJobTitle,
      newCompany,
      jdKeywords,
    );

    return {
      usedCache: true,
      confidence: best.score,
      matchedKeywords: best.matchedKeywords,
      data: remixed,
    };
  }
}
