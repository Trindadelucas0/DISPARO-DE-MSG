/** Sonda temporária: mede o tamanho real dos campos para calibrar os limites do Zod. */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { detectColumns } from '@/server/services/import/columns';
import { readWorkbookFromFile } from '@/server/services/import/parser';

function findFiles(root: string, depth = 0): string[] {
  if (depth > 2) return [];
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(full, depth + 1));
    else if (entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.startsWith('~$')) found.push(full);
  }
  return found;
}

async function main(): Promise<void> {
  const maxima = new Map<string, number>();
  let maxSecondaryCount = 0;
  let maxSocioCount = 0;

  for (const file of findFiles(process.cwd())) {
    if (!statSync(file).isFile()) continue;
    const sheet = await readWorkbookFromFile(file);
    const { mapping } = detectColumns(sheet.headers);

    for (const row of sheet.rows) {
      for (const [field, index] of Object.entries(mapping)) {
        const value = row[index as number] ?? '';
        maxima.set(field, Math.max(maxima.get(field) ?? 0, value.length));
      }
      const codes = mapping.cnaeSecundariosCodigos;
      if (codes !== undefined) {
        const count = (row[codes] ?? '').split(',').filter((p) => p.trim()).length;
        maxSecondaryCount = Math.max(maxSecondaryCount, count);
      }
      const socios = mapping.socios;
      if (socios !== undefined) {
        const count = (row[socios] ?? '').split(',').filter((p) => p.trim()).length;
        maxSocioCount = Math.max(maxSocioCount, count);
      }
    }
  }

  console.log('maior tamanho por campo:');
  for (const [field, length] of [...maxima.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(28)} ${length}`);
  }
  console.log(`maior qtd de CNAEs secundarios: ${maxSecondaryCount}`);
  console.log(`maior qtd de socios: ${maxSocioCount}`);
}

void main();
