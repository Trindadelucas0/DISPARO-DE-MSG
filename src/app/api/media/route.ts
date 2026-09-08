import type { NextRequest } from 'next/server';

import { requireSession } from '@/lib/auth/rbac';
import { RATE_LIMITS, checkRateLimit, clientIp } from '@/lib/rate-limit';
import { BadRequestError, RateLimitError, handleApi } from '@/server/api-handler';
import { uploadMedia } from '@/server/services/media.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    const limit = await checkRateLimit(
      'media-upload',
      `${user.id}:${clientIp(request.headers)}`,
      RATE_LIMITS.mediaUpload,
    );
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSeconds);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new BadRequestError('Nenhum arquivo recebido no campo "file".');
    }
    return uploadMedia(user, file);
  });
}
