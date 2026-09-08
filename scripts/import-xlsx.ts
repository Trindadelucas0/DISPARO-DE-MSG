/**
 * Carga das planilhas do workspace pelo MESMO serviço usado pela tela /import.
 *
 * Uso:
 *   npm run import:xlsx                      # descobre os .xlsx do workspace
 *   npm run import:xlsx -- --all-situacoes   # importa também não-ativas
 *   npm run import:xlsx -- caminho/a.xlsx caminho/b.xlsx
 */
import { readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { prisma } from '@/lib/db';
import { closeRedis } from '@/lib/redis';
import {
  createImportJob,
  failImportJob,
  readWorkbookFromFile,
  runImport,
} from '@/server/services/import.service';

function discoverSpreadsheets(root: string): string[] {
  const found: string[] = [];

  const walk = (directory: string, depth: number): void => {
    if (depth > 2) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.startsWith('~$')) {
        found.push(fullPath);
      }
    }
  };

  walk(root, 0);
  return found.sort();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyActive = !args.includes('--all-situacoes');
  const explicitFiles = args.filter((arg) => !arg.startsWith('--'));

  const root = process.cwd();
  const files =
    explicitFiles.length > 0
      ? explicitFiles.map((file) => resolve(root, file))
      : discoverSpreadsheets(root);

  if (files.length === 0) {
    console.error('Nenhum arquivo .xlsx encontrado. Informe o caminho como argumento.');
    process.exitCode = 1;
    return;
  }

  console.log(`Filtro "somente empresas ativas": ${onlyActive ? 'LIGADO' : 'desligado'}`);
  console.log(`Arquivos: ${files.length}`);
  console.log('');

  const before = await prisma.lead.count();
  let totalInserted = 0;
  let totalFailed = 0;
  let totalInactive = 0;
  let totalWarning = 0;
  let totalRows = 0;

  for (const file of files) {
    if (!statSync(file).isFile()) {
      console.error(`ignorado (não é arquivo): ${file}`);
      continue;
    }

    const fileName = basename(file);
    console.log(`--- ${fileName}`);

    const job = await createImportJob({
      fileName,
      source: 'cli',
      onlyActive,
      userId: null,
    });

    try {
      const sheet = await readWorkbookFromFile(file);
      console.log(`    aba "${sheet.sheetName}", ${sheet.rows.length} linhas de dados`);

      const result = await runImport(sheet, {
        jobId: job.id,
        userId: null,
        onlyActive,
        origem: fileName,
      });

      totalRows += result.totalRows;
      totalInserted += result.insertedRows;
      totalFailed += result.failedRows;
      totalInactive += result.inactiveRows;
      totalWarning += result.warningRows;

      console.log(`    inseridos:            ${result.insertedRows}`);
      console.log(`    já existiam (CNPJ):   ${result.skippedRows}`);
      console.log(`    duplicados no arquivo:${result.duplicateRows}`);
      console.log(`    ignorados por situação:${result.inactiveRows}`);
      console.log(`    rejeitados (validação):${result.failedRows}`);
      console.log(`    entraram com campo descartado: ${result.warningRows}`);
      console.log(`    job: ${job.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failImportJob(job.id, message);
      console.error(`    FALHOU: ${message}`);
      process.exitCode = 1;
    }

    console.log('');
  }

  const [after, withEmail, withWhatsapp, withPhone] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { email: { not: null } } }),
    prisma.lead.count({ where: { whatsapp: { not: null } } }),
    prisma.lead.count({ where: { telefone: { not: null } } }),
  ]);

  console.log('=== resumo ===');
  console.log(`linhas lidas:              ${totalRows}`);
  console.log(`inseridos nesta execução:  ${totalInserted}`);
  console.log(`ignorados por situação:    ${totalInactive}`);
  console.log(`rejeitados na validação:   ${totalFailed}`);
  console.log(`campo descartado (aviso):  ${totalWarning}`);
  console.log(`leads antes:               ${before}`);
  console.log(`leads agora:               ${after}`);
  console.log('');
  console.log('=== cobertura de contato ===');
  console.log(`com e-mail:                ${withEmail}`);
  console.log(`com WhatsApp (celular):    ${withWhatsapp}`);
  console.log(`com telefone:              ${withPhone}`);
}

main()
  .catch((error: unknown) => {
    console.error('importação falhou:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Ambos precisam ser fechados: o pool do Prisma e o socket do Redis
    // (aberto pela invalidação de cache) mantêm o event loop vivo e o CLI
    // nunca encerra sozinho.
    await prisma.$disconnect();
    await closeRedis();
  });
