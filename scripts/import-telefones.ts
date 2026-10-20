/**
 * Carga do pacote TELEFONES (lista empresarial + listas de telefone avulso).
 *
 * Dois modos, e só o segundo escreve:
 *   npm run import:telefones -- preview     # analisa e mostra totais
 *   npm run import:telefones -- apply       # grava, depois da prévia passar
 *
 * Opções:
 *   --dir <caminho>      pasta das fontes (default data/fontes-telefones/raw)
 *   --all-situacoes      importa também empresa não-ativa (default: só ATIVA)
 *   --sem-relatorio      não grava o arquivo de relatório
 *
 * A carga NÃO cria campanha e NÃO envia mensagem. Disparo continua sendo ato
 * manual na tela de campanhas, com conta WhatsApp conectada.
 *
 * Nenhuma lista de telefone vai para o log: o relatório traz contagem, motivo
 * de rejeição e no máximo o final de 4 dígitos de uma amostra.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

import { prisma } from '@/lib/db';
import { closeRedis } from '@/lib/redis';
import { detectColumns } from '@/server/services/import/columns';
import {
  applyContactImportPlan,
  buildContactImportPlan,
  type ContactImportPlan,
} from '@/server/services/contact-import.service';
import {
  type ImportPreview,
  buildPreview,
  createImportJob,
  failImportJob,
  readWorkbookFromFile,
  runImport,
} from '@/server/services/import.service';

const DEFAULT_DIR = join('data', 'fontes-telefones', 'raw');
const REPORT_DIR = join('data', 'fontes-telefones', 'relatorios');
const SOURCE_EXTENSIONS = new Set(['.xlsx', '.csv']);

type Mode = 'preview' | 'apply';

interface Options {
  readonly mode: Mode;
  readonly dir: string;
  readonly onlyActive: boolean;
  readonly writeReport: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const args = [...argv];
  const mode = args.find((arg) => arg === 'preview' || arg === 'apply') as Mode | undefined;
  if (!mode) {
    throw new Error('Informe o modo: `preview` (não grava) ou `apply` (grava).');
  }

  const dirIndex = args.indexOf('--dir');
  const dir = dirIndex === -1 ? DEFAULT_DIR : args[dirIndex + 1];
  if (!dir) throw new Error('`--dir` sem caminho.');

  return {
    mode,
    dir: resolve(process.cwd(), dir),
    onlyActive: !args.includes('--all-situacoes'),
    writeReport: !args.includes('--sem-relatorio'),
  };
}

function discoverSources(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string, depth: number): void => {
    if (depth > 4) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) found.push(fullPath);
    }
  };
  walk(root, 0);
  return found.sort();
}

/**
 * Planilha de empresa ou lista de telefone?
 *
 * Decide pelo conteúdo, não pelo nome do arquivo: só é tratada como empresa a
 * planilha cujo cabeçalho tem CNPJ e razão social.
 */
async function isCompanySheet(filePath: string): Promise<boolean> {
  if (extname(filePath).toLowerCase() !== '.xlsx') return false;
  try {
    const sheet = await readWorkbookFromFile(filePath);
    const detection = detectColumns(sheet.headers);
    return detection.mapping.cnpj !== undefined && detection.mapping.razaoSocial !== undefined;
  } catch {
    return false;
  }
}

// --- Relatório ------------------------------------------------------------

const lines: string[] = [];

function say(line = ''): void {
  lines.push(line);
  console.log(line);
}

function row(label: string, value: number | string): void {
  say(`  ${label.padEnd(38, '.')} ${String(value).padStart(9)}`);
}

function reportCompany(fileName: string, preview: ImportPreview): void {
  say(`--- empresas: ${fileName}`);
  row('linhas de dados', preview.totalRows);
  row('aceitas (passam na validação)', preview.validRows);
  row('ignoradas por situação ≠ ATIVA', preview.inactiveRows);
  row('rejeitadas na validação', preview.invalidRows);
  row('repetidas dentro do arquivo', preview.duplicatesInFile.length);
  row('CNPJ que já existe no banco', preview.existingInDatabase);
  row('com celular (entra em campanha)', preview.withWhatsapp);
  row('  celular recuperado do formato antigo', preview.legacyUpgraded);
  row('só fixo (fica fora de campanha)', preview.landlineOnly);
  row('sem telefone nenhum', preview.withoutPhone);
  row('com campo descartado (aviso)', preview.warningRows);
  if (preview.missingRequired.length > 0) {
    say(`  COLUNAS OBRIGATÓRIAS AUSENTES: ${preview.missingRequired.map((f) => f.label).join(', ')}`);
  }
  if (preview.unmappedHeaders.length > 0) {
    say(`  colunas sem campo (vão para rawImport): ${preview.unmappedHeaders.map((h) => h.header).join(', ')}`);
  }
  say();
}

