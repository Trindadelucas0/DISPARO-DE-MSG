import { InteractionType, PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

/**
 * Seed idempotente: admin, tags do PRD e três templates de mensagem.
 *
 * Os templates são rascunhos operacionais plausíveis, NÃO copy validada em
 * campo. Estão marcados como tal em PRODUCT.md e devem ser reescritos pelo
 * time de vendas antes do primeiro disparo real.
 */

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

/**
 * Cor da tag usa apenas neutro e o acento único da marca. As cores semânticas
 * são reservadas aos 7 status do funil e aos resultados de interação.
 */
const TAGS: ReadonlyArray<{ name: string; color: 'neutral' | 'accent' }> = [
  { name: 'HOT', color: 'accent' },
  { name: 'URGENTE', color: 'accent' },
  { name: 'VIP', color: 'accent' },
  { name: 'INTERESSE', color: 'neutral' },
  { name: 'REVENDA', color: 'neutral' },
  { name: 'INDÚSTRIA', color: 'neutral' },
  { name: 'PRIORIDADE', color: 'accent' },
];

const TEMPLATES: ReadonlyArray<{
  name: string;
  channel: InteractionType;
  subject?: string;
  body: string;
  variables: string[];
}> = [
  {
    name: 'Primeiro contato — WhatsApp',
    channel: InteractionType.WHATSAPP,
    body: [
      'Olá! Falo com o responsável da {{razaoSocial}}?',
      '',
      'Sou {{vendedor}} e trabalho com locação de estrutura para eventos.',
      'Vi que vocês atuam em {{cidade}}/{{estado}} no mesmo segmento e queria entender',
      'se hoje vocês terceirizam palco e cobertura em alguma demanda.',
      '',
      'Se fizer sentido, te mando a tabela. Posso?',
    ].join('\n'),
    variables: ['razaoSocial', 'cidade', 'estado', 'vendedor'],
  },
  {
    name: 'Follow-up — sem resposta',
    channel: InteractionType.WHATSAPP,
    body: [
      'Oi! Passando de novo aqui sobre a {{nomeFantasia}}.',
      '',
      'Não sei se a mensagem anterior chegou. Se o momento não for bom, me diz',
      'que eu retomo mais pra frente — sem problema.',
      '',
      'Se quiser ver a tabela agora, respondo em seguida.',
    ].join('\n'),
    variables: ['nomeFantasia'],
  },
  {
    name: 'Apresentação — e-mail',
    channel: InteractionType.EMAIL,
    subject: 'Locação de palco e cobertura — {{razaoSocial}}',
    body: [
      'Olá,',
      '',
      'Sou {{vendedor}}. Entro em contato porque a {{razaoSocial}} atua com estrutura',
      'para eventos em {{cidade}}/{{estado}}, e trabalhamos com locação de palco,',
      'cobertura e estrutura metálica para complementar demanda de pico.',
      '',
      'Se houver interesse, respondo com a tabela e a disponibilidade da região.',
      '',
      'Atenciosamente,',
      '{{vendedor}}',
    ].join('\n'),
    variables: ['razaoSocial', 'cidade', 'estado', 'vendedor'],
  },
];

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@crm.local').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrador';

  if (!password || password.length < 10) {
    throw new Error(
      'SEED_ADMIN_PASSWORD ausente ou com menos de 10 caracteres. Defina no .env antes de rodar o seed.',
    );
  }

  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email },
    // A senha não é reescrita em re-execução: o seed não derruba uma senha
    // que o usuário já trocou pela interface.
    update: { name, role: 'ADMIN', active: true },
    create: { email, name, role: 'ADMIN', active: true, passwordHash },
  });

  console.log(`admin: ${admin.email}`);

  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: { color: tag.color },
      create: tag,
    });
  }
  console.log(`tags: ${TAGS.length}`);

  for (const template of TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { name: template.name },
      update: {
        channel: template.channel,
        subject: template.subject ?? null,
        body: template.body,
        variables: template.variables,
        active: true,
      },
      create: {
        name: template.name,
        channel: template.channel,
        subject: template.subject ?? null,
        body: template.body,
        variables: template.variables,
        createdById: admin.id,
      },
    });
  }
  console.log(`templates: ${TEMPLATES.length}`);
}

main()
  .catch((error: unknown) => {
    console.error('seed falhou:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
