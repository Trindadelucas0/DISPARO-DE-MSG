'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/app-shell';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data-state';
import { Checkbox } from '@/components/ui/primitives';
import { ImportErrorsDialog } from '@/features/import/errors-dialog';
import { ImportHistory } from '@/features/import/history';
import type { ColumnMappingInput } from '@/features/import/schema';
import {
  MappingStep,
  PreviewStep,
  ProgressStep,
  StepFrame,
  UploadStep,
} from '@/features/import/steps';
import {
  useImportJob,
  usePreview,
  useRunImport,
  useUploadSheet,
} from '@/features/import/use-import';
import { errorMessage } from '@/lib/api-client';

type Step = 'upload' | 'mapping' | 'preview' | 'progress';

const TOTAL_STEPS = 4;

/**
 * Fluxo de importação: arquivo → mapeamento → prévia → progresso.
 *
 * A prévia é recalculada no servidor a cada mudança de mapeamento ou do filtro
 * de ativas, sempre sobre o arquivo já enviado. Nada é gravado antes da
 * confirmação explícita no passo 3.
 */
export function ImportScreen() {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>('upload');
  const [onlyActive, setOnlyActive] = React.useState(true);
  const [upload, setUpload] = React.useState<{ uploadId: string; fileName: string } | null>(null);
  const [mapping, setMapping] = React.useState<ColumnMappingInput>({});
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [errorsOpen, setErrorsOpen] = React.useState(false);

  const uploadSheet = useUploadSheet();
  const preview = usePreview();
  const run = useRunImport();
  const job = useImportJob(jobId);

  const refreshPreview = React.useCallback(
    (input: { uploadId: string; onlyActive: boolean; mapping: ColumnMappingInput }) => {
      preview.mutate(
        { uploadId: input.uploadId, onlyActive: input.onlyActive, mapping: input.mapping },
        { onError: (error) => toast.error(errorMessage(error)) },
      );
    },
    [preview],
  );

  const handleFile = React.useCallback(
    (file: File) => {
      uploadSheet.mutate(file, {
        onSuccess: (result) => {
          setUpload({ uploadId: result.uploadId, fileName: result.fileName });
          setMapping({});
          setStep('mapping');
          refreshPreview({ uploadId: result.uploadId, onlyActive, mapping: {} });
        },
        onError: (error) => toast.error(errorMessage(error)),
      });
    },
    [onlyActive, refreshPreview, uploadSheet],
  );

  const restart = React.useCallback(() => {
    setStep('upload');
    setUpload(null);
    setMapping({});
    setJobId(null);
    preview.reset();
    run.reset();
  }, [preview, run]);

  const previewData = preview.data;
  const blockedByMapping = (previewData?.missingRequired.length ?? 0) > 0;

  return (
    <>
      <PageHeader title="Importar planilha">
        {step !== 'upload' ? (
          <Button variant="ghost" size="sm" onClick={restart}>
            Começar de novo
          </Button>
        ) : null}
      </PageHeader>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {step === 'upload' ? (
          <StepFrame
            step={1}
            total={TOTAL_STEPS}
            title="Arquivo"
            description="A planilha é lida no servidor. O cabeçalho precisa estar na primeira linha."
          >
            <UploadStep
              onlyActive={onlyActive}
              onOnlyActiveChange={setOnlyActive}
              onFile={handleFile}
              uploading={uploadSheet.isPending}
              fileName={upload?.fileName ?? null}
            />
          </StepFrame>
        ) : null}

        {step === 'mapping' && upload ? (
          <StepFrame
            step={2}
            total={TOTAL_STEPS}
            title="Mapeamento de colunas"
            description="A detecção é pelo nome do cabeçalho, sem depender da posição. Ajuste o que estiver errado."
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={restart}>
                  Trocar arquivo
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  disabled={!previewData || blockedByMapping}
                  loading={preview.isPending}
                  onClick={() => setStep('preview')}
                >
                  Ver prévia
                </Button>
              </>
            }
          >
            {preview.isError ? (
              <ErrorState
                cause={errorMessage(preview.error)}
                onRetry={() =>
                  refreshPreview({ uploadId: upload.uploadId, onlyActive, mapping })
                }
              />
            ) : previewData ? (
              <MappingStep
                preview={previewData}
                mapping={mapping}
                onChange={(next) => {
                  setMapping(next);
                  refreshPreview({ uploadId: upload.uploadId, onlyActive, mapping: next });
                }}
              />
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Lendo a planilha…
              </p>
            )}
          </StepFrame>
        ) : null}

        {step === 'preview' && upload && previewData ? (
          <StepFrame
            step={3}
            total={TOTAL_STEPS}
            title="Prévia e confirmação"
            description="Nada foi gravado ainda. Confira os contadores antes de confirmar."
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setStep('mapping')}>
                  Voltar ao mapeamento
                </Button>
                <label className="ml-3 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={onlyActive}
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setOnlyActive(next);
                      refreshPreview({ uploadId: upload.uploadId, onlyActive: next, mapping });
                    }}
                  />
                  Somente empresas ativas
                </label>
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  loading={run.isPending || preview.isPending}
                  disabled={previewData.validRows === 0}
                  onClick={() =>
                    run.mutate(
                      {
                        uploadId: upload.uploadId,
                        fileName: upload.fileName,
                        onlyActive,
                        mapping,
                      },
                      {
                        onSuccess: (result) => {
                          setJobId(result.jobId);
                          setStep('progress');
                        },
                        onError: (error) => toast.error(errorMessage(error)),
                      },
                    )
                  }
                >
                  Importar {previewData.validRows} lead(s)
                </Button>
              </>
            }
          >
            <PreviewStep preview={previewData} />
          </StepFrame>
        ) : null}

        {step === 'progress' ? (
          <StepFrame
            step={4}
            total={TOTAL_STEPS}
            title="Execução"
            description="O progresso é gravado no banco: sair desta tela não interrompe a importação."
          >
            {job.isError ? (
              <ErrorState
                cause={errorMessage(job.error)}
                onRetry={() => void job.refetch()}
              />
            ) : job.data ? (
              <ProgressStep
                job={job.data}
                onViewErrors={() => setErrorsOpen(true)}
                onGoToLeads={() => router.push('/leads')}
                onNewImport={restart}
              />
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Iniciando a importação…
              </p>
            )}
          </StepFrame>
        ) : null}

        <ImportHistory
          onOpenErrors={(id) => {
            setJobId(id);
            setErrorsOpen(true);
          }}
        />
      </div>

      <ImportErrorsDialog jobId={jobId} open={errorsOpen} onOpenChange={setErrorsOpen} />
    </>
  );
}
