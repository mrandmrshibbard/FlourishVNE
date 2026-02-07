import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setLogLevel } from '../logger';

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setLogLevel('debug');
  });

  describe('log level filtering', () => {
    it('logs all levels when set to debug', () => {
      setLogLevel('debug');
      const logger = createLogger('Test');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('filters debug when set to info', () => {
      setLogLevel('info');
      const logger = createLogger('Test');

      logger.debug('should not appear');
      logger.info('should appear');
      logger.warn('should appear');
      logger.error('should appear');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalledTimes(1);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('filters debug and info when set to warn', () => {
      setLogLevel('warn');
      const logger = createLogger('Test');

      logger.debug('no');
      logger.info('no');
      logger.warn('yes');
      logger.error('yes');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('only allows error when set to error', () => {
      setLogLevel('error');
      const logger = createLogger('Test');

      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('yes');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('module prefix', () => {
    it('prepends the module name in brackets', () => {
      setLogLevel('debug');
      const logger = createLogger('MyModule');

      logger.info('test message');

      expect(consoleSpy.info).toHaveBeenCalledWith('[MyModule]', 'test message');
    });
  });

  describe('production mode filtering', () => {
    it('filters debug and info at warn level (simulating production)', () => {
      setLogLevel('warn');
      const logger = createLogger('App');

      logger.debug('debug data');
      logger.info('info data');
      logger.warn('warning');
      logger.error('error');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledWith('[App]', 'warning');
      expect(consoleSpy.error).toHaveBeenCalledWith('[App]', 'error');
    });
  });

  describe('multiple arguments', () => {
    it('passes multiple arguments through', () => {
      setLogLevel('debug');
      const logger = createLogger('Test');

      logger.debug('message', { key: 'value' }, 42);

      expect(consoleSpy.log).toHaveBeenCalledWith('[Test]', 'message', { key: 'value' }, 42);
    });
  });
});
