import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  /**
   * Returns a simple "Hello World!" string.
   * This is a default, sample method.
   * @returns A "Hello World!" string.
   */
  getHello(): string {
    return 'Hello World!';
  }
}
