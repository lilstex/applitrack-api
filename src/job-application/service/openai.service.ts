import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
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

export const ProposalResponseSchema = z.object({
  proposal: z
    .string()
    .describe(
      'The full proposal text, ready to paste into Upwork / similar platforms. ' +
        '250–500 words. Begins with any explicit instruction the JD specified.',
    ),
  metadata: z.object({
    extractedInstructions: z
      .array(z.string())
      .describe(
        'Explicit instructions found in the JD ("Start with the word BANANA", ' +
          '"Include your hourly rate", "Reply with the answer to 2+2"). EMPTY ' +
          'if the JD contains no such directives.',
      ),
    questionsToAnswer: z
      .array(z.string())
      .describe(
        'Direct questions the client asked, that the proposal addresses. e.g. ' +
          '"How many years of React experience do you have?" EMPTY if none.',
      ),
    requiredKeywords: z
      .array(z.string())
      .describe(
        'Tech stack / domain keywords from the JD that appear in the proposal. ' +
          'Used by the frontend to show coverage hints.',
      ),
    estimatedBudget: z
      .string()
      .nullable()
      .describe(
        'Budget hint detected in the JD, verbatim. e.g. "$500-1000", "fixed ' +
          '$2000". NULL if not mentioned.',
      ),
    estimatedDuration: z
      .string()
      .nullable()
      .describe(
        'Duration hint detected in the JD, verbatim. e.g. "2 weeks", ' +
          '"ongoing". NULL if not mentioned.',
      ),
    referencedProjects: z
      .array(z.string())
      .describe(
        "Names of projects from the user's master profile that the proposal " +
          'references as portfolio evidence. The proposal MUST link to project ' +
          'URLs where available.',
      ),
    wordCount: z
      .number()
      .describe('Approximate word count of the proposal text.'),
    instructionConfidence: z
      .enum(['low', 'medium', 'high'])
      .describe(
        'high = JD had explicit directives that were followed verbatim. ' +
          'medium = JD had implicit cues we addressed. ' +
          'low = generic JD, best-judgement proposal.',
      ),
  }),
});

