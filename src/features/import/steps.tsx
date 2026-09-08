'use client';

import { ImportJobStatus } from '@prisma/client';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
} from '@/components/ui/primitives';
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table';
import type { ColumnMappingInput } from '@/features/import/schema';
import type { ImportJob } from '@/features/import/use-import';
import { formatCnpj, formatInteger } from '@/lib/format';
import { IMPORT_FIELD_SPECS } from '@/server/services/import/columns';
import type { ImportPreview } from '@/server/services/import.service';

const NO_COLUMN = '__none__';

export function StepFrame({
  step,
  total,
  title,
  description,
  children,
  footer,
}: {
  step: number;
  total: number;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-md border border-border">
      <header className="flex shrink-0 items-baseline gap-2 border-b border-border px-3 py-2">
        <span className="numeric text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Passo {step} de {total}
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-pretty ml-auto max-w-md text-right text-xs text-muted-foreground">
          {description}
        </p>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3">{children}</div>
      {footer ? (
        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

// --- Passo 1: arquivo ------------------------------------------------------

export function UploadStep({
  onlyActive,
  onOnlyActiveChange,
  onFile,
  uploading,
  fileName,
}: {
  onlyActive: boolean;
  onOnlyActiveChange: (value: boolean) => void;
  onFile: (file: File) => void;
  uploading: boolean;
  fileName: string | null;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  return (
    <div className="flex flex-col gap-4 pb-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={
          'flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-10 transition-colors duration-fast ' +
          (dragging ? 'border-primary bg-primary/[0.06]' : 'border-border')
        }
      >
        {fileName ? (
          <FileSpreadsheet className="size-5 text-primary" aria-hidden />
        ) : (
          <Upload className="size-5 text-muted-foreground" aria-hidden />
        )}
        <p className="text-sm font-medium text-foreground">
          {fileName ?? 'Arraste a planilha aqui'}
        </p>
        <p className="text-xs text-muted-foreground">Arquivo .xlsx ou .xlsm, até 25 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-1"
        >
          Escolher arquivo
        </Button>
      </div>

      <Separator />

      <label className="flex cursor-pointer items-start gap-2.5">
        <Switch checked={onlyActive} onCheckedChange={onOnlyActiveChange} className="mt-0.5" />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">
            Importar somente empresas ativas
          </span>
          <span className="text-pretty text-xs text-muted-foreground">
            Traz apenas quem está com situação cadastral ATIVA na Receita. As demais aparecem
            contadas por situação na prévia — nada é descartado sem aviso.
          </span>
        </span>
      </label>
    </div>
  );
}

// --- Passo 2: mapeamento ---------------------------------------------------

export function MappingStep({
  preview,
  mapping,
  onChange,
}: {
  preview: ImportPreview;
  mapping: ColumnMappingInput;
  onChange: (next: ColumnMappingInput) => void;
}) {
  const effective = (field: string): number | null => {
    const override = mapping[field as keyof ColumnMappingInput];
    if (override !== undefined) return override;
    const detected = preview.mapping[field as keyof typeof preview.mapping];
    return detected === undefined ? null : detected;
  };

  return (
    <div className="flex flex-col gap-3 pb-3">
      {preview.missingRequired.length > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/[0.07] px-2.5 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
          <span>
            Campo obrigatório sem coluna:{' '}
            {preview.missingRequired.map((entry) => entry.label).join(', ')}. Escolha a coluna
            correspondente para continuar.
          </span>
        </p>
      ) : null}

      <Table>
        <THead>
          <TR className="h-9 hover:bg-muted">
            <TH>Campo do CRM</TH>
            <TH className="w-72">Coluna da planilha</TH>
            <TH className="w-24">Obrigatório</TH>
          </TR>
        </THead>
        <TBody>
          {IMPORT_FIELD_SPECS.map((spec) => {
            const value = effective(spec.field);
            return (
              <TR key={spec.field}>
                <TD className="text-sm">{spec.label}</TD>
                <TD>
                  <Select
                    value={value === null ? NO_COLUMN : String(value)}
                    onValueChange={(next) =>
                      onChange({
                        ...mapping,
                        [spec.field]: next === NO_COLUMN ? null : Number(next),
                      })
                    }
                  >
                    <SelectTrigger className="h-7" aria-label={`Coluna para ${spec.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COLUMN}>— não importar —</SelectItem>
                      {preview.headers.map((header, index) => (
                        <SelectItem key={`${header}-${index}`} value={String(index)}>
                          {header || `(coluna ${index + 1})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TD>
                <TD className="text-xs text-muted-foreground">{spec.required ? 'Sim' : '—'}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {preview.unmappedHeaders.length > 0 ? (
        <p className="text-pretty text-xs text-muted-foreground">
          {preview.unmappedHeaders.length} coluna(s) da planilha não têm campo correspondente e vão
          inteiras para o campo técnico <code className="numeric">rawImport</code> de cada lead:{' '}
          {preview.unmappedHeaders.map((entry) => entry.header).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}

// --- Passo 3: prévia -------------------------------------------------------

function Counter({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border px-2.5 py-2">
      <span className="col-label">{label}</span>
      <span
        className={
          'numeric text-xl font-semibold ' +
          (tone === 'good'
            ? 'text-status-customer-bg'
            : tone === 'bad'
              ? 'text-destructive'
              : 'text-foreground')
        }
      >
        {formatInteger(value)}
      </span>
    </div>
  );
}

export function PreviewStep({ preview }: { preview: ImportPreview }) {
  const duplicateRows = preview.duplicatesInFile.reduce(
    (total, entry) => total + entry.rows.length - 1,
    0,
  );

  return (
    <div className="flex flex-col gap-4 pb-3">
      <div className="grid grid-cols-3 gap-2 xl:grid-cols-6">
        <Counter label="Linhas no arquivo" value={preview.totalRows} />
        <Counter label="Vão entrar" value={preview.validRows} tone="good" />
        <Counter label="Já existem (CNPJ)" value={preview.existingInDatabase} />
        <Counter label="Fora por situação" value={preview.inactiveRows} />
        <Counter label="Duplicadas no arquivo" value={duplicateRows} />
        <Counter
          label="Rejeitadas"
          value={preview.invalidRows}
          tone={preview.invalidRows > 0 ? 'bad' : 'neutral'}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="col-label">Situação cadastral no arquivo</span>
        <div className="flex flex-wrap gap-1.5">
          {preview.situacaoBreakdown.map((entry) => (
            <Badge key={entry.situacao} variant="outline">
              {entry.situacao}: {formatInteger(entry.count)}
            </Badge>
          ))}
        </div>
      </div>

      {preview.warningRows > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="col-label">
            {formatInteger(preview.warningRows)} linha(s) entram com um campo descartado
          </span>
          <ul className="flex flex-col gap-0.5">
            {preview.warnings.slice(0, 8).map((warning, index) => (
              <li key={`${warning.rowNumber}-${index}`} className="text-xs text-muted-foreground">
                <span className="numeric">linha {warning.rowNumber}</span> — {warning.reason}
              </li>
            ))}
          </ul>
          <span className="text-2xs text-muted-foreground">
            A lista completa fica no relatório do job depois da importação.
          </span>
        </div>
      ) : null}

      {preview.duplicatesInFile.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="col-label">CNPJ repetido dentro do arquivo</span>
          <ul className="flex flex-col gap-0.5">
            {preview.duplicatesInFile.slice(0, 8).map((entry) => (
              <li key={entry.cnpj} className="numeric text-xs text-muted-foreground">
                {formatCnpj(entry.cnpj)} — linhas {entry.rows.join(', ')} (só a primeira entra)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="col-label">Primeiras {preview.rows.length} linhas</span>
        <div className="scroll-thin overflow-auto rounded-md border border-border">
          <Table>
            <THead>
              <TR className="h-9 hover:bg-muted">
                <TH className="w-16">Linha</TH>
                <TH className="w-36">CNPJ</TH>
                <TH>Razão social</TH>
                <TH className="w-32">Cidade</TH>
                <TH className="w-14">UF</TH>
                <TH className="w-32">WhatsApp</TH>
                <TH className="w-24">Situação</TH>
              </TR>
            </THead>
            <TBody>
              {preview.rows.map((row) => (
                <TR key={row.rowNumber}>
                  <TD className="numeric text-xs text-muted-foreground">{row.rowNumber}</TD>
                  {row.lead ? (
                    <>
                      <TD className="numeric text-xs">{formatCnpj(row.lead.cnpj)}</TD>
                      <TD className="max-w-0 truncate text-sm" title={row.lead.razaoSocial}>
                        {row.lead.razaoSocial}
                      </TD>
                      <TD className="max-w-0 truncate text-xs">{row.lead.cidade ?? '—'}</TD>
                      <TD className="text-xs">{row.lead.estado ?? '—'}</TD>
                      <TD className="numeric text-xs">{row.lead.whatsapp ?? '—'}</TD>
                      <TD className="text-xs">{row.lead.situacaoCadastral ?? '—'}</TD>
                    </>
                  ) : (
                    <TD colSpan={6} className="text-xs text-destructive">
                      Rejeitada: {row.issues.join(' · ')}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// --- Passo 4: progresso e resumo ------------------------------------------

export function ProgressStep({
  job,
  onViewErrors,
  onGoToLeads,
  onNewImport,
}: {
  job: ImportJob;
  onViewErrors: () => void;
  onGoToLeads: () => void;
  onNewImport: () => void;
}) {
  const running =
    job.status === ImportJobStatus.PENDING || job.status === ImportJobStatus.RUNNING;
  const failed = job.status === ImportJobStatus.FAILED;

  return (
    <div className="flex flex-col gap-4 pb-3">
      <div className="flex items-center gap-2">
        {running ? null : failed ? (
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4 text-status-customer-bg" aria-hidden />
        )}
        <span className="text-sm font-medium text-foreground">
          {running
            ? 'Importando…'
            : failed
              ? 'A importação falhou'
              : 'Importação concluída'}
        </span>
        <span className="numeric ml-auto text-xs text-muted-foreground">{job.fileName}</span>
      </div>

      <Progress
        value={job.processedRows}
        total={job.totalRows}
        label="Linhas processadas"
      />

      {failed && job.errorMessage ? (
        <p className="text-pretty rounded-md border border-destructive/40 bg-destructive/[0.07] px-2.5 py-2 text-xs text-foreground">
          {job.errorMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 xl:grid-cols-6">
        <Counter label="Inseridos" value={job.insertedRows} tone="good" />
        <Counter label="Já existiam" value={job.skippedRows} />
        <Counter label="Fora por situação" value={job.inactiveRows} />
        <Counter label="Duplicados no arquivo" value={job.duplicateRows} />
        <Counter
          label="Rejeitados"
          value={job.failedRows}
          tone={job.failedRows > 0 ? 'bad' : 'neutral'}
        />
        <Counter label="Campo descartado" value={job.warningRows} />
      </div>

      {!running ? (
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={onGoToLeads}>
            Ver os leads importados
          </Button>
          {job._count.errors > 0 ? (
            <Button variant="outline" size="sm" onClick={onViewErrors}>
              Ver relatório ({formatInteger(job._count.errors)})
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onNewImport}>
            Importar outra planilha
          </Button>
        </div>
      ) : null}
    </div>
  );
}
