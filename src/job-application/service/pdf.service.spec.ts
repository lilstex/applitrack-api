import * as ejs from 'ejs';
import * as path from 'path';

const TEMPLATES = ['modern', 'corporate', 'minimal', 'editorial', 'executive'];

const mockUser = {
  fullName: 'Emmanuel Mbagwu',
  email: 'test@example.com',
  phoneNumber: '+2348000000000',
  linkedinUrl: 'https://linkedin.com/in/test',
  githubUrl: 'https://github.com/test',
  portfolioUrl: 'https://test.dev',
};

const mockAi = {
  professionalSummary: 'Senior backend engineer with 7+ years of experience.',
  refinedExperience: [{
    role: 'Senior Software Engineer', company: 'Google',
    startDate: '2021-01-01', endDate: 'Present',
    highlights: ['Reduced latency by 42%', 'Led microservices migration'],
  }],
  relevantSkills: ['Node.js', 'NestJS', 'MongoDB', 'Redis', 'Docker'],
  education: [{ degree: 'BSc Computer Science', school: 'University of Lagos', year: '2018' }],
  certifications: [{ title: 'AWS Solutions Architect', issuer: 'Amazon', date: '2022' }],
  projects: [{
    name: 'OpenBudget API', description: 'Open-source budget tracking API',
    techStack: ['Node.js', 'PostgreSQL'], highlights: ['10k+ monthly requests'],
  }],
  languages: [{ language: 'English', proficiency: 'Native' }, { language: 'French', proficiency: 'Intermediate' }],
  awards: [{ title: 'Best API Design', issuer: 'Google Dev Awards', date: '2023', description: 'Outstanding API architecture' }],
  volunteerWork: [{
    organization: 'Code for Africa', role: 'Backend Mentor',
    startDate: '2022-01-01', endDate: '2023-06-01',
    description: 'Mentored 15 junior developers in Node.js',
  }],
  coverLetter: 'Dear Hiring Manager, I am excited to apply...',
};

describe('PDF Templates — smoke tests', () => {
  const viewsPath = path.join(__dirname, '../../views');

  TEMPLATES.forEach((templateName) => {
    it(`renders ${templateName}.ejs without throwing`, async () => {
      const templatePath = path.join(viewsPath, `${templateName}.ejs`);
      await expect(
        ejs.renderFile(templatePath, { ai: mockAi, user: mockUser, template: templateName }),
      ).resolves.toContain(mockUser.fullName);
    });
  });

  it('renders with empty optional sections', async () => {
    const emptyAi = { ...mockAi, projects: [], languages: [], awards: [], volunteerWork: [], certifications: [] };
    const templatePath = path.join(viewsPath, 'modern.ejs');
    await expect(
      ejs.renderFile(templatePath, { ai: emptyAi, user: mockUser, template: 'modern' }),
    ).resolves.toContain(mockUser.fullName);
  });
});
