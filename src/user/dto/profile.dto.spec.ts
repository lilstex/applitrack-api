import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ProjectDto,
  LanguageDto,
  AwardDto,
  VolunteerWorkDto,
} from './profile.dto';

describe('ProjectDto', () => {
  it('passes with valid data', async () => {
    const dto = plainToInstance(ProjectDto, {
      name: 'OpenBudget',
      description: 'Budget API',
      techStack: ['Node.js'],
      highlights: ['Built in 2 weeks'],
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when name is missing', async () => {
    const dto = plainToInstance(ProjectDto, { description: 'Budget API' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});

describe('LanguageDto', () => {
  it('passes with valid data', async () => {
    const dto = plainToInstance(LanguageDto, {
      language: 'French',
      proficiency: 'Intermediate',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when proficiency is missing', async () => {
    const dto = plainToInstance(LanguageDto, { language: 'French' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'proficiency')).toBe(true);
  });
});

describe('AwardDto', () => {
  it('passes with optional description absent', async () => {
    const dto = plainToInstance(AwardDto, {
      title: 'Best API',
      issuer: 'Google',
      date: '2023',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('VolunteerWorkDto', () => {
  it('passes with all required fields', async () => {
    const dto = plainToInstance(VolunteerWorkDto, {
      organization: 'Code for Africa',
      role: 'Mentor',
      startDate: '2022-01-01',
      endDate: '2023-06-01',
      description: 'Mentored 15 developers',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when organization is missing', async () => {
    const dto = plainToInstance(VolunteerWorkDto, {
      role: 'Mentor',
      startDate: '2022-01-01',
      endDate: '2023-06-01',
      description: 'desc',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'organization')).toBe(true);
  });
});