function reportContacts(plan: ContactImportPlan): void {
  say('--- listas de telefone avulso');
  for (const file of plan.files) {
    say(`  ${file.file}: ${file.rows} linhas`);
  }
  row('linhas lidas', plan.totals.rowsRead);
  row('números repetidos entre as fontes', plan.totals.duplicateInSources);
  row('números inválidos (rejeitados)', plan.totals.invalid);
  row('números únicos aproveitados', plan.totals.uniquePhones);
  row('  celular (entra em campanha)', plan.totals.mobile);
  row('    recuperado do formato antigo', plan.totals.legacyUpgraded);
  row('  fixo (fica fora de campanha)', plan.totals.landline);
  row('já são de empresa cadastrada', plan.totals.linkedToCompany);
  row('  empresa que ganha WhatsApp vazio', plan.totals.fillCompanyWhatsapp);
  row('já são contato cadastrado', plan.totals.existingContact);
  row('contato que ganha nome real', plan.totals.renamePlaceholder);
  row('contatos novos a criar', plan.totals.toCreate);
  row('  com nome na fonte', plan.totals.withName);
  row('  sem nome (final XXXX)', plan.totals.withoutName);

  if (plan.invalidByReason.length > 0) {
    say('  motivos de rejeição:');
    for (const reason of plan.invalidByReason) {
      say(`    ${reason.count.toString().padStart(6)}  ${reason.reason}`);
    }
  }
  if (plan.cnpjCollisions.length > 0) {
    say(`  COLISÃO de CNPJ técnico em ${plan.cnpjCollisions.length} caso(s): nada será gravado.`);
  }

  const sample = plan.entries.filter((entry) => entry.action === 'create').slice(0, 5);
  if (sample.length > 0) {
    say('  amostra do que seria criado:');
    for (const entry of sample) {
      const name = entry.name ?? '(sem nome)';
      say(`    final ${entry.digits.slice(-4)}  ${entry.kind === 'mobile' ? 'celular' : 'fixo   '}  ${name}`);
    }
  }
  say();
}

interface Snapshot {
  readonly leads: number;
  readonly withWhatsapp: number;
  readonly withPhone: number;
  readonly contacts: number;
}

/**
 * Contagem de contato avulso pela ORIGEM, não pelo prefixo do CNPJ: há CNPJ
 * de verdade começando em 00, e o CNPJ técnico também começa em 00.
 */
async function snapshot(phoneFiles: readonly string[]): Promise<Snapshot> {
  const origins = phoneFiles.map((filePath) => basename(filePath));
  const [leads, withWhatsapp, withPhone, contacts] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { NOT: { whatsapp: null } } }),
    prisma.lead.count({ where: { NOT: { telefone: null } } }),
    origins.length === 0 ? 0 : prisma.lead.count({ where: { origem: { in: origins } } }),
  ]);
  return { leads, withWhatsapp, withPhone, contacts };
}

