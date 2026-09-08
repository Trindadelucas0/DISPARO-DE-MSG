/** Sonda temporária: confirma que o exceljs lê os arquivos com inlineStr. */
import { detectColumns } from '@/server/services/import/columns';
import { readWorkbookFromFile } from '@/server/services/import/parser';

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('uso: tsx scripts/probe-xlsx.ts <caminho.xlsx>');
    process.exit(1);
  }

  const sheet = await readWorkbookFromFile(filePath);
  console.log('aba:', sheet.sheetName);
  console.log('colunas:', sheet.headers.length);
  console.log('linhas de dados:', sheet.rows.length);
  console.log('cabecalho:', JSON.stringify(sheet.headers));

  const detection = detectColumns(sheet.headers);
  console.log('mapeadas:', Object.keys(detection.mapping).length);
  console.log('mapping:', JSON.stringify(detection.mapping));
  console.log('faltando obrigatorias:', detection.missingRequired);
  console.log(
    'nao mapeadas:',
    detection.unmappedHeaders.map((entry) => entry.header),
  );
  console.log('primeira linha:', JSON.stringify(sheet.rows[0]));
}

void main();
