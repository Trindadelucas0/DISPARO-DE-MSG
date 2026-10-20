import { describe, expect, it } from 'vitest';

import {
  decodeTextBuffer,
  detectDelimiter,
  looksLikeHeaderRow,
  parseDelimited,
  readDelimited,
} from '@/server/services/import/delimited';

describe('decodeTextBuffer', () => {
  it('lê UTF-8 e tira o BOM', () => {
    const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Mônica', 'utf8')]);
    expect(decodeTextBuffer(buffer)).toBe('Mônica');
  });

  it('cai para Windows-1252 quando o arquivo não é UTF-8', () => {
    // `USUÁRIO` em cp1252: o 0xC1 isolado é inválido em UTF-8.
    const buffer = Buffer.from([0x55, 0x53, 0x55, 0xc1, 0x52, 0x49, 0x4f]);
    expect(decodeTextBuffer(buffer)).toBe('USUÁRIO');
  });
});

describe('detectDelimiter', () => {
  it('escolhe o ponto-e-vírgula das fontes', () => {
    expect(detectDelimiter('USUARIO;TELEFONE\nZilma;556184191655')).toBe(';');
  });

  it('reconhece vírgula e tabulação', () => {
    expect(detectDelimiter('a,b,c')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
  });

  it('ignora linha vazia no começo', () => {
    expect(detectDelimiter('\n\na;b')).toBe(';');
  });
});

describe('parseDelimited', () => {
  it('separa campos e descarta linha totalmente vazia', () => {
    expect(parseDelimited('a;b\n\n;\nc;d\n', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('mantém célula vazia no meio da linha', () => {
    expect(parseDelimited(';556191456560;;\n', ';')).toEqual([['', '556191456560', '', '']]);
  });

  it('respeita aspas e aspas escapadas', () => {
    expect(parseDelimited('"Silva, Ana";61999999999\n', ';')).toEqual([
      ['Silva, Ana', '61999999999'],
    ]);
    expect(parseDelimited('"diz ""oi""";1\n', ';')).toEqual([['diz "oi"', '1']]);
  });

  it('aceita CRLF', () => {
    expect(parseDelimited('a;b\r\nc;d\r\n', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('looksLikeHeaderRow', () => {
  it('texto sem número é cabeçalho', () => {
    expect(looksLikeHeaderRow(['USUÁRIO', 'TELEFONE'])).toBe(true);
  });

  it('linha com telefone é dado', () => {
    expect(looksLikeHeaderRow(['', '556191456560', '', ''])).toBe(false);
    expect(looksLikeHeaderRow(['Zilma', '556184191655'])).toBe(false);
  });

  it('linha vazia não é cabeçalho', () => {
    expect(looksLikeHeaderRow(['', ''])).toBe(false);
    expect(looksLikeHeaderRow([])).toBe(false);
  });
});

describe('readDelimited', () => {
  it('separa cabeçalho quando existe', () => {
    const file = readDelimited(Buffer.from('USUARIO;TELEFONE\nZilma;556184191655\n', 'utf8'));
    expect(file.headers).toEqual(['USUARIO', 'TELEFONE']);
    expect(file.rows).toEqual([['Zilma', '556184191655']]);
  });

  it('arquivo sem cabeçalho não perde a primeira linha', () => {
    const file = readDelimited(Buffer.from(';556191456560;;\nAna;556191456561;;\n', 'utf8'));
    expect(file.headers).toEqual([]);
    expect(file.rows).toHaveLength(2);
  });
});
