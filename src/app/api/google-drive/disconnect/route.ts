import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { validateHostSessionRequest } from '@/lib/auth/session';
import { applySecurityHeaders } from '@/lib/security/headers';
import { IntegrationCredentialStore } from '@/lib/integrations/credential-store';
import { resetGoogleDriveTokenCache } from '@/features/material/storage/providers/google-drive';

export async function POST(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })
    );
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;

  const credStore = new IntegrationCredentialStore(env);
  await credStore.deleteCredential(hostUser.id, 'google_drive');
  resetGoogleDriveTokenCache();

  return applySecurityHeaders(NextResponse.json({ success: true, connected: false }));
}
