import { readFileSync } from 'node:fs';

/**
 * Leitura de CSV das listas de telefone.
 *
 * O que os arquivos de origem exigem:
 * - separador `;` (também aceita `,` e tabulação, por detecção);
 * - codificação Windows-1252 em alguns arquivos e UTF-8 com BOM em outros —
 *   `USUÁRIO` chega como `USU\xc1RIO` em cp1252 e quebra a leitura se forçarmos
 *   UTF-8;
 * - cabeçalho opcional: há arquivo que começa direto na primeira linha de dado.
 *
 * O XLSX continua em `parser.ts` (exceljs).
 */

const UTF8_BOM = '﻿';

/** UTF-8 quando o arquivo é UTF-8 válido; Windows-1252 caso contrário. */
export function decodeTextBuffer(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
}

const CANDIDATE_DELIMITERS = [';', ',', '\t'] as const;

/** Separador mais frequente na primeira linha com conteúdo. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  let best = ';';
  let bestCount = -1;
  for (const candidate of CANDIDATE_DELIMITERS) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** CSV com aspas no estilo RFC 4180. Linha totalmente vazia é descartada. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = (): void => {
    row.push(field.trim());
    field = '';
  };
  const endRow = (): void => {
    endField();
    if (row.some((value) => value.length > 0)) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

export interface DelimitedFile {
  /** Vazio quando o arquivo começa direto no primeiro dado. */
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly delimiter: string;
}

const SIX_DIGITS = /\d{6}/;

/**
 * A primeira linha é cabeçalho só quando nenhuma célula tem sequência de 6+
 * dígitos. `USUÁRIO;TELEFONE` é cabeçalho; `;556191456560;;` é dado.
 */
export function looksLikeHeaderRow(row: readonly string[]): boolean {
  if (row.length === 0) return false;
  if (row.every((cell) => cell.length === 0)) return false;
  return !row.some((cell) => SIX_DIGITS.test(cell));
}

export function readDelimited(buffer: Buffer): DelimitedFile {
  const text = decodeTextBuffer(buffer);
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter);

  const first = rows[0];
  if (first && looksLikeHeaderRow(first)) {
    return { headers: first, rows: rows.slice(1), delimiter };
  }
  return { headers: [], rows, delimiter };
}

export function readDelimitedFromFile(filePath: string): DelimitedFile {
  return readDelimited(readFileSync(filePath));
}
