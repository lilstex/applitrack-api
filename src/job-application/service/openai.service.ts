import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { User } from 'src/user/schema/user.schema';
import { z } from 'zod';
import { UpdateBasicInfoDto } from 'src/user/dto/profile.dto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Define the schema the AI MUST follow
export const CvResponseSchema = z.object({
  professionalSummary: z.string(),
  refinedExperience: z.array(
    z.object({
      role: z.string(),
      company: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      highlights: z.array(z.string()),
    }),
  ),
  relevantSkills: z.array(z.string()),
  education: z.array(
    z.object({ degree: z.string(), school: z.string(), year: z.string() }),
  ),
  certifications: z.array(
    z.object({ title: z.string(), issuer: z.string(), date: z.string() }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      techStack: z.array(z.string()),
      highlights: z.array(z.string()),
    }),
  ),
  languages: z.array(
    z.object({ language: z.string(), proficiency: z.string() }),
  ),
  awards: z.array(
    z.object({
      title: z.string(),
      issuer: z.string(),
      date: z.string(),
      description: z.string().nullable(),
    }),
  ),
  volunteerWork: z.array(
    z.object({
      organization: z.string(),
      role: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      description: z.string(),
    }),
  ),
  coverLetter: z.string(),
});

const ExperienceSchema = z.object({
  company: z.string().describe('The name of the company or organization'),
  role: z.string().describe('The job title or position held'),
  location: z.string().nullable().describe('City and Country or Remote'),
  startDate: z.string().describe('The start date in YYYY-MM-DD format'),
  endDate: z
    .string()
    .describe('The end date in YYYY-MM-DD format or "Present"'),
  highlights: z
    .array(z.string())
    .describe('Bullet points of achievements and responsibilities'),
  technologiesUsed: z
    .array(z.string())
    .describe('List of tools, languages, or frameworks used'),
});

const EducationSchema = z.object({
  degree: z.string().describe('The name of the degree or qualification'),
  school: z.string().describe('The name of the university or institution'),
  year: z.string().describe('The year of graduation'),
});

const CertificationSchema = z.object({
  title: z.string().describe('The name of the certification'),
  issuer: z.string().describe('The organization that issued the certification'),
  date: z.string().describe('The date the certification was obtained'),
});

const ProjectSchema = z.object({
  name: z.string().describe('Project name'),
  description: z
    .string()
    .describe('Short description of what the project does'),
  url: z.string().nullable().describe('Project URL or repository link'),
  techStack: z.array(z.string()).describe('Technologies used'),
  highlights: z.array(z.string()).describe('Key achievements or features'),
});

const LanguageSchema = z.object({
  language: z.string().describe('Name of the language'),
  proficiency: z
    .string()
    .describe(
      'Proficiency level: Native, Fluent, Professional, Intermediate, or Basic',
    ),
});

const AwardSchema = z.object({
  title: z.string().describe('Award or honour title'),
  issuer: z.string().describe('Issuing organisation'),
  date: z.string().describe('Date awarded'),
  description: z.string().nullable().describe('Short description of the award'),
});

const VolunteerSchema = z.object({
  organization: z.string().describe('Name of the organisation'),
  role: z.string().describe('Volunteer role or title'),
  startDate: z.string().describe('Start date in YYYY-MM-DD format'),
  endDate: z.string().describe('End date in YYYY-MM-DD format or "Present"'),
  description: z.string().describe('What was done and achieved'),
});

