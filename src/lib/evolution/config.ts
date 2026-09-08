import { z } from 'zod';

const evolutionEnvSchema = z.object({
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().min(8).optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(8).optional(),
  AUTH_URL: z.string().url().optional(),
});

export type EvolutionConfig = {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
};

export function getEvolutionConfig(): EvolutionConfig | null {
  const parsed = evolutionEnvSchema.safeParse(process.env);
  if (!parsed.success) return null;

  const { EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET } = parsed.data;
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_WEBHOOK_SECRET) {
    return null;
  }

  return {
    apiUrl: EVOLUTION_API_URL.replace(/\/$/, ''),
    apiKey: EVOLUTION_API_KEY,
    webhookSecret: EVOLUTION_WEBHOOK_SECRET,
  };
}

export function requireEvolutionConfig(): EvolutionConfig {
  const config = getEvolutionConfig();
  if (!config) {
    throw new Error(
      'Evolution API não configurada. Defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_WEBHOOK_SECRET.',
    );
  }
  return config;
}

/** URL que a Evolution (Docker) chama de volta no CRM (porta 3001). */
export function evolutionWebhookTargetUrl(): string {
  const cfg = requireEvolutionConfig();
  const authUrl = process.env.AUTH_URL ?? 'http://localhost:3001';
  const normalized = authUrl.replace(/\/$/, '');
  const publicUrl = normalized
    .replace('http://localhost:3001', 'http://host.docker.internal:3001')
    .replace('http://127.0.0.1:3001', 'http://host.docker.internal:3001');
  return `${publicUrl}/api/webhooks/evolution?token=${encodeURIComponent(cfg.webhookSecret)}`;
}
