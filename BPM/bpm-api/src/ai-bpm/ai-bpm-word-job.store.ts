import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import type { ExportAiBpmWordDto } from './dto/export-ai-bpm-word.dto';

export type WordFileKind = 'bpm' | 'sop' | 'summary' | 'jd';

/** Everything about a Word job that must survive a restart of the service. */
export type PersistedWordJob = {
  id: string;
  ownerEmail: string;
  status: 'running' | 'done' | 'error';
  phase: WordFileKind;
  stage: string;
  label: string;
  progress: number;
  warningMessage?: string | null;
  note?: string | null;
  error?: string;
  createdAt: number;
  touchedAt: number;
  files: Partial<Record<WordFileKind, { filename: string }>>;
  hasKit: boolean;
  /** The request that started the job, so an interrupted job can be restarted. */
  dto?: ExportAiBpmWordDto;
  /** How many times the service restarted this job after an interruption. */
  resumes: number;
};

/**
 * Keeps Word jobs on disk: one folder per job holding its state, its finished .docx files,
 * the data the SOP and Summary are written from, and the processes finished so far.
 * A restart of the service therefore loses nothing that was already produced.
 */
export class WordJobStore {
  constructor(private readonly dir: string) {}

  private jobDir(id: string) {
    return join(this.dir, id.replace(/[^a-zA-Z0-9-]/g, ''));
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private async writeAtomic(
    path: string,
    data: string | Buffer,
  ): Promise<void> {
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, data);
    await rename(temporary, path);
  }

  async saveState(job: PersistedWordJob): Promise<void> {
    const folder = this.jobDir(job.id);
    await mkdir(folder, { recursive: true });
    await this.writeAtomic(join(folder, 'job.json'), JSON.stringify(job));
  }

  async saveFile(
    id: string,
    kind: WordFileKind,
    buffer: Buffer,
  ): Promise<void> {
    await this.writeAtomic(join(this.jobDir(id), `${kind}.docx`), buffer);
  }

  readFile(id: string, kind: WordFileKind): Promise<Buffer> {
    return readFile(join(this.jobDir(id), `${kind}.docx`));
  }

  async saveJson(
    id: string,
    name: 'kit' | 'partial',
    value: unknown,
  ): Promise<void> {
    const folder = this.jobDir(id);
    await mkdir(folder, { recursive: true });
    await this.writeAtomic(join(folder, `${name}.json`), JSON.stringify(value));
  }

  async loadJson<T>(id: string, name: 'kit' | 'partial'): Promise<T | null> {
    try {
      return JSON.parse(
        await readFile(join(this.jobDir(id), `${name}.json`), 'utf8'),
      ) as T;
    } catch {
      return null;
    }
  }

  async removeJson(id: string, name: 'kit' | 'partial'): Promise<void> {
    await rm(join(this.jobDir(id), `${name}.json`), { force: true });
  }

  async remove(id: string): Promise<void> {
    await rm(this.jobDir(id), { recursive: true, force: true });
  }

  async loadAll(): Promise<PersistedWordJob[]> {
    const jobs: PersistedWordJob[] = [];
    let names: string[] = [];
    try {
      names = await readdir(this.dir);
    } catch {
      return jobs;
    }
    for (const name of names) {
      try {
        const folder = join(this.dir, name);
        if (!(await stat(folder)).isDirectory()) continue;
        const raw = await readFile(join(folder, 'job.json'), 'utf8');
        jobs.push(JSON.parse(raw) as PersistedWordJob);
      } catch {
        /* a half-written or foreign folder is ignored */
      }
    }
    return jobs;
  }
}