export const EmailResponseSchema = z.object({
  subject: z
    .string()
    .describe(
      'Email subject line. Under 60 characters. Names the role and the ' +
        'sender. Avoid generic words like "Application" or "Resume" alone — ' +
        'pair them with specifics.',
    ),
  body: z
    .string()
    .describe(
      'Plain-text email body. Greeting + 2-3 SHORT paragraphs + sign-off. ' +
        'Target 80 words, hard ceiling 120 words. The attachment line is ' +
        'mandatory and explicit. No fluff phrases like "I hope this email ' +
        'finds you well" or "I am writing to express my interest".',
    ),
  wordCount: z.number().describe('Approximate word count of the body.'),
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
  private readonly logger = new Logger(OpenAIService.name);
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

      this.logger.error(
        'OpenAI generation failed',
        error instanceof Error ? error.stack : String(error),
      );

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
      this.logger.error(
        'PDF extraction failed',
        error instanceof Error ? error.stack : String(error),
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to extract data from PDF. Please try a different resume file.',
      );
    }
  }

  async generateProposal(masterProfile: User, jobDescription: string) {
    const COST_PER_PROPOSAL = process.env.COST_PER_CV
      ? parseInt(process.env.COST_PER_CV)
      : 10;

    if (masterProfile.credits < COST_PER_PROPOSAL) {
      throw new BadRequestException('Insufficient credits. Please top up.');
    }

    masterProfile.credits -= COST_PER_PROPOSAL;
    await masterProfile.save();

    try {
      const prompt = `
You are a senior freelance proposal writer with deep experience winning work on Upwork, Contra, Toptal, and similar platforms. You know what clients actually read, what they ignore, and what gets a proposal shortlisted vs deleted.
 
# TASK
Analyze the Job Description (JD) for explicit client instructions FIRST, then write a tailored proposal using the User's Master Profile.
 
This is NOT a cover letter. A cover letter is read by HR after the resume is screened. A proposal is read first, in a list of 30+ competing proposals, by a busy client who decides in <10 seconds whether to keep reading.
 
# PHASE 1 — INSTRUCTION EXTRACTION (CRITICAL)
 
Scan the JD for these patterns and treat any matches as MANDATORY directives the proposal must obey:
 
## Pattern A — Word-of-the-day / proof-of-reading filters
- "Start your proposal with the word ___"
- "Begin your reply with ___"
- "If you've read this, include the word ___"
- "Type X at the top of your proposal"
- Math questions ("What is 2+2"), nonsense answers, codes
 
If you find any of these, the proposal MUST start with the exact answer the client asked for. This is the single most common reason proposals get auto-rejected.
 
## Pattern B — Direct questions
- "How many years of experience with X do you have?"
- "Have you worked with [tool/industry] before?"
- "What is your hourly rate?"
- "When can you start?"
- "Show me an example of similar work"
 
Answer each directly, near the top of the proposal. Don't make the client hunt.
 
## Pattern C — Required disclosures
- "Include 3 examples of your work"
- "Send me your portfolio link"
- "Mention your experience with X"
- "Tell me about a similar project you've completed"
 
Address each before pitching anything else.
 
## Pattern D — Format / length requirements
- "Keep it under 200 words"
- "Don't send a template"
- "No long bios"
- "Be brief / detailed"
 
Override the default length (250–500 words) if the client specified one.
 
## Pattern E — Anti-templates / quality filters
- "No copy-paste proposals"
- "Show me you read this"
- "Generic proposals will be ignored"
 
When you see these, the proposal must include at least TWO specific references to details in the JD (technology, timeline, problem statement) that prove it was written for THIS job.
 
If NONE of these patterns appear, the instructionConfidence is 'low' and the proposal uses best-judgement framing.
 
# PHASE 2 — PROPOSAL CONSTRUCTION
 
## Opening (line 1–2)
- If a Phase 1 directive specifies the opening, USE IT VERBATIM. No exceptions.
- Otherwise: a specific, evidence-based hook tied to a detail in the JD. Not "I'm interested in your project."
 
## Body (3–6 short paragraphs OR a tight bullet list)
- Answer Phase 1 questions in order they appeared.
- Reference 1–3 projects from the master profile as portfolio evidence. If a project has a URL, embed it inline like: "I built [Project Name](https://url) which..."
- Reference 1–2 relevant work experience entries — but only if directly applicable. Freelance proposals lean on portfolio more than employment history.
- Quote the JD where it matters: if they said "we need someone who can handle X under deadline pressure", echo that phrase back.
 
## Approach (optional, 1 short paragraph)
- A 2–3 sentence sketch of how you'd tackle the work. NOT a full project plan. Just enough to show you've thought about it.
- Skip this if the JD is for a simple task or the client signaled they want brevity.
 
## Close (1 line, max 2)
- Concrete next step. "Happy to share more samples — when works for a quick chat?" or "Available to start [specific timeframe]."
- NEVER "Looking forward to hearing from you." (Generic. Filtered out.)
 
# RULES OF THE PROFILE
 
## Use what's there
- The user's project list is their portfolio. Use it. Quote project NAMES and link to project URLs if available.
- Their work experience is supporting evidence, not the main pitch.
- Their skills list shows what they can claim without hedging.
 
## Don't invent
- Same truthfulness rules as the CV system. No invented metrics, scope, durations, or technologies.
- If the JD asks for X and the user has Y (an adjacent tool), say so honestly. "I've worked extensively with Y, which shares the same core patterns as X — happy to walk through how that transfers."
- Don't promise hourly rates the user didn't provide. If the JD asks for a rate and the user's profile doesn't mention one, the proposal acknowledges this: "Happy to discuss rate based on scope."
 
## Voice
- First person, conversational, confident.
- No corporate hedging ("I believe I would be a strong candidate"). Just "I'd be a good fit because..."
- Contractions are fine. This is freelance writing, not a formal letter.
- Vary sentence length. A short punchy sentence after a longer one keeps it readable.
 
# LENGTH
- 250–500 words unless the JD specified otherwise.
- Hard ceiling 800 words. If you're tempted to write more, you're padding.
 
# PORTFOLIO LINKING RULES
- If the master profile has projects with URLs, the proposal SHOULD include at least one inline link, using Markdown link syntax: [Project Name](https://url)
- If multiple projects are relevant, link up to 3.
- The platform (Upwork etc.) renders Markdown links as clickable. Plain URLs are fine but less polished.
 
# OUTPUT FORMAT
Return valid JSON matching the schema. The 'proposal' field is the user-facing text. The 'metadata' field is analysis — what instructions were found, what questions were answered, what projects were referenced.
 
# PRE-OUTPUT SELF-CHECK
- [ ] If the JD had a Phase 1 word-of-the-day directive, the proposal STARTS WITH IT VERBATIM.
- [ ] Every Phase 1 question is answered somewhere in the proposal.
- [ ] At least one project from the master profile is referenced (if any exist).
- [ ] No invented metrics, technologies, or credentials.
- [ ] The proposal does not exceed 800 words. Defaults to 250–500.
- [ ] Closing line is a specific next step, not "looking forward to hearing from you."
- [ ] If the JD said "no templates" or similar, at least 2 specifics from the JD appear in the proposal.
 
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
            content:
              'You are a senior freelance proposal writer who has reviewed 10,000+ winning Upwork proposals.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: zodResponseFormat(
          ProposalResponseSchema,
          'proposal_output',
        ),
      });

      return response.choices[0].message.parsed;
    } catch (error) {
      // Refund on failure
      await this.userModel.findByIdAndUpdate(masterProfile._id, {
        $inc: { credits: COST_PER_PROPOSAL },
      });

      this.logger.error(
        'OpenAI proposal generation failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException('Proposal generation failed');
    }
  }

  async generateEmail(
    masterProfile: User,
    jobDescription: string,
    options: {
      tone: 'direct' | 'warm';
      deliverableType: 'resume' | 'proposal';
      companyName?: string;
    },
  ) {
    const COST_PER_EMAIL = 1;

    if (masterProfile.credits < COST_PER_EMAIL) {
      throw new BadRequestException('Insufficient credits. Please top up.');
    }

    masterProfile.credits -= COST_PER_EMAIL;
    await masterProfile.save();

    try {
      const attachmentPhrase =
        options.deliverableType === 'proposal'
          ? 'My proposal is attached'
          : 'My resume and tailored cover letter are attached';

      const toneInstructions =
        options.tone === 'direct'
          ? `
# TONE: DIRECT & CONFIDENT
- Lead with relevance in line 1. No throat-clearing.
- Statement of fit (not aspiration). "I'm a 5-year React dev" not "I aspire to be a React dev".
- No hedging modals: avoid "I believe", "I think I would", "I feel that".
- Contractions OK ("I've", "I'm", "you're").
- The reader should know in 5 seconds whether you fit. No buried lede.
`
          : `
# TONE: WARM & STORY-LED
- Open with a one-sentence relatable hook tied to the JD. Examples:
  "Saw your post about needing someone who's wrestled a legacy Angular codebase — that's a familiar fight."
  "Your team's mention of late-stage migration headaches hit close to home."
- After the hook, get to the relevance fast (line 2-3).
- Slightly more personality than 'direct', but still ZERO fluff.
- Avoid: "I came across your post", "I hope this finds you well",
  "I was excited to see your opening".
`;

      const prompt = `
You are a hiring manager who has read 10,000+ application emails and knows exactly which ones get past line 3. You're now writing one for someone who is genuinely qualified.
 
# THE RULES THAT MATTER
 
## BREVITY IS THE FEATURE
HR / hiring managers skim. The average application email gets <8 seconds. If your email is longer than 120 words, it's been deleted before the recipient finished the first paragraph.
 
Target: 80 words in the body. Hard ceiling: 120 words. Subject under 60 chars.
 
## THE STRUCTURE
1. Greeting (1 line) — "Hi {first name of hiring manager if mentioned in JD, else 'Hiring Team'},"
2. Opening (1-2 sentences) — Defined by the tone block below.
3. Relevance (1 short paragraph, 2-3 sentences) — Concrete claim of fit, ONE specific from the user's profile that maps to the JD.
4. Attachment line — Use EXACTLY this phrase: "${attachmentPhrase}." Then ONE short sentence pointing to what's in it. e.g. "${attachmentPhrase}. It covers my work on the migration projects you'd find most relevant." Or for proposals: "${attachmentPhrase}. It addresses your timeline and the specific tools you mentioned."
5. Close (1 line) — Concrete next step. "Open to a quick call next week if useful." NOT "Looking forward to hearing from you."
6. Sign-off — "Best," or "Thanks," + the user's first name on next line + ONE contact channel (their phone OR email link, not both — they're already in the email From: header).
 
## SUBJECT LINE
- Under 60 characters.
- Pattern: "{Role} — {User name}" OR "{Role} application — {1-word distinguishing trait} ({user name})"
- Examples:
  GOOD: "Senior React Dev — Jane Smith"
  GOOD: "Backend role application — 8 years Postgres (Jane Smith)"
  BAD: "Job Application" (generic)
  BAD: "Re: opportunity" (looks like spam)
 
${toneInstructions}
 
# HARD RULES
 
## NEVER USE THESE PHRASES
- "I am writing to express my interest"
- "I hope this email finds you well"
- "Please find attached"  (use the mandated attachment phrase instead)
- "Thank you for your time and consideration"
- "I look forward to hearing from you"
- "I believe I would be a great fit"
- "I am excited about the opportunity"
 
These are anti-signals. They mark the email as templated and trigger the
deletion reflex.
 
## NEVER INVENT
- No fabricated years of experience, technologies the user doesn't have,
  credentials they didn't earn, or specific past employers.
- If you don't have a strong hook from the profile, use a weaker honest one
  rather than a strong invented one.
 
## ATTACHMENT LINE
- MUST appear in the body. Verbatim phrase: "${attachmentPhrase}."
- One short sentence after it pointing to what's in the deliverable.
 
# OUTPUT FORMAT
Return valid JSON matching the schema:
- subject: under 60 chars
- body: full email body INCLUDING greeting and sign-off, plain text only,
  newlines as \\n\\n between paragraphs
- wordCount: count of words in the body field
 
# PRE-OUTPUT CHECKLIST
- [ ] Body is ≤120 words.
- [ ] Subject is ≤60 chars.
- [ ] The attachment line "${attachmentPhrase}." appears in the body.
- [ ] No banned phrases.
- [ ] The opening matches the requested tone.
- [ ] No invented facts.
- [ ] Greeting on its own line, then blank line, then body, then blank line, then sign-off.
 
# INPUT
 
## USER MASTER PROFILE
${JSON.stringify(masterProfile)}
 
## JOB DESCRIPTION
${jobDescription}
 
## DELIVERABLE TYPE
${options.deliverableType}
 
## RECIPIENT COMPANY
${options.companyName ?? '(not specified)'}
`;

      const response = await this.openai.chat.completions.parse({
        model: 'gpt-4o-2024-08-06',
        messages: [
          {
            role: 'system',
            content:
              'You are a senior hiring manager who has read 10,000+ application ' +
              'emails. You know which ones get past line 3 and which ones get ' +
              'deleted. Brevity is the feature.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: zodResponseFormat(EmailResponseSchema, 'email_output'),
      });

      return {
        ...response.choices[0].message.parsed,
        tone: options.tone,
        deliverableType: options.deliverableType,
      };
    } catch (error) {
      // Refund on failure
      await this.userModel.findByIdAndUpdate(masterProfile._id, {
        $inc: { credits: COST_PER_EMAIL },
      });

      this.logger.error(
        'OpenAI email generation failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException('Email generation failed');
    }
  }
}
