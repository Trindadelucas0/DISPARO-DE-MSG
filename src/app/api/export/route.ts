import { NextResponse, type NextRequest } from 'next/server';

import { dashboardFiltersSchema } from '@/features/dashboard/schema';
import { leadFiltersSchema } from '@/features/leads/schema';
import { requireSession } from '@/lib/auth/rbac';
import { clientIp } from '@/lib/rate-limit';
import { handleApi } from '@/server/api-handler';
import {
  assertExportRateLimit,
  exportLeadsCsv,
  exportLeadsXlsx,
} from '@/server/services/export.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    await assertExportRateLimit(user.id, clientIp(request.headers));

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const format = params.format === 'xlsx' ? 'xlsx' : 'csv';
    const filters = leadFiltersSchema.parse(params);
    const idsRaw = params.ids;
    const ids = idsRaw ? idsRaw.split(',').filter(Boolean).slice(0, 500) : undefined;

    if (format === 'xlsx') {
      const file = await exportLeadsXlsx(user, filters, ids);
      return new NextResponse(new Uint8Array(file.buffer), {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.filename}"`,
        },
      });
    }

    const file = await exportLeadsCsv(user, filters, ids);
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
      },
    });
  });
}

export async function POST(request: NextRequest) {
  return handleApi(async () => {
    const user = await requireSession();
    await assertExportRateLimit(user.id, clientIp(request.headers));
    const body = (await request.json()) as { ids?: string[]; format?: string };
    const format = body.format === 'xlsx' ? 'xlsx' : 'csv';
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500) : undefined;
    const filters = dashboardFiltersSchema.parse({});

    if (format === 'xlsx') {
      const file = await exportLeadsXlsx(
        user,
        { ...filters, page: 1, limit: 50, sort: 'createdAt', dir: 'desc' },
        ids,
      );
      return new NextResponse(new Uint8Array(file.buffer), {
        headers: {
          'Content-Type': file.contentType,
          'Content-Disposition': `attachment; filename="${file.filename}"`,
        },
      });
    }

    const file = await exportLeadsCsv(
      user,
      { ...filters, page: 1, limit: 50, sort: 'createdAt', dir: 'desc' },
      ids,
    );
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
      },
    });
  });
}
