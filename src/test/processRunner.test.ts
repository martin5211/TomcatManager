import { EventEmitter } from 'events';
import { ProcessRunner } from '../core/processRunner';

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
}));

// Mock child_process
const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

import * as fs from 'fs';

const sampleServer = {
  id: 'tomcat9',
  name: 'Tomcat 9',
  tomcatHome: '/opt/tomcat9',
  jdkHome: '/usr/lib/jvm/java-17',
};

const sampleConfig = {
  server: sampleServer,
  catalinaOpts: '',
  javaOpts: '',
};

const fakeProcesses: Array<ReturnType<typeof createFakeProcess>> = [];

function createFakeProcess(): EventEmitter & { pid: number; exitCode: number | null; stdout: EventEmitter; stderr: EventEmitter } {
  const proc = new EventEmitter() as any;
  proc.pid = 12345;
  proc.exitCode = null;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  fakeProcesses.push(proc);
  return proc;
}

const outputChannel = {
  appendLine: jest.fn(),
  show: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (fs.existsSync as jest.Mock).mockReturnValue(true);
});

afterEach(() => {
  // Ensure all fake processes emit close to avoid dangling promises
  for (const proc of fakeProcesses) {
    if (proc.exitCode === null) {
      proc.exitCode = 0;
      proc.emit('close', 0);
    }
  }
  fakeProcesses.length = 0;
});

describe('ProcessRunner', () => {
  describe('isRunning', () => {
    it('returns false when no process is tracked', () => {
      const runner = new ProcessRunner(outputChannel as any);
      expect(runner.isRunning('tomcat9')).toBe(false);
    });

    it('returns true when process is alive', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      expect(runner.isRunning('tomcat9')).toBe(true);
    });

    it('returns false when process has exited', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      // Simulate process exit
      fakeProc.exitCode = 0;
      fakeProc.emit('close', 0);

      expect(runner.isRunning('tomcat9')).toBe(false);
    });
  });

  describe('run', () => {
    it('throws if server is already running', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      await expect(runner.run(sampleConfig as any)).rejects.toThrow('already running');
    });

    it('throws if startup script not found', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const runner = new ProcessRunner(outputChannel as any);
      await expect(runner.run(sampleConfig as any)).rejects.toThrow('Startup script not found');
    });

    it('tracks process after spawn', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      expect(runner.isRunning('tomcat9')).toBe(true);
    });

    it('returns onExit promise that resolves on close', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      const { onExit } = await runner.run(sampleConfig as any);

      fakeProc.exitCode = 0;
      fakeProc.emit('close', 0);

      const code = await onExit;
      expect(code).toBe(0);
    });
  });

  describe('stop', () => {
    it('throws if shutdown script not found', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(runner.stop(sampleConfig as any)).rejects.toThrow('Shutdown script not found');
    });

    it('runs shutdown script and cleans up tracked process', async () => {
      const startProc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(startProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      // Mock the shutdown spawn
      const shutdownProc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(shutdownProc);

      const stopPromise = runner.stop(sampleConfig as any);

      // Simulate shutdown process completing
      shutdownProc.emit('close', 0);
      // Simulate main process exiting
      startProc.exitCode = 0;
      startProc.emit('close', 0);

      await stopPromise;
      expect(runner.isRunning('tomcat9')).toBe(false);
    });
  });

  describe('killAll', () => {
    it('force-kills all tracked processes', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      expect(runner.isRunning('tomcat9')).toBe(true);

      runner.killAll();

      // After killAll, the process map is cleared
      expect(runner.isRunning('tomcat9')).toBe(false);
    });
  });
});
