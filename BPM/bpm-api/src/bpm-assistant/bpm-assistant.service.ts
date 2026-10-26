import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Repository } from 'typeorm';

import { DepartmentsService } from 'src/departments/departments.service';

import { AskBpmAssistantDto } from './dto/ask-bpm-assistant.dto';
import { BpmInquiryEntity } from './entities/bpm-inquiry.entity';

const ASSISTANT_SYSTEM_PROMPT = `You are a BPM assistant embedded in a Business Process Management application.
Answer questions using ONLY the BPM context JSON provided in the user message.
The context reflects process functions, processes, and sub-processes the signed-in user is allowed to see.
If the answer is not in the context, say you do not have that information in the user's authorized BPM data.
Be concise, practical, and structured. Use plain language without mentioning model vendors or automation brands.
When listing items, prefer codes and short names.`;

type AssistantContext = {
  processFunctions: Array<{
    code: string;
    name: string;
    companyCode: string | null;
    processes: Array<{
      code: string;
      name: string;
      companyCode: string | null;
      description: string | null;
      subProcesses: Array<{
        code: string;
        name: string;
        description: string | null;
        status: string;
        owners: string[];
      }>;
    }>;
  }>;
};

@Injectable()
export class BpmAssistantService {
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly departmentsService: DepartmentsService,
    @InjectRepository(BpmInquiryEntity)
    private readonly inquiryRepository: Repository<BpmInquiryEntity>,
  ) {}

  private getAnthropicClient(): Anthropic {
    const apiKey =
      process.env.BPM_ASSISTANT_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Assistant is not configured. Set ANTHROPIC_API_KEY in bpm-api/.env and restart the API.',
      );
    }
    if (!this.anthropic) {
      const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
      this.anthropic = new Anthropic({
        apiKey,
        ...(workspaceId
          ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }
          : {}),
      });
    }
    return this.anthropic;
  }

  private truncate(text: string | null | undefined, max = 400): string | null {
    const value = text?.trim();
    if (!value) return null;
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
  }

  private async buildAuthorizedContext(userEmail: string): Promise<AssistantContext> {
    const departments = await this.departmentsService.findAll(userEmail);

    return {
      processFunctions: departments.map((dept) => ({
        code: dept.code,
        name: dept.name,
        companyCode: dept.companyCode ?? null,
        processes: (dept.processes ?? []).map((proc) => ({
          code: proc.code,
          name: proc.processName?.trim() || proc.name || proc.code,
          companyCode: proc.companyCode ?? null,
          description: this.truncate(proc.processDescription || proc.description),
          subProcesses: (proc.activities ?? [])
            .slice()
            .sort((a, b) => a.sln - b.sln)
            .map((act) => ({
              code: act.code,
              name: act.activityName,
              description: this.truncate(act.activityDescription),
              status: act.status,
              owners: act.owners ?? [],
            })),
        })),
      })),
    };
  }

  private compactContextJson(context: AssistantContext): string {
    let json = JSON.stringify(context);
    const maxLen = 120_000;
    if (json.length <= maxLen) return json;

    const trimmed: AssistantContext = {
      processFunctions: context.processFunctions.map((pf) => ({
        ...pf,
        processes: pf.processes.map((proc) => ({
          ...proc,
          description: null,
          subProcesses: proc.subProcesses.slice(0, 40).map((sp) => ({
            ...sp,
            description: null,
          })),
        })),
      })),
    };
    json = JSON.stringify(trimmed);
    return json.length <= maxLen ? json : json.slice(0, maxLen);
  }

  async ask(userEmail: string, dto: AskBpmAssistantDto) {
    const question = dto.question.trim();
    const pagePath = dto.pagePath?.trim() || null;

    await this.inquiryRepository.save(
      this.inquiryRepository.create({
        userEmail,
        question,
        pagePath,
      }),
    );

    const context = await this.buildAuthorizedContext(userEmail);
    const contextJson = this.compactContextJson(context);

    const model =
      process.env.BPM_ASSISTANT_MODEL?.trim() ||
      process.env.ANTHROPIC_MODEL?.trim() ||
      'claude-sonnet-4-6';

    const client = this.getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: ASSISTANT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Authorized BPM context (JSON):\n${contextJson}\n\nUser question:\n${question}${
                pagePath ? `\n\nCurrent page path: ${pagePath}` : ''
              }`,
            },
          ],
        },
      ],
    });

    const answer = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!answer) {
      throw new ServiceUnavailableException('Assistant returned an empty response.');
    }

    return { answer };
  }

  async listInquiries(params: {
    page: number;
    pageSize: number;
    user?: string;
    q?: string;
  }) {
    const page = Math.max(params.page, 1);
    const pageSize = Math.min(Math.max(params.pageSize, 1), 100);
    const skip = (page - 1) * pageSize;

    const qb = this.inquiryRepository
      .createQueryBuilder('inquiry')
      .orderBy('inquiry.createdAt', 'DESC');

    const user = params.user?.trim().toLowerCase();
    if (user) {
      qb.andWhere('LOWER(inquiry.userEmail) LIKE :user', { user: `%${user}%` });
    }

    const q = params.q?.trim();
    if (q) {
      qb.andWhere(
        '(inquiry.question ILIKE :q OR COALESCE(inquiry.pagePath, \'\') ILIKE :q)',
        { q: `%${q}%` },
      );
    }

    const [rows, total] = await qb.skip(skip).take(pageSize).getManyAndCount();

    return {
      rows: rows.map((row) => ({
        id: row.id,
        userEmail: row.userEmail,
        question: row.question,
        pagePath: row.pagePath,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: { page, pageSize, total },
    };
  }
}
