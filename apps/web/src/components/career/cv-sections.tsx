"use client";

import { Button, Card, CardContent, FormField, Input, Textarea, cn } from "@linkedin-ops/ui";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import {
  FormProvider,
  type Path,
  get,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";
import { messages } from "@/i18n/pt-br";
import {
  type CvFormValues,
  type CvItemSection,
  type CvLines,
  type CvSection,
  emptyItem,
  sectionResolver,
} from "./cv-form-model";

const copy = messages.career.cv;
const fields = copy.fields;
const items = copy.items;

// ------------------------------------------------------------------------------------------------
// Read-only summaries (review accordions when closed, confirmed CV)
// ------------------------------------------------------------------------------------------------

function period(start: string, end: string): string {
  return [start, end].filter(Boolean).join(" – ");
}

function lines(value: CvLines): string[] {
  return value.text.split("\n").filter((line) => line.trim());
}

/**
 * Visible summary of one section. Plain text only (React escapes it): the content came from a PDF and an AI
 * extraction, so it is never rendered as HTML and links are shown, not followed.
 */
export function CvSectionSummary({
  section,
  values,
}: {
  section: CvSection;
  values: CvFormValues;
}) {
  const none = <p className="text-muted-foreground">{items.none}</p>;
  switch (section) {
    case "contact": {
      const { contact } = values;
      const rows = [contact.name, contact.email, contact.phone, contact.location]
        .concat(contact.links.split("\n"))
        .filter((line) => line.trim().length > 0);
      if (rows.length === 0) return none;
      return (
        <div className="flex flex-col gap-0.5">
          {rows.map((line, index) => (
            <p
              key={index}
              className={cn("break-words", index === 0 && contact.name && "font-semibold")}
            >
              {line}
            </p>
          ))}
        </div>
      );
    }
    case "summary":
      return values.summary.text ? (
        <p className="whitespace-pre-wrap break-words">{values.summary.text}</p>
      ) : (
        none
      );
    case "experiences":
      if (values.experiences.length === 0) return none;
      return (
        <ul className="flex flex-col gap-3">
          {values.experiences.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5">
              <p className="font-semibold break-words">
                {item.title} · {item.company}
              </p>
              <p className="text-muted-foreground">
                {[
                  period(item.startDate, item.isCurrent ? items.current : item.endDate),
                  item.location,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {lines(item.bullets).length > 0 ? (
                <ul className="list-disc pl-5">
                  {lines(item.bullets).map((line, index) => (
                    <li key={index} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {lines(item.skills).length > 0 ? (
                <p className="break-words text-muted-foreground">{lines(item.skills).join(", ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      );
    case "education":
      if (values.education.length === 0) return none;
      return (
        <ul className="flex flex-col gap-2">
          {values.education.map((item) => (
            <li key={item.id}>
              <p className="font-semibold break-words">{item.institution}</p>
              <p className="text-muted-foreground">
                {[item.degree, item.field, period(item.startDate, item.endDate)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      );
    case "skills": {
      const technical = lines(values.skills.technical);
      const behavioral = lines(values.skills.behavioral);
      if (technical.length + behavioral.length === 0) return none;
      return (
        <dl className="flex flex-col gap-1">
          {technical.length > 0 ? (
            <div>
              <dt className="font-semibold">{fields.technicalHeading}</dt>
              <dd className="break-words">{technical.join(", ")}</dd>
            </div>
          ) : null}
          {behavioral.length > 0 ? (
            <div>
              <dt className="font-semibold">{fields.behavioralHeading}</dt>
              <dd className="break-words">{behavioral.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      );
    }
    case "languages":
      if (values.languages.length === 0) return none;
      return (
        <ul className="flex flex-col gap-0.5">
          {values.languages.map((item) => (
            <li key={item.id} className="break-words">
              {item.language}
              {item.level ? ` — ${item.level}` : ""}
            </li>
          ))}
        </ul>
      );
    case "certifications":
      if (values.certifications.length === 0) return none;
      return (
        <ul className="flex flex-col gap-0.5">
          {values.certifications.map((item) => (
            <li key={item.id} className="break-words">
              {[item.name, item.issuer, item.date].filter(Boolean).join(" · ")}
            </li>
          ))}
        </ul>
      );
    case "other":
      if (values.other.length === 0) return none;
      return (
        <div className="flex flex-col gap-2">
          {values.other.map((item) => (
            <div key={item.id}>
              <p className="font-semibold break-words">{item.heading}</p>
              <p className="whitespace-pre-wrap break-words">{item.text}</p>
            </div>
          ))}
        </div>
      );
  }
}

// ------------------------------------------------------------------------------------------------
// Accordion editor: "Editar seção" → fields → "Salvar alterações" | "Cancelar"
// ------------------------------------------------------------------------------------------------

export type CvSectionEditorProps = {
  section: CvSection;
  /** Saved values of the whole CV; the editor changes only `section`. */
  values: CvFormValues;
  open: boolean;
  /** Shows "Alterações salvas." until the section is opened again. */
  saved: boolean;
  onOpen: () => void;
  onSave: (values: CvFormValues) => void;
  onCancel: () => void;
};

/**
 * One review section as an accordion (Aurora spec §2): the summary stays visible while closed; "Editar
 * seção" (`aria-expanded`/`aria-controls`) swaps it for the fields. Each section is its own form validated
 * by the contracts schema (only its issues are shown). Saving or cancelling closes it and returns focus to
 * "Editar seção".
 */
export function CvSectionEditor({
  section,
  values,
  open,
  saved,
  onOpen,
  onSave,
  onCancel,
}: CvSectionEditorProps) {
  const panelId = useId();
  const headingId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  const title = copy.sections[section];

  useEffect(() => {
    // Opening moves focus to the first field; saving or cancelling returns it to "Editar seção".
    if (open && !wasOpen.current) {
      panelRef.current
        ?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")
        ?.focus();
    }
    if (!open && wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <Card className="gap-3" aria-labelledby={headingId} role="region">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={headingId} className="text-lg font-semibold leading-7">
            {title}
          </h3>
          <div className="flex items-center gap-3">
            {saved && !open ? (
              <p role="status" className="text-sm leading-5 text-success">
                {copy.review.sectionSaved}
              </p>
            ) : null}
            <Button
              ref={toggleRef}
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-11"
              aria-expanded={open}
              aria-controls={panelId}
              aria-describedby={headingId}
              onClick={onOpen}
            >
              {copy.review.editSection}
            </Button>
          </div>
        </div>
        <div ref={panelRef} id={panelId} className="text-sm leading-6">
          {open ? (
            <SectionForm
              section={section}
              values={values}
              title={title}
              onSave={onSave}
              onCancel={onCancel}
            />
          ) : (
            <CvSectionSummary section={section} values={values} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionForm({
  section,
  values,
  title,
  onSave,
  onCancel,
}: {
  section: CvSection;
  values: CvFormValues;
  title: string;
  onSave: (values: CvFormValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<CvFormValues>({ defaultValues: values, resolver: sectionResolver(section) });
  const submit = form.handleSubmit(onSave);
  return (
    <FormProvider {...form}>
      <form
        noValidate
        aria-label={title}
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <SectionFields section={section} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="max-md:h-11 max-sm:w-full">
            {copy.review.saveSection}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11 max-sm:w-full"
            onClick={onCancel}
          >
            {copy.review.cancelSection}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

// ------------------------------------------------------------------------------------------------
// Fields
// ------------------------------------------------------------------------------------------------

function SectionFields({ section }: { section: CvSection }) {
  const date = (name: Path<CvFormValues>, label: string) => (
    <TextField name={name} label={label} description={fields.dateHint} />
  );
  switch (section) {
    case "contact":
      return (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField name="contact.name" label={fields.name} />
            <TextField name="contact.email" label={fields.email} type="email" />
            <TextField name="contact.phone" label={fields.phone} type="tel" />
            <TextField name="contact.location" label={fields.location} />
          </div>
          <TextField name="contact.links" label={fields.links} multiline rows={3} />
        </>
      );
    case "summary":
      return <TextField name="summary.text" label={fields.summary} multiline rows={6} />;
    case "experiences":
      return (
        <ItemList section="experiences" render={(index) => <ExperienceFields index={index} />} />
      );
    case "education":
      return (
        <ItemList
          section="education"
          render={(index) => (
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                name={`education.${index}.institution`}
                label={fields.institution}
                required
              />
              <TextField name={`education.${index}.degree`} label={fields.degree} />
              <TextField name={`education.${index}.field`} label={fields.field} />
              <div className="grid grid-cols-2 gap-4">
                {date(`education.${index}.startDate`, fields.startDate)}
                {date(`education.${index}.endDate`, fields.endDate)}
              </div>
            </div>
          )}
        />
      );
    case "skills":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField name="skills.technical.text" label={fields.technical} multiline rows={6} />
          <TextField name="skills.behavioral.text" label={fields.behavioral} multiline rows={6} />
        </div>
      );
    case "languages":
      return (
        <ItemList
          section="languages"
          render={(index) => (
            <div className="grid gap-4 md:grid-cols-2">
              <TextField name={`languages.${index}.language`} label={fields.language} required />
              <TextField name={`languages.${index}.level`} label={fields.level} />
            </div>
          )}
        />
      );
    case "certifications":
      return (
        <ItemList
          section="certifications"
          render={(index) => (
            <div className="grid gap-4 md:grid-cols-3">
              <TextField
                name={`certifications.${index}.name`}
                label={fields.certification}
                required
              />
              <TextField name={`certifications.${index}.issuer`} label={fields.issuer} />
              {date(`certifications.${index}.date`, fields.date)}
            </div>
          )}
        />
      );
    case "other":
      return (
        <ItemList
          section="other"
          render={(index) => (
            <>
              <TextField name={`other.${index}.heading`} label={fields.heading} required />
              <TextField
                name={`other.${index}.text`}
                label={fields.otherText}
                multiline
                rows={4}
                required
              />
            </>
          )}
        />
      );
  }
}

function ExperienceFields({ index }: { index: number }) {
  const { register, watch } = useFormContext<CvFormValues>();
  const isCurrent = watch(`experiences.${index}.isCurrent`);
  const currentId = useId();
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name={`experiences.${index}.title`} label={fields.title} required />
        <TextField name={`experiences.${index}.company`} label={fields.company} required />
        <TextField name={`experiences.${index}.location`} label={fields.location} />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            name={`experiences.${index}.startDate`}
            label={fields.startDate}
            description={fields.dateHint}
          />
          <TextField
            name={`experiences.${index}.endDate`}
            label={fields.endDate}
            description={fields.dateHint}
            disabled={isCurrent}
          />
        </div>
      </div>
      <div className="flex min-h-11 items-center gap-2 md:min-h-0">
        <input
          id={currentId}
          type="checkbox"
          className="size-5 accent-primary"
          {...register(`experiences.${index}.isCurrent`)}
        />
        <label htmlFor={currentId} className="text-sm font-medium leading-5">
          {fields.isCurrent}
        </label>
      </div>
      <TextField
        name={`experiences.${index}.bullets.text`}
        label={fields.bullets}
        multiline
        rows={4}
      />
      <TextField
        name={`experiences.${index}.skills.text`}
        label={fields.experienceSkills}
        multiline
        rows={3}
      />
    </>
  );
}

function ItemList<S extends CvItemSection>({
  section,
  render,
}: {
  section: S;
  render: (index: number) => ReactNode;
}) {
  const { control, formState, getValues } = useFormContext<CvFormValues>();
  const { fields: rows, append, remove } = useFieldArray({ control, name: section });
  const addRef = useRef<HTMLButtonElement>(null);
  const rootError: string | undefined = get(formState.errors, `${section}.root`)?.message;
  const itemLabel = items[section];

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? <p className="text-muted-foreground">{items.none}</p> : null}
      {rows.map((row, index) => {
        const label = itemLabel(index + 1);
        return (
          <fieldset key={row.id} className="flex min-w-0 flex-col gap-4 rounded-md border p-4">
            <legend className="sr-only">{label}</legend>
            <div className="flex items-center justify-between gap-2">
              <p aria-hidden="true" className="font-semibold leading-6">
                {label}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="max-md:size-11"
                aria-label={items.remove(label)}
                onClick={() => {
                  remove(index);
                  // The removed block (and the focused button) is gone: keep focus in the section.
                  addRef.current?.focus();
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
            {render(index)}
          </fieldset>
        );
      })}
      {rootError ? <p className="text-sm leading-5 text-destructive">{rootError}</p> : null}
      <div>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          className="max-md:h-11 max-sm:w-full"
          // `append` focuses the new block's first field.
          onClick={() => append(emptyItem(getValues(), section) as never)}
        >
          <PlusIcon aria-hidden="true" />
          {items.add[section]}
        </Button>
      </div>
    </div>
  );
}

function TextField({
  name,
  label,
  description,
  required,
  multiline,
  rows,
  type,
  disabled,
}: {
  name: Path<CvFormValues>;
  label: string;
  description?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: "email" | "tel";
  disabled?: boolean;
}) {
  const { register, formState } = useFormContext<CvFormValues>();
  const error: string | undefined = get(formState.errors, name)?.message;
  return (
    <FormField
      label={label}
      description={description}
      error={error}
      required={required}
      requiredLabel={messages.auth.required}
    >
      {(control) =>
        multiline ? (
          <Textarea {...control} {...register(name)} rows={rows} className="min-h-0" />
        ) : (
          <Input
            {...control}
            {...register(name)}
            type={type}
            disabled={disabled}
            className="max-md:h-11"
          />
        )
      }
    </FormField>
  );
}
