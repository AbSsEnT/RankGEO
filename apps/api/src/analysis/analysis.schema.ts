import { z } from 'zod';

export const websiteAnalysisSchema = z.object({
  sectorOfActivity: z.string().describe('Sector or industry the business operates in'),
  businessType: z.string().describe('Type of business (e.g. B2B, B2C, marketplace)'),
  businessDescription: z.string().describe('Short description of what the business does'),
  websiteStructure: z.string().describe('Description of the website structure and main sections'),
});

export type WebsiteAnalysis = z.infer<typeof websiteAnalysisSchema>;
