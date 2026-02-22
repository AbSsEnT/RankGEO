import {
  BadRequestException,
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import type { WebsiteAnalysis } from './analysis.schema';

class AnalyzeDto {
  url!: string;
}

class GeoScoreDto {
  url!: string;
  analysis!: WebsiteAnalysis;
}

@Controller('analyze')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async analyze(@Body() dto: AnalyzeDto) {
    const url = dto?.url?.trim();
    if (!url) {
      throw new BadRequestException('URL is required');
    }
    try {
      return await this.analysisService.analyzeWebsite(url);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Analysis failed';
      throw new BadRequestException(message);
    }
  }

  @Post('geo-score')
  @HttpCode(HttpStatus.OK)
  async geoScore(@Body() dto: GeoScoreDto) {
    const url = dto?.url?.trim();
    if (!url) {
      throw new BadRequestException('URL is required');
    }
    if (!dto?.analysis) {
      throw new BadRequestException('Analysis is required. Run POST /analyze first.');
    }
    try {
      return await this.analysisService.runGeoScorePipeline(url, dto.analysis);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'GEO score failed';
      throw new BadRequestException(message);
    }
  }
}
