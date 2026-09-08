'use client';

import { Mic, Video, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { mediaKindLabel } from '@/constants/media';
import { cn } from '@/lib/utils';
import type { SerializedMedia } from '@/server/services/media.service';

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaChip({
  media,
  onRemove,
}: {
  media: SerializedMedia;
  onRemove?: () => void;
}) {
  const isImage = media.kind === 'IMAGE';
  return (
    <div className="flex h-12 items-center gap-2 rounded-md border border-border bg-muted/40 px-2">
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-background [aspect-ratio:1]">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${media.id}`}
            alt=""
            className="size-full object-cover"
          />
        ) : media.kind === 'VIDEO' ? (
          <Video className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <Mic className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground">{media.fileName}</p>
        <p className="numeric text-2xs text-muted-foreground">
          {mediaKindLabel(media.kind)} · {formatBytes(media.sizeBytes)}
        </p>
      </div>
      {onRemove ? (
        <Button type="button" size="icon-sm" variant="ghost" onClick={onRemove} aria-label="Remover anexo">
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function MediaAttachButton({
  accept,
  label,
  icon,
  disabled,
  onFile,
}: {
  accept: string;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={disabled}
        aria-label={label}
        title={label}
        className={cn('shrink-0')}
        onClick={() => inputRef.current?.click()}
      >
        {icon}
      </Button>
    </>
  );
}
