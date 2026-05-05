import { CvResponseSchema } from './openai.service';

describe('CvResponseSchema', () => {
  const minimal = {
    professionalSummary: 'Experienced engineer',
    refinedExperience: [{
      role: 'Engineer', company: 'Google',
      startDate: '2020-01-01', endDate: 'Present', highlights: ['Built things'],
    }],
    relevantSkills: ['Node.js'],
    education: [{ degree: 'BSc', school: 'MIT', year: '2018' }],
    certifications: [],
    projects: [],
    languages: [],
    awards: [],
    volunteerWork: [],
    coverLetter: 'Dear Hiring Manager...',
  };

  it('parses a valid full response', () => {
    expect(() => CvResponseSchema.parse(minimal)).not.toThrow();
  });

  it('parses a response with all new sections populated', () => {
    const full = {
      ...minimal,
      projects: [{ name: 'OpenBudget', description: 'Budget API', techStack: ['Node.js'], highlights: ['Fast'] }],
      languages: [{ language: 'French', proficiency: 'Intermediate' }],
      awards: [{ title: 'Best API', issuer: 'Google', date: '2023', description: 'Great work' }],
      volunteerWork: [{ organization: 'Code for Africa', role: 'Mentor', startDate: '2022-01-01', endDate: '2023-06-01', description: 'Mentored devs' }],
    };
    expect(() => CvResponseSchema.parse(full)).not.toThrow();
  });

  it('fails when professionalSummary is missing', () => {
    const bad = { ...minimal };
    delete (bad as any).professionalSummary;
    expect(() => CvResponseSchema.parse(bad)).toThrow();
  });
});