export const ProfileExtractionSchema = z.object({
  fullName: z.string().describe('The full name of the individual'),
  phoneNumber: z.string().nullable().describe('Contact phone number'),
  linkedinUrl: z.string().nullable().describe('Link to LinkedIn profile'),
  githubUrl: z.string().nullable().describe('Link to GitHub profile'),
  portfolioUrl: z
    .string()
    .nullable()
    .describe('Link to portfolio or personal website'),
  summary: z.string().describe('A brief professional summary or bio'),
  skills: z
    .array(z.string())
    .describe('A flat list of technical and soft skills'),
  workExperience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
  projects: z.array(ProjectSchema),
  languages: z.array(LanguageSchema),
  awards: z.array(AwardSchema),
  volunteerWork: z.array(VolunteerSchema),
});

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor(@InjectModel(User.name) private userModel: Model<User>) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  async generateTailoredContent(masterProfile: User, jobDescription: string) {
    const COST_PER_CV = process.env.COST_PER_CV
      ? parseInt(process.env.COST_PER_CV)
      : 10;

    // Validate operations
    if (masterProfile.credits < COST_PER_CV) {
      throw new BadRequestException('Insufficient credits. Please top up.');
    }

    // Update credits
    masterProfile.credits -= COST_PER_CV;
    await masterProfile.save();

    try {
      const prompt = `
You are a senior Technical Recruiter and Resume Optimization Expert with deep experience in ATS systems, technical hiring, and how recruiters actually screen candidates.

# TASK
Analyze the User's Master Profile against the Job Description (JD) and produce:
1. An ATS-optimized CV (structured JSON)
2. A tailored Cover Letter

Your job is to present the candidate's real strengths in the most relevant light for THIS specific role. You are not inventing a perfect candidate — you are surfacing what's truthfully there, including skills and experiences the candidate may have understated or omitted from their profile.

# CORE PHILOSOPHY

A great tailored CV does three things:
1. Surfaces relevant experience the candidate already has.
2. Reframes that experience in the JD's language.
3. Makes legitimate inferences about implied skills the candidate could defend in an interview.

It does NOT invent metrics, scope, technologies, or experience the candidate cannot back up.

# TRUTHFULNESS RULES (NON-NEGOTIABLE)

## What you must NOT do
- Do NOT invent metrics, percentages, dollar amounts, team sizes, or timelines. If a number isn't in the profile, do not estimate one.
- Do NOT inflate scope. "Collaborated on" is not "led." "Contributed to" is not "architected." "Used" is not "owned."
- Do NOT add job titles, durations, or employers that aren't in the profile.
- Do NOT add a technology to a specific role unless the profile explicitly associates it with that role.
- Do NOT claim certifications, degrees, or formal training the profile doesn't list.
- Do NOT use unsupported personality claims ("passionate," "results-driven," "rockstar," "guru," "world-class").

## What you MAY do (legitimate inference)
You may include a skill, technology, or capability if ONE of these is true:

**1. Explicit:** It is directly listed in the Master Profile.

**2. Unambiguously implied by listed work.** Examples:
   - Profile says "built REST APIs in Express" → may list Node.js, REST, HTTP, JSON, API design
   - Profile says "deployed services to AWS using Terraform" → may list Infrastructure as Code, cloud deployment
   - Profile says "React + Redux dashboard" → may list JavaScript, state management, component architecture
   - Profile says "wrote SQL queries against Postgres" → may list relational databases, query optimization (if scale is mentioned)

**3. Direct synonym or version:** Postgres ↔ PostgreSQL, JS ↔ JavaScript, GH Actions ↔ CI/CD, k8s ↔ Kubernetes.

**Inference test:** The candidate must be able to defend the inferred skill in a technical interview based on the work listed. If a recruiter asked "tell me about your experience with X," could they answer credibly using only what's in their profile? If no, do not include it.

## What is NOT legitimate inference
- Adding a framework because the JD requires it and the candidate uses something "similar." React experience does NOT imply Angular. Django does NOT imply Rails. AWS does NOT imply GCP.
- Adding a tool the candidate has never used because it's "easy to learn."
- Adding a skill the profile marks as "learning," "familiar with," or "exposure to" into the core Skills section as if it were a core competency. Surface these in the Cover Letter instead.
- Treating an entire ecosystem as implied from one component (using npm does not imply expertise in the broader Node.js backend ecosystem).

# CV REQUIREMENTS

## 1. Professional Summary (3–5 lines)
- A grounded value proposition, not a sales pitch.
- State: years of experience, core domain/specialization, and 1–2 strengths that map directly to the JD.
- Mirror JD terminology where the candidate's real experience genuinely matches.
- No superlatives. No personality adjectives unsupported by evidence. No filler ("seeking opportunities to leverage…").
- Every claim in the summary must be backed by something in the experience section.

## 2. Work Experience (Reverse Chronological)
- Sort by end date descending; roles marked "Present" appear first.
- Include all recent roles for continuity; deprioritize (fewer bullets) rather than omit recent ones unless clearly irrelevant.
- Older roles (>10 years) may be condensed or omitted if not relevant.

**Bullet structure:** [Strong action verb] + [specific contribution] + [outcome, scope, or context]

**Quantification rule:** Use numbers ONLY when they exist in the profile. If no metric exists, describe the outcome qualitatively. Do NOT invent percentages, time savings, or scale figures.

✅ "Reduced API latency from 800ms to 120ms by introducing Redis caching layer" (metric in profile)
✅ "Reduced API latency by introducing a Redis caching layer, improving page load on key dashboards" (no metric, qualitative outcome)
❌ "Reduced API latency by 40% through caching" (invented metric)

**Per bullet:**
- One concrete contribution. No responsibility-only bullets.
- Mirror JD terminology where the underlying work genuinely matches.
- 3–6 bullets per role; fewer is acceptable for thin profiles.

## 3. Skills
- Apply the legitimate inference rules above.
- Group logically when volume justifies it: Languages, Frameworks, Databases, Cloud/DevOps, Tools.
- Order within each group: JD-critical skills first, then supporting skills.
- Do NOT list skills marked "learning" or "familiar" — those belong in the Cover Letter if relevant.
- Do NOT add a JD-required skill that fails the inference test, even if it's "easy to learn."

## 4. ATS Formatting
- Plain text only. No icons, emojis, graphics, tables, or columns.
- Use the JD's exact phrasing for technologies when the profile uses a synonym for the same thing (normalize "JS" → "JavaScript", "Postgres" → "PostgreSQL").
- Use standard section headings (Professional Summary, Work Experience, Skills, Education, etc.).

## 5. Projects
- Include only projects technically relevant to the JD.
- Reframe descriptions to highlight JD-relevant aspects of work actually done.
- List JD-relevant tech stack items first.
- Apply the same quantification and inference rules as Work Experience.
- Return [] if no relevant projects exist.

## 6. Education
- Include all formal education from the profile.
- List relevant coursework or thesis topics only if they map to the JD.

## 7. Languages
- Include all spoken languages verbatim, with proficiency level if provided.
- Return [] if none listed.

## 8. Awards & Honours
- Include those relevant to the field, role, or that demonstrate transferable excellence.
- Return [] if none qualify.

## 9. Volunteer Work
- Include only if it demonstrates a skill or quality relevant to the JD.
- Apply the same bullet, quantification, and inference rules as Work Experience.
- Return [] if none qualify.

# HANDLING JD GAPS

When the JD requires skills the candidate does not have and cannot legitimately infer:

1. **Do NOT add them to the CV Skills section** to game ATS. This backfires at the recruiter screen and technical interview.

2. **Identify adjacent skills the candidate does have.** If the JD asks for Kubernetes and the candidate has Docker + AWS ECS experience, that adjacency is real and worth surfacing.

3. **Surface adjacencies in the Cover Letter**, not the CV. Example: "While my production experience is primarily with Docker and ECS, I've worked extensively with container orchestration concepts and am comfortable extending into Kubernetes."

4. **Be honest about fit.** If the candidate is a weak match overall, produce an honest CV that highlights their actual strengths. Do not paper over gaps.

# COVER LETTER REQUIREMENTS

- 250–300 words. Hard ceiling at 300.
- Professional and confident. Not boastful, not apologetic.
- Avoid filler openings ("I am writing to express my interest in…"). Open with a specific, evidence-based reason this role/company fits.
- Middle paragraph(s): 1–2 concrete examples from the profile that map to JD responsibilities or stated problems. Reference what the JD is actually asking for.
- This is the place to honestly address adjacent skills or learnability for JD requirements the candidate doesn't fully meet — framed as adjacency, not as a gap.
- Close with a clear, specific call to action. Not "I look forward to hearing from you."
- Do not repeat the CV verbatim. Add narrative, motivation, or context the CV structure cannot show.
- Every claim must be supported by the Master Profile.

# OUTPUT FORMAT

Return valid JSON. Use [] for any empty section. No commentary, markdown, or explanation outside the JSON structure.

# PRE-OUTPUT SELF-CHECK

Before returning, verify each item:

- [ ] Every metric in the CV traces to a specific fact in the Master Profile.
- [ ] No invented titles, employers, dates, technologies, or scope claims.
- [ ] Every skill in the Skills section passes the inference test (explicit, unambiguously implied, or direct synonym).
- [ ] No skills marked "learning" or "familiar" are in the core Skills section.
- [ ] JD-required skills the candidate doesn't have are NOT in the CV — adjacent skills are surfaced in the Cover Letter instead.
- [ ] No unsupported personality claims or superlatives.
- [ ] Every reframing preserves the original factual meaning.
- [ ] The Cover Letter stays under 300 words and adds value beyond the CV.
- [ ] If the candidate has clear gaps vs. the JD, the output is honest about strengths rather than pretending the gaps don't exist.

# INPUT

## USER MASTER PROFILE
${JSON.stringify(masterProfile)}

## JOB DESCRIPTION
${jobDescription}
`;

      const response = await this.openai.chat.completions.parse({
        model: 'gpt-4o-2024-08-06',
        messages: [
          {
            role: 'system',
            content: 'You are a professional career coach and ATS expert.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: zodResponseFormat(CvResponseSchema, 'cv_output'),
      });

      return response.choices[0].message.parsed;
    } catch (error) {
      // ROLLBACK: If AI fails, refund the user immediately
      await this.userModel.findByIdAndUpdate(masterProfile._id, {
        $inc: { credits: COST_PER_CV },
      });

      // Log the error for internal debugging
      console.error('OpenAI Generation Error:', error);

      throw new InternalServerErrorException('AI generation failed');
    }
  }

  async extractDataFromPdf(fileBuffer: Buffer): Promise<UpdateBasicInfoDto> {
    try {
      // Convert Buffer to Uint8Array for pdfjs
      const data = new Uint8Array(fileBuffer);

      // Load the PDF document
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;

      let fullText = '';

      // Iterate through pages to extract text
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Map the text items and join them
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');

        fullText += pageText + '\n';
      }

      if (!fullText.trim()) {
        throw new BadRequestException(
          'The PDF appears to be empty or an image-only scan.',
        );
      }

      // Use OpenAI to structure the data
      const response = await this.openai.chat.completions.parse({
        model: 'gpt-4o-2024-08-06',
        messages: [
          {
            role: 'system',
            content: `Extract career information from the provided resume text. 
        Format the output to match the requested schema exactly.
        Dates MUST be in YYYY-MM-DD format. If a day is unknown, use 01. 
        If a role is current or present, use 'Present' as the endDate.
        If a field is missing, return null or an empty array.`,
          },
          { role: 'user', content: fullText },
        ],
        response_format: zodResponseFormat(ProfileExtractionSchema, 'profile'),
      });

      const parsedData = response.choices[0].message.parsed;
      if (!parsedData) {
        throw new InternalServerErrorException(
          'AI failed to parse the resume structure correctly.',
        );
      }
      return parsedData as UpdateBasicInfoDto;
    } catch (error) {
      console.error('PDF Extraction Error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to extract data from PDF. Please try a different resume file.',
      );
    }
  }
}
