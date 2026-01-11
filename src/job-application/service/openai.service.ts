import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { User } from 'src/user/schema/user.schema';
import { z } from 'zod';

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

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor(@InjectModel(User.name) private userModel: Model<User>) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  async generateTailoredContent(masterProfile: User, jobDescription: string) {
    console.log(masterProfile);
    const COST_PER_CV = process.env.COST_PER_CV
      ? parseInt(process.env.COST_PER_CV)
      : 10;

    // Atomic deduction
    const user = await this.userModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(masterProfile._id),
        credits: { $gte: COST_PER_CV },
      },
      { $inc: { credits: -COST_PER_CV } },
      { new: true },
    );

    if (!user) {
      throw new BadRequestException('Insufficient credits. Please top up.');
    }
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
}
