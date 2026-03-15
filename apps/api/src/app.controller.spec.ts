import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Test suite for the AppController.
 * This suite tests the functionality of the AppController's methods.
 */
describe('AppController', () => {
  let appController: AppController;

  /**
   * Sets up the testing module before each test.
   * This block creates a new testing module with the AppController and AppService,
   * and then gets an instance of the AppController.
   */
  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  /**
   * Tests the root endpoint of the controller.
   */
  describe('root', () => {
    /**
     * It should return "Hello World!".
     * This test case calls the getHello method and expects it to return the string "Hello World!".
     */
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
