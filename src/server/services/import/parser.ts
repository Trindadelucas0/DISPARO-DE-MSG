import ExcelJS from 'exceljs';

/**
 * Leitura de XLSX.
 *
 * As planilhas de origem gravam texto em `inlineStr`
 * (`<c t="inlineStr"><is><t>valor</t></is></c>`) em vez de `sharedStrings`.
 * O `exceljs` resolve os dois formatos; parser ingênuo devolve célula vazia.
 * O pacote `xlsx` do npm está descartado (CVE de prototype pollution na versão
 * publicada no registry).
 */

export interface SheetData {
  readonly sheetName: string;
  readonly headers: readonly string[];
  /** Linhas de dados na ordem do arquivo. O índice 0 é a linha 2 da planilha. */
  readonly rows: readonly (readonly string[])[];
}

/** Converte qualquer variação de célula do exceljs em string limpa. */
export function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('').trim();
    }
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellToString(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
  }

  return String(value).trim();
}

function readSheet(worksheet: ExcelJS.Worksheet): SheetData {
  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(worksheet.columnCount, headerRow.cellCount);

  const headers: string[] = [];
  for (let column = 1; column <= columnCount; column += 1) {
    headers.push(cellToString(headerRow.getCell(column).value));
  }

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: string[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      values.push(cellToString(row.getCell(column).value));
    }
    // Linha totalmente vazia no fim do arquivo não é erro de dado.
    if (values.some((value) => value.length > 0)) rows.push(values);
  });

  return { sheetName: worksheet.name, headers, rows };
}

/** Escolhe a aba `empresas` quando existir; senão, a primeira com conteúdo. */
function pickWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const preferred = workbook.worksheets.find(
    (sheet) => sheet.name.trim().toLowerCase() === 'empresas',
  );
  const chosen = preferred ?? workbook.worksheets.find((sheet) => sheet.rowCount > 1);
  if (!chosen) {
    throw new Error('A planilha não tem nenhuma aba com dados.');
  }
  return chosen;
}

export async function readWorkbookFromFile(filePath: string): Promise<SheetData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return readSheet(pickWorksheet(workbook));
}

export async function readWorkbookFromBuffer(buffer: Buffer): Promise<SheetData> {
  const workbook = new ExcelJS.Workbook();
  // exceljs aceita Buffer aqui apesar da assinatura pedir ArrayBuffer.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return readSheet(pickWorksheet(workbook));
}
