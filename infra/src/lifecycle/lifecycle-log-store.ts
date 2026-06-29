import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LifecycleLogPort } from '../core/ports';
import { LifecycleLogEntry } from '../core/types';

export class JsonlLifecycleLogStore implements LifecycleLogPort {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly logDir: string) {}

  async appendLifecycle(entry: LifecycleLogEntry): Promise<void> {
    await this.append('lifecycle.jsonl', entry);
  }

  async appendFailure(entry: LifecycleLogEntry): Promise<void> {
    await this.append('failures.jsonl', entry);
  }

  async appendAgentDecision(entry: LifecycleLogEntry): Promise<void> {
    await this.append('agent-decisions.jsonl', entry);
  }

  async readLifecycle(runId?: string): Promise<LifecycleLogEntry[]> {
    const entries = await this.read('lifecycle.jsonl');
    return entries.filter((entry) => !runId || entry.runId === runId);
  }

  async readFailures(): Promise<LifecycleLogEntry[]> {
    return this.read('failures.jsonl');
  }

  async readAgentDecisions(): Promise<LifecycleLogEntry[]> {
    return this.read('agent-decisions.jsonl');
  }

  private async read(fileName: string): Promise<LifecycleLogEntry[]> {
    const file = join(this.logDir, fileName);
    try {
      const contents = await readFile(file, 'utf8');
      return contents
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LifecycleLogEntry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async append(fileName: string, entry: LifecycleLogEntry) {
    const operation = this.writeChain.then(async () => {
      await mkdir(this.logDir, { recursive: true });
      await appendFile(
        join(this.logDir, fileName),
        `${JSON.stringify(entry)}\n`,
      );
    });
    this.writeChain = operation.catch(() => undefined);
    await operation;
  }
}
