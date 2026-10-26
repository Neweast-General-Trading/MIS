import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { UpsertApplicationDto } from './dto/upsert-application.dto';
import { ApplicationEntity } from './entities/application.entity';

const clean = (value?: string | null) => value?.trim() || null;

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly repository: Repository<ApplicationEntity>,
  ) {}

  findAll() {
    return this.repository.find({ order: { name: 'ASC' } });
  }

  /** Names selectable in sub-process forms (retired applications are hidden). */
  async findOptions(): Promise<string[]> {
    const rows = await this.repository.find({
      select: { name: true, status: true },
      order: { name: 'ASC' },
    });
    return rows.filter((r) => r.status !== 'Retired').map((r) => r.name);
  }

  async findNameSet(): Promise<Set<string>> {
    const rows = await this.repository.find({ select: { name: true } });
    return new Set(rows.map((r) => r.name.trim().toLowerCase()));
  }

  async findOne(id: string) {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Application not found.');
    return row;
  }

  async create(input: UpsertApplicationDto, userEmail?: string | null) {
    await this.assertNameFree(input.name);
    return this.repository.save(
      this.repository.create({
        ...this.toColumns(input),
        createdBy: userEmail?.trim() || null,
      }),
    );
  }

  async update(id: string, input: UpsertApplicationDto) {
    const row = await this.findOne(id);
    await this.assertNameFree(input.name, id);
    Object.assign(row, this.toColumns(input));
    return this.repository.save(row);
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    await this.repository.remove(row);
    return { deleted: true };
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const existing = await this.repository.findOne({
      // ILike without wildcards = case-insensitive exact match.
      where: { name: ILike(name.trim().replace(/[%_\\]/g, '\\$&')) },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(
        `An application named "${existing.name}" already exists.`,
      );
    }
  }

  private toColumns(input: UpsertApplicationDto) {
    return {
      name: input.name.trim(),
      vendor: clean(input.vendor),
      category: input.category,
      hosting: input.hosting,
      status: input.status,
      description: clean(input.description),
      businessOwner: clean(input.businessOwner),
      itOwner: clean(input.itOwner),
      url: clean(input.url),
      companyCodes: [
        ...new Set(
          (input.companyCodes ?? [])
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean),
        ),
      ],
    };
  }
}