// --- Execução -------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!statSync(options.dir).isDirectory()) {
    throw new Error(`Não é uma pasta: ${options.dir}`);
  }

  const sources = discoverSources(options.dir);
  if (sources.length === 0) {
    throw new Error(`Nenhum .xlsx/.csv em ${options.dir}`);
  }

  const companyFiles: string[] = [];
  const phoneFiles: string[] = [];
  for (const source of sources) {
    if (await isCompanySheet(source)) companyFiles.push(source);
    else phoneFiles.push(source);
  }

  say(`modo: ${options.mode.toUpperCase()}${options.mode === 'preview' ? ' (nada é gravado)' : ''}`);
  say(`pasta: ${relative(process.cwd(), options.dir)}`);
  say(`somente empresas ativas: ${options.onlyActive ? 'SIM' : 'não'}`);
  say(`planilhas de empresa: ${companyFiles.length} · listas de telefone: ${phoneFiles.length}`);
  say();

  const before = await snapshot(phoneFiles);
  say(`leads no banco antes: ${before.leads}`);
  say();

  // --- Prévia: sempre roda, nos dois modos. -------------------------------
  const companyPreviews: { file: string; sheet: Awaited<ReturnType<typeof readWorkbookFromFile>>; preview: ImportPreview }[] = [];
  for (const filePath of companyFiles) {
    const fileName = basename(filePath);
    const sheet = await readWorkbookFromFile(filePath);
    const preview = await buildPreview(sheet, {
      onlyActive: options.onlyActive,
      origem: fileName,
      fillExistingContacts: true,
    });
    reportCompany(fileName, preview);
    companyPreviews.push({ file: fileName, sheet, preview });
  }

  const contactPlan =
    phoneFiles.length > 0 ? await buildContactImportPlan(phoneFiles) : null;
  if (contactPlan) reportContacts(contactPlan);

  const blocking: string[] = [];
  for (const entry of companyPreviews) {
    if (entry.preview.missingRequired.length > 0) {
      blocking.push(`${entry.file}: colunas obrigatórias ausentes`);
    }
    if (entry.preview.validRows === 0) {
      blocking.push(`${entry.file}: nenhuma linha válida`);
    }
  }
  if (contactPlan && contactPlan.cnpjCollisions.length > 0) {
    blocking.push('listas de telefone: CNPJ técnico colidindo entre números diferentes');
  }

  if (blocking.length > 0) {
    say('VALIDAÇÃO REPROVADA:');
    for (const problem of blocking) say(`  - ${problem}`);
    say('Nada foi gravado.');
    process.exitCode = 1;
    return;
  }

  const after = await snapshot(phoneFiles);
  if (options.mode === 'preview') {
    say('prévia concluída. Validações passaram.');
    say(
      before.leads === after.leads
        ? `banco intacto: ${after.leads} leads antes e depois.`
        : `ATENÇÃO: contagem de leads mudou durante a prévia (${before.leads} → ${after.leads}).`,
    );
    await finishReport(options);
    return;
  }

  // --- Gravação ----------------------------------------------------------
  say('=== gravando ===');
  say();

  for (const entry of companyPreviews) {
    const job = await createImportJob({
      fileName: entry.file,
      source: 'cli',
      onlyActive: options.onlyActive,
      userId: null,
    });
    try {
      const result = await runImport(entry.sheet, {
        jobId: job.id,
        userId: null,
        onlyActive: options.onlyActive,
        origem: entry.file,
        fillExistingContacts: true,
      });
      say(`--- empresas: ${entry.file}`);
      row('inseridas', result.insertedRows);
      row('atualizadas (contato vazio preenchido)', result.updatedRows);
      row('já existiam sem nada a completar', result.skippedRows - result.updatedRows);
      row('rejeitadas', result.failedRows);
      row('ignoradas por situação', result.inactiveRows);
      say(`  job: ${job.id}`);
      say();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failImportJob(job.id, message);
      say(`  FALHOU: ${message}`);
      process.exitCode = 1;
      await finishReport(options);
      return;
    }
  }

  if (contactPlan) {
    // Replaneja depois da carga das empresas: números que agora pertencem a uma
    // empresa não podem nascer como contato avulso.
    const replanned = await buildContactImportPlan(phoneFiles);
    const result = await applyContactImportPlan(replanned);
    say('--- listas de telefone avulso');
    row('contatos criados', result.created);
    row('empresas com WhatsApp preenchido', result.filledCompanyWhatsapp);
    row('contatos com WhatsApp preenchido', result.filledContactWhatsapp);
    row('contatos que ganharam nome real', result.renamedPlaceholder);
    row('contatos com campo vazio completado', result.completedContact);
    row('ligados a empresa já cadastrada', replanned.totals.linkedToCompany);
    row('já cadastrados (nada a fazer)', replanned.totals.existingContact);
    say();
  }

  const final = await snapshot(phoneFiles);
  say('=== resumo ===');
  row('leads antes', before.leads);
  row('leads agora', final.leads);
  row('com celular (campanha)', final.withWhatsapp);
  row('com telefone', final.withPhone);
  row('contatos sem CNPJ', final.contacts);
  say();
  say('Nenhuma campanha foi criada e nenhuma mensagem foi enviada.');

  await finishReport(options);
}

async function finishReport(options: Options): Promise<void> {
  if (!options.writeReport) return;
  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(REPORT_DIR, `${stamp}-${options.mode}.txt`);
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  console.log(`relatório: ${file}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeRedis();
  });
