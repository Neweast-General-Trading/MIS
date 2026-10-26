import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ActivityTemplateEntity,
  type ActivityTemplateField,
} from './entities/activity-template.entity';
import { UpsertActivityTemplateDto } from './dto/upsert-activity-template.dto';
import { ProcessEntity } from 'src/processes/entities/process.entity';
import { enforceFixedTemplateFields } from 'src/common/activity-template-field-types';

/**
 * Default sub-process template name (stable for DB lookups after purge).
 * Field layout: standard activity sheet (SI.No … External Compliance).
 */
export const DEFAULT_BPM_RACI_TEMPLATE_NAME = 'stander_BPM_TEMP';

@Injectable()
export class ActivityTemplatesService implements OnModuleInit {
  constructor(
    @InjectRepository(ActivityTemplateEntity)
    private readonly templateRepository: Repository<ActivityTemplateEntity>,
    @InjectRepository(ProcessEntity)
    private readonly processRepository: Repository<ProcessEntity>,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultRaciTemplate();
    await this.lockFixedFieldsOnAllTemplates();
  }

  /** Scope / Orchestration / Support / System / Process Type / Frequency are fixed-value fields in every template. */
  private async lockFixedFieldsOnAllTemplates(): Promise<void> {
    const templates = await this.templateRepository.find();
    for (const t of templates) {
      const next = enforceFixedTemplateFields(t.fields ?? []);
      if (JSON.stringify(next) !== JSON.stringify(t.fields ?? [])) {
        t.fields = next;
        // eslint-disable-next-line no-await-in-loop
        await this.templateRepository.save(t);
      }
    }
  }

  /**
   * Standard activity columns (SI.No … External Compliance) in a fixed order for Excel / grid paste alignment.
   * Creates if missing; if this template name already exists, **replaces fields** so the seed stays aligned on API start.
   */
  async ensureDefaultRaciTemplate(): Promise<void> {
    const fields = this.buildStandardActivityTemplateFields();
    const description =
      'Standard activity sheet: SI.No, Activity ID, Activity Name, Activity Description, Risks, Policies, Reports, Dashboard, Controls, Approvals Req, Internal Compliance, External Compliance.';

    const existing = await this.templateRepository.findOne({
      where: { name: DEFAULT_BPM_RACI_TEMPLATE_NAME },
    });
    if (existing) {
      existing.fields = fields;
      existing.description = description;
      await this.templateRepository.save(existing);
      return;
    }

    await this.templateRepository.save(
      this.templateRepository.create({
        name: DEFAULT_BPM_RACI_TEMPLATE_NAME,
        description,
        fields,
      }),
    );
  }

  private buildStandardActivityTemplateFields(): ActivityTemplateField[] {
    return [
      { key: 'si_no', label: 'SI.No', type: 'text', openToDiscussion: false },
      { key: 'activity_id', label: 'Activity ID', type: 'text', openToDiscussion: false },
      { key: 'activity_name', label: 'Activity Name', type: 'text', openToDiscussion: false },
      {
        key: 'activity_description',
        label: 'Activity Description',
        type: 'textarea',
        openToDiscussion: true,
      },
      { key: 'risks', label: 'Risks', type: 'textarea', openToDiscussion: true },
      { key: 'policies', label: 'Policies', type: 'textarea', openToDiscussion: true },
      { key: 'reports', label: 'Reports', type: 'textarea', openToDiscussion: false },
      { key: 'dashboard', label: 'Dashboard', type: 'textarea', openToDiscussion: false },
      { key: 'controls', label: 'Controls', type: 'textarea', openToDiscussion: true },
      {
        key: 'approvals_req',
        label: 'Approvals Req',
        type: 'yes_no',
        openToDiscussion: false,
      },
      {
        key: 'internal_compliance',
        label: 'Internal Compliance',
        type: 'textarea',
        openToDiscussion: false,
      },
      {
        key: 'external_compliance',
        label: 'External Compliance',
        type: 'textarea',
        openToDiscussion: false,
      },
    ];
  }

  findAll() {
    return this.templateRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template)
      throw new NotFoundException('Sub-process template not found.');
    return template;
  }

  async create(input: UpsertActivityTemplateDto) {
    const exists = await this.templateRepository.findOne({
      where: { name: input.name.trim() },
    });
    if (exists) throw new ConflictException('Template name already exists.');

    const template = this.templateRepository.create({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      fields: enforceFixedTemplateFields(input.fields),
    });
    return this.templateRepository.save(template);
  }

  async update(id: string, input: UpsertActivityTemplateDto) {
    const template = await this.findOne(id);
    const exists = await this.templateRepository.findOne({
      where: { name: input.name.trim() },
    });
    if (exists && exists.id !== template.id)
      throw new ConflictException('Template name already exists.');

    template.name = input.name.trim();
    template.description = input.description?.trim() || null;
    template.fields = enforceFixedTemplateFields(input.fields);

    return this.templateRepository.save(template);
  }

  async remove(id: string) {
    const template = await this.findOne(id);
    if (template.name === DEFAULT_BPM_RACI_TEMPLATE_NAME) {
      throw new BadRequestException(
        `Default template "${DEFAULT_BPM_RACI_TEMPLATE_NAME}" cannot be deleted.`,
      );
    }
    const usedCount = await this.processRepository.count({
      where: { activityTemplateId: id },
    });
    if (usedCount > 0) {
      throw new ConflictException(
        'Cannot delete this template because it is assigned to existing processes.',
      );
    }
    await this.templateRepository.delete({ id });
    return { deleted: true as const };
  }
}
