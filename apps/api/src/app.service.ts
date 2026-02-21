import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello from RankGEO API';
  }

  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
