import {
  BadRequestException,
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
const CvResponseSchema = z.object({
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
    z.object({
      degree: z.string(),
      school: z.string(),
      year: z.string(),
    }),
  ),
  certifications: z.array(
    z.object({
      title: z.string(),
      issuer: z.string(),
      date: z.string(),
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
    .describe('List of tools, languages, or frameworks used in this role'),
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

export const ProfileExtractionSchema = z.object({
  fullName: z.string().describe('The full name of the individual'),
  phoneNumber: z.string().nullable().describe('Contact phone number'),
  linkedinUrl: z.string().nullable().describe('Link to LinkedIn profile'),
  summary: z.string().describe('A brief professional summary or bio'),
  skills: z
    .array(z.string())
    .describe('A flat list of technical and soft skills'),
  workExperience: z.array(ExperienceSchema),
  education: z.array(EducationSchema),
  certifications: z.array(CertificationSchema),
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

    // Update credits - no await needed for assignment
    masterProfile.credits -= COST_PER_CV;
    await masterProfile.save();

    try {
      const prompt = `
        You are a senior Technical Recruiter and Resume Optimization Expert.

        TASK:
        Analyze the User's Master Profile and the provided Job Description (JD), then produce:
        1. An ATS-optimized CV
        2. A tailored Cover Letter

        Your primary goal is to position the candidate as the **clear solution to the specific problem this job role is trying to solve**.

        GLOBAL GUIDELINES:
        - Every section of the CV must clearly answer: "Why should this candidate be hired for THIS role?"
        - Content must be concise, impact-driven, and aligned directly to the JD.
        - Do NOT fabricate or exaggerate experience. Use ONLY information found in the Master Profile.
        - If the user has no relevant certifications for this role, return an empty array [] for the certifications field.

        CV REQUIREMENTS:

        1. PROFESSIONAL SUMMARY:
        - Write a sharp, compelling sales pitch (3–5 lines max).
        - Do NOT write a biography or career history.
        - Clearly communicate the candidate’s value proposition and relevance to the JD.
        - Make it immediately obvious that the candidate fits this role.

        2. WORK EXPERIENCE (Reverse Chronological Order):
        - Sorting: You MUST list experiences in descending order based on the End Date (Most Recent first). If a role is "Present," it must appear at the top.
        - Selection: Select and prioritize only the most relevant past roles from the Profile that align with the target Job Description.
        - The X-Y-Z Impact Formula: Rewrite every bullet point using the following structure:
          "Accomplished [X] + as measured by [Y] + by doing [Z]"
        - Impact Focus: Strictly eliminate "Responsibilities" or "Tasks." Every bullet must represent a Result or Outcome.
        - Quantification: You are required to quantify achievements. Use percentages, time-saved, amounts, or scale (e.g., "reduced latency by 45%," "managed 10+ microservices").

        3. SKILLS SECTION:
        - Prioritize and densely pack keywords, tools, technologies, and competencies explicitly mentioned in the JD.
        - Use ATS-friendly formatting (comma-separated or categorized lists).
        - Exclude irrelevant or weak skills that do not support the JD.

        4. ATS OPTIMIZATION:
        - Use clear section headings.
        - Avoid tables, icons, emojis, or graphics.
        - Mirror terminology and phrasing from the JD where applicable.

        COVER LETTER REQUIREMENTS:
        - Maximum 300 words.
        - Professional and confident tone.
        - Directly connect the candidate’s experience to the problems, goals, or responsibilities in the JD.
        - Clearly explain why the candidate is a strong match for this specific role and company.

        INPUT DATA:

        USER MASTER PROFILE:
        ${JSON.stringify(masterProfile)}

        JOB DESCRIPTION:
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
      throw new InternalServerErrorException(
        'Failed to extract data from PDF. Please try a different resume file.',
      );
    }
  }
}
