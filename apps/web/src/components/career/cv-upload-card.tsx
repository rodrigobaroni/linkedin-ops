"use client";

import { Button, Card, CardContent, Label, Spinner, cn } from "@linkedin-ops/ui";
import { FileTextIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { messages } from "@/i18n/pt-br";
import { CV_UPLOAD_LIMITS, checkCvFile } from "@/lib/api";

const copy = messages.career.cv;

export type CvUploadCardProps = {
  /** `empty`: no CV yet; `replace`: new version over the active one; `error`: the last reading failed. */
  variant: "empty" | "replace" | "error";
  /** Safe reason shown under the error text (draft `failureReason` or API code), already in PT-BR. */
  errorReason?: string;
  /** `POST /career/cv` in flight: every control is disabled and the reading status shows. */
  uploading: boolean;
  /** Server refusal of the file itself (413/415): shown like the client check. */
  fileError?: string | null;
  /** The last file sent from this tab (memory only): "Tentar novamente" re-sends it. */
  lastFile: File | null;
  onSubmit: (file: File) => void;
  onCancel?: () => void;
};

/**
 * Main card for sending the CV PDF (Aurora spec §2). The file input keeps a persistent visible label
 * ("Selecionar arquivo PDF") and is described by the format/size help and the error; it is visually hidden
 * and opened by the buttons, which carry the same description. Client checks (PDF, ≤ 5 MB) only spare a
 * useless upload: the API checks the signature and size again.
 */
export function CvUploadCard({
  variant,
  errorReason,
  uploading,
  fileError,
  lastFile,
  onSubmit,
  onCancel,
}: CvUploadCardProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const error = clientError ?? fileError ?? null;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  useEffect(() => {
    // "Erro leva foco ao resumo do erro" (Aurora spec, a11y).
    if (variant === "error") errorRef.current?.focus();
  }, [variant, errorReason]);

  function pick() {
    inputRef.current?.click();
  }

  function onPicked(picked: File | null) {
    // Clearing the value lets the same file be picked again after a failure.
    if (inputRef.current) inputRef.current.value = "";
    if (!picked) return;
    if (checkCvFile(picked)) {
      setFile(null);
      setClientError(copy.upload.invalidFile);
      return;
    }
    setClientError(null);
    setFile(picked);
  }

  function retry() {
    if (lastFile) onSubmit(lastFile);
    else pick();
  }

  const fullWidth = "max-sm:w-full max-md:h-11";

  let header: ReactNode;
  if (variant === "error") {
    header = (
      <div ref={errorRef} tabIndex={-1} role="alert" className="flex flex-col gap-1 outline-none">
        <h2 className="text-lg font-semibold leading-7 text-destructive">{copy.error.title}</h2>
        <p className="text-sm leading-6">{copy.error.description}</p>
        {errorReason ? (
          <p className="text-sm leading-6 text-muted-foreground">{errorReason}</p>
        ) : null}
      </div>
    );
  } else if (variant === "replace") {
    header = (
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold leading-7">{copy.upload.replaceTitle}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{copy.upload.replaceHint}</p>
      </div>
    );
  } else {
    header = (
      <div className="flex flex-col items-start gap-3">
        <FileTextIcon aria-hidden="true" className="size-8 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold leading-7">{copy.empty.title}</h2>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            {copy.empty.description}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Card aria-busy={uploading || undefined}>
      <CardContent className="flex flex-col gap-4">
        {header}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>{copy.upload.label}</Label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            name={CV_UPLOAD_LIMITS.fieldName}
            accept={`${CV_UPLOAD_LIMITS.mimeType},.pdf`}
            className="sr-only"
            // Reached through the buttons below, which carry the same description.
            tabIndex={-1}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            disabled={uploading}
            onChange={(event) => onPicked(event.target.files?.[0] ?? null)}
          />
          <p id={hintId} className="text-sm leading-5 text-muted-foreground">
            {copy.upload.hint}
          </p>
          <p
            id={errorId}
            role="alert"
            className={cn("text-sm leading-5 text-destructive", error ? undefined : "sr-only")}
          >
            {error}
          </p>
          {file ? (
            <p className="break-all text-sm font-medium leading-5">
              {copy.upload.selected(file.name)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {file ? (
            <>
              <Button
                className={fullWidth}
                disabled={uploading}
                aria-describedby={describedBy}
                onClick={() => onSubmit(file)}
              >
                {uploading ? <Spinner /> : null}
                {copy.upload.read}
              </Button>
              <Button
                variant="outline"
                className={fullWidth}
                disabled={uploading}
                aria-describedby={describedBy}
                onClick={pick}
              >
                {copy.upload.chooseAnother}
              </Button>
            </>
          ) : variant === "error" ? (
            <>
              <Button className={fullWidth} disabled={uploading} onClick={retry}>
                {uploading ? <Spinner /> : null}
                {copy.error.retry}
              </Button>
              <Button
                variant="outline"
                className={fullWidth}
                disabled={uploading}
                aria-describedby={describedBy}
                onClick={pick}
              >
                {copy.upload.chooseAnother}
              </Button>
            </>
          ) : (
            <Button
              className={fullWidth}
              disabled={uploading}
              aria-describedby={describedBy}
              onClick={pick}
            >
              {copy.upload.start}
            </Button>
          )}
          {onCancel ? (
            <Button variant="ghost" className={fullWidth} disabled={uploading} onClick={onCancel}>
              {copy.upload.cancel}
            </Button>
          ) : null}
        </div>

        {uploading ? <CvReadingNotice /> : null}
      </CardContent>
    </Card>
  );
}

/** "Lendo seu CV…" + what is being identified. The polite announcement lives in the screen's status region. */
export function CvReadingNotice({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Spinner className="mt-1 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold leading-6">{copy.reading.title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{copy.reading.description}</p>
      </div>
    </div>
  );
}
