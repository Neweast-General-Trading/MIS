import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';

import {
  embedMermaidDiagramsInMarkdown,
  polishMarkdownForWord,
} from './ai-bpm-mermaid-images';

const execFileAsync = promisify(execFile);

@Injectable()
export class AiBpmPandocService {
  private readonly logger = new Logger(AiBpmPandocService.name);

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('pandoc', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  async markdownToDocxBuffer(markdown: string): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'bpm-ai-doc-'));
    const mdPath = join(dir, 'document.md');
    const docxPath = join(dir, 'document.docx');

    try {
      const polished = polishMarkdownForWord(markdown);
      const { markdown: withImages } = await embedMermaidDiagramsInMarkdown(
        polished,
        dir,
      );

      await writeFile(mdPath, withImages, 'utf8');
      await execFileAsync(
        'pandoc',
        [
          mdPath,
          '-o',
          docxPath,
          '--from=markdown',
          '--to=docx',
          '--standalone',
          `--resource-path=${dir}`,
        ],
        { cwd: dir },
      );

      return await readFile(docxPath);
    } catch (err) {
      this.logger.warn('Pandoc conversion failed', err);
      throw err;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
