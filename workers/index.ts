/**
 * Processo separado do Next. Sobe todas as filas BullMQ e a sessão Baileys.
 * Uso: docker compose up -d (container crm-worker). Fallback local: npm run worker.
 */

import './load-env';

import { startBaileysSessionWorker } from './baileys-session';
import { startCampaignWorkers } from './campaign-worker';
import { startWhatsappInboundWorker } from './whatsapp-inbound-worker';
import { startWhatsappStatusWorker } from './whatsapp-status-worker';
import { startRoutingWorker } from './routing-worker';

async function main() {
  if (!process.env.REDIS_URL) {
    console.error('[worker] REDIS_URL ausente. Abortando.');
    process.exit(1);
  }

  startCampaignWorkers();
  startWhatsappInboundWorker();
  startWhatsappStatusWorker();
  startRoutingWorker();
  await startBaileysSessionWorker();

  console.log(
    '[worker] filas ativas: campaign-send, campaign-retry, whatsapp-inbound, whatsapp-status, conversation-routing + sessão Baileys',
  );
}

main().catch((error) => {
  console.error('[worker] falha ao iniciar:', error);
  process.exit(1);
});
