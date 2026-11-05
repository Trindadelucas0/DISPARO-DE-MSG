import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { detectColumns } from '@/server/services/import/columns';
import { readWorkbookFromBuffer } from '@/server/services/import/parser';

describe('import parser', () => {
  it('detecta cabeçalho depois do título de um relatório comercial', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório de clientes');
    worksheet.addRow(['Relatório de clientes', 'Gerado hoje']);
    worksheet.addRow([
      'Tipo',
      'Nome/Razão social',
      'Telefone/Celular',
      'E-mail',
      'Nome/Nome Fantasia',
      'CNPJ',
      'CATEGORIA',
    ]);
    worksheet.addRow([
      'PJ',
      'Empresa Exemplo Ltda',
      '(61) 99999-0000',
      'contato@exemplo.com',
      'Empresa Exemplo',
      '11.222.333/0001-81',
      'Cliente final',
    ]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const sheet = await readWorkbookFromBuffer(buffer);
    const detection = detectColumns(sheet.headers);

    expect(sheet.headerRowNumber).toBe(2);
    expect(sheet.rows).toHaveLength(1);
    expect(detection.missingRequired).toEqual([]);
    expect(detection.mapping).toMatchObject({
      tipo: 0,
      razaoSocial: 1,
      telefones: 2,
      email: 3,
      nomeFantasia: 4,
      cnpj: 5,
      segmento: 6,
    });
  });
});
