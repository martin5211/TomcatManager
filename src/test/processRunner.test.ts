import { EventEmitter } from 'events';
import { ProcessRunner } from '../core/processRunner';

// Mock fs (only fs.promises.access is used by the runner now)
jest.mock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined),
  },
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
  (fs.promises.access as jest.Mock).mockResolvedValue(undefined);
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
      (fs.promises.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

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

    it('returns ready promise that resolves with detected:true on Tomcat startup line', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      const { ready } = await runner.run(sampleConfig as any);

      fakeProc.stdout.emit('data', Buffer.from('INFO Server startup in 2543 ms\n'));

      await expect(ready).resolves.toEqual({ detected: true });
    });

    it('returns ready promise that resolves with detected:false on early exit', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      const { ready } = await runner.run(sampleConfig as any);

      fakeProc.exitCode = 1;
      fakeProc.emit('close', 1);

      await expect(ready).resolves.toEqual({ detected: false });
    });
  });

  describe('pipeOutput buffering', () => {
    it('joins log lines split across multiple chunks', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      (outputChannel.appendLine as jest.Mock).mockClear();

      fakeProc.stdout.emit('data', Buffer.from('First line\nSecond half'));
      fakeProc.stdout.emit('data', Buffer.from(' of second\nThird line\n'));

      const logged = (outputChannel.appendLine as jest.Mock).mock.calls.map(c => c[0]);
      expect(logged).toContain('[Tomcat 9] First line');
      expect(logged).toContain('[Tomcat 9] Second half of second');
      expect(logged).toContain('[Tomcat 9] Third line');
      // Should NOT have logged the partial "Second half" alone
      expect(logged).not.toContain('[Tomcat 9] Second half');
    });
  });

  describe('buildEnv', () => {
    it('does not set JAVA_OPTS / CATALINA_OPTS when config opts are empty', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);
      const previousJavaOpts = process.env.JAVA_OPTS;
      const previousCatalinaOpts = process.env.CATALINA_OPTS;
      process.env.JAVA_OPTS = '-Xmx2g';
      process.env.CATALINA_OPTS = '-Dfoo=bar';

      try {
        const runner = new ProcessRunner(outputChannel as any);
        await runner.run(sampleConfig as any);

        const spawnCall = mockSpawn.mock.calls[0];
        const opts = spawnCall[2];
        // Empty config opts should leave the user's env untouched
        expect(opts.env.JAVA_OPTS).toBe('-Xmx2g');
        expect(opts.env.CATALINA_OPTS).toBe('-Dfoo=bar');
      } finally {
        process.env.JAVA_OPTS = previousJavaOpts;
        process.env.CATALINA_OPTS = previousCatalinaOpts;
      }
    });

    it('sets JAVA_OPTS / CATALINA_OPTS when provided', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run({
        server: sampleServer,
        catalinaOpts: '-Xms256m',
        javaOpts: '-Denv=test',
      } as any);

      const opts = mockSpawn.mock.calls[0][2];
      expect(opts.env.JAVA_OPTS).toBe('-Denv=test');
      expect(opts.env.CATALINA_OPTS).toBe('-Xms256m');
    });
  });

  describe('stop', () => {
    it('throws if shutdown script not found', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      (fs.promises.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      await expect(runner.stop(sampleConfig as any)).rejects.toThrow('Shutdown script not found');
    });

    it('runs shutdown script and cleans up tracked process', async () => {
      const startProc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(startProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);

      const shutdownProc = createFakeProcess();
      mockSpawn.mockReturnValueOnce(shutdownProc);

      const stopPromise = runner.stop(sampleConfig as any);

      // Flush microtasks so stop()'s async script-existence check completes
      // and listeners are attached before we emit close events.
      await new Promise(r => setImmediate(r));

      shutdownProc.emit('close', 0);
      startProc.exitCode = 0;
      startProc.emit('close', 0);

      await stopPromise;
      expect(runner.isRunning('tomcat9')).toBe(false);
    });
  });

  describe('isAnyRunning + onDidChangeRunning', () => {
    it('isAnyRunning returns false when nothing has been spawned', () => {
      const runner = new ProcessRunner(outputChannel as any);
      expect(runner.isAnyRunning()).toBe(false);
    });

    it('isAnyRunning flips true after run and false after process close', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      await runner.run(sampleConfig as any);
      expect(runner.isAnyRunning()).toBe(true);

      fakeProc.exitCode = 0;
      fakeProc.emit('close', 0);
      expect(runner.isAnyRunning()).toBe(false);
    });

    it('onDidChangeRunning fires on spawn and on close', async () => {
      const fakeProc = createFakeProcess();
      mockSpawn.mockReturnValue(fakeProc);

      const runner = new ProcessRunner(outputChannel as any);
      const fired: boolean[] = [];
      runner.onDidChangeRunning(() => fired.push(runner.isAnyRunning()));

      await runner.run(sampleConfig as any);
      fakeProc.exitCode = 0;
      fakeProc.emit('close', 0);

      expect(fired).toEqual([true, false]);
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

      expect(runner.isRunning('tomcat9')).toBe(false);
    });
  });
});
