import { SetMetadata } from '@nestjs/common';

export const REQUIRE_AI_ACCESS_KEY = 'require_ai_access';

/** Super Admin or a user on the AI allow-list (`AI_EXPORT_ALLOWED_EMAILS`). */
export const RequireAiAccess = () => SetMetadata(REQUIRE_AI_ACCESS_KEY, true);
