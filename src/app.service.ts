import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { message: string; status: string } {
    return {
      message: 'FlyVPN Backend API is running',
      status: 'ok',
    };
  }
}

