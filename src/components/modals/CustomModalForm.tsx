"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CustomModal,
  type CustomModalProps,
} from "@/components/modals/CustomModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
// import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Autocomplete from "../commonUI/Autocomplete";
import UnsavedChangesModal from "../commonUI/UnsavedChangesModal";
// import { Badge } from "@/components/ui/badge"

export type FieldType =
  | "text"
  | "email"
  | "password"
  | "number"
  | "tel"
  | "url"
  | "date"
  | "time"
  | "datetime-local"
  | "color"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "switch"
  | "slider"
  | "custom"
  | "autoComplete"
  | "autoComplete_addon"
  | "autocomplete_without_search";

export interface SelectOption {
  label: string;
  value: string;
  color?: string;
}

export interface RadioOption {
  label: string;
  value: string;
  description?: string;
}

export interface FormField {
  id: string;
  name: string;
  label?: string;
  type: FieldType;
  placeholder?: string;
  value?: any;
  defaultValue?: any;
  required?: boolean;
  disabled?: boolean;
  description?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  /** Optional node rendered beside the label (e.g. an info icon + tooltip). */
  labelInfo?: React.ReactNode;
  searchPlaceholder?: string;
  allowUserTyping?: boolean;
  /** Autocomplete "add a custom entry" copy — see Autocomplete for the shape. */
  noResultsText?: string;
  addCustomLabel?: string;

  // Select specific
  // options?: SelectOption[];
  options?:
    | SelectOption[]
    | ((formData: Record<string, any>) => SelectOption[]);

  // Radio specific
  radioOptions?: RadioOption[];

  // Slider specific
  min?: number;
  max?: number;
  step?: number;

  // Textarea specific
  rows?: number;

  // Custom render
  render?: (
    field: FormField & {
      value?: any;
      onChange?: (value: any) => void;
    },
  ) => React.ReactNode;

  // Validation
  pattern?: string;
  minLength?: number;
  maxLength?: number;

  // Badge/tag for label
  badge?: string;
  badgeVariant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "custom_outline_gradient"
    | "custom_background_gradient";

  // Conditional visibility — return false to hide the field based on form state
  showIf?: (formData: Record<string, any>) => boolean;

  // Optional per-field onChange interceptor.
  // - value: the new value being set on this field
  // - next:  the form data that *will* be committed (already includes the change)
  // - prev:  the form data *before* this change
  // Return an object to merge extra overrides into the committed state
  // (useful for resetting dependent fields when a select switches branches).
  onChange?: (
    value: any,
    next?: Record<string, any>,
    prev?: Record<string, any>,
  ) => void | Record<string, any> | undefined;
}

export interface CustomModalFormProps extends Omit<
  CustomModalProps,
  "children" | "footer"
> {
  fields: FormField[];
  onSubmit?: (data: Record<string, any>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitButtonClassName?: string;
  cancelButtonClassName?: string;
  formClassName?: string;
  fieldSpacing?: string;
  showCancelButton?: boolean;
  isSubmitting?: boolean;
  /**
   * Ask before throwing away edits. When the user closes the modal (X, Cancel,
   * Escape or backdrop) with a draft that differs from what was loaded, an
   * "Unsaved changes" prompt is shown instead of closing immediately.
   * Pass `false` for forms where dropping a draft is harmless.
   */
  confirmOnUnsavedChanges?: boolean;
}

export function CustomModalForm({
  fields,
  onSubmit,
  onCancel,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  submitButtonClassName,
  cancelButtonClassName,
  formClassName,
  fieldSpacing = "",
  showCancelButton = true,
  isSubmitting = false,
  confirmOnUnsavedChanges = true,
  ...modalProps
}: CustomModalFormProps) {
  const [formData, setFormData] = React.useState<Record<string, any>>(() => {
    const initialData: Record<string, any> = {};
    fields.forEach((field) => {
      initialData[field.name] = field.defaultValue ?? field.value ?? "";
    });
    return initialData;
  });

  const [originalData, setOriginalData] = React.useState<Record<string, any>>(
    {},
  );

  // Only re-sync formData and snapshot originalData when the modal transitions
  // from closed → open. Re-syncing on every `fields` ref change was buggy:
  //   1. A field's onChange that bumps parent state (e.g. setFormValues) gives
  //      us a new `fields` array on the next render, which re-snapshotted
  //      originalData with the just-edited value → hasChanges=false → Save
  //      button stayed disabled.
  //   2. It also clobbered in-flight user input with stale `field.value` if the
  //      parent re-rendered for unrelated reasons (e.g. theme toggle).
  // Treating open-transition as the only "fresh data" trigger fixes both.
  const isOpen = (modalProps as any).open ?? true;
  const prevOpenRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const next: Record<string, any> = {};
      fields.forEach((field) => {
        next[field.name] = field.value ?? field.defaultValue ?? "";
      });
      setFormData(next);
      setOriginalData(next);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, fields]);

  // Check if anything has changed
  const hasChanges = React.useMemo(() => {
    return fields.some((field) => {
      const current = formData[field.name];
      const original = originalData[field.name] ?? "";
      return String(current ?? "").trim() !== String(original ?? "").trim();
    });
  }, [formData, originalData, fields]);

  // ── Unsaved-changes guard ────────────────────────────────────────────────
  // Every close route the *user* can take (X, Escape, backdrop, Cancel) funnels
  // through `requestClose`. A close driven by the parent — e.g. the card
  // flipping `open` to false after a successful save — bypasses this entirely,
  // so saving never triggers the prompt.
  const [showUnsavedConfirm, setShowUnsavedConfirm] = React.useState(false);
  // The close that was interrupted, replayed verbatim if the user discards.
  const pendingCloseRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setShowUnsavedConfirm(false);
      pendingCloseRef.current = null;
    }
  }, [isOpen]);

  const requestClose = (performClose: () => void) => {
    // The prompt renders in a body portal, so clicking it counts as an
    // "interact outside" for the dialog underneath and re-fires a close
    // request. Ignore those so the pending close isn't overwritten.
    if (showUnsavedConfirm) return;
    if (confirmOnUnsavedChanges && hasChanges && !isSubmitting) {
      pendingCloseRef.current = performClose;
      setShowUnsavedConfirm(true);
      return;
    }
    performClose();
  };

  // X / Escape / backdrop. The `open` prop stays true while the prompt is up,
  // so the form is still there behind it if the user keeps editing.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      requestClose(() => modalProps.onOpenChange?.(false));
      return;
    }
    modalProps.onOpenChange?.(open);
  };

  const handleCancelClick = () => {
    requestClose(() => {
      onCancel?.();
      modalProps.onOpenChange?.(false);
    });
  };

  const handleDiscard = () => {
    const performClose = pendingCloseRef.current;
    pendingCloseRef.current = null;
    setShowUnsavedConfirm(false);
    performClose?.();
  };

  const handleKeepEditing = () => {
    pendingCloseRef.current = null;
    setShowUnsavedConfirm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !hasChanges) return;
    onSubmit?.(formData);
  };

  const handleFieldChange = (name: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Allow individual field configs to react to their own change (e.g.
      // reset dependent fields when a select switches branches).
      const fieldCfg = fields.find((f: FormField) => f.name === name);
      if (fieldCfg?.onChange) {
        const override = (fieldCfg.onChange as any)(value, next, prev);
        if (override && typeof override === "object") {
          return { ...next, ...override };
        }
      }
      return next;
    });
  };

  const renderField = (field: FormField) => {
    // if (field.type === "custom" && field.render) {
    //   return field.render(field);
    // }

    if (field.type === "custom" && field.render) {
      return field.render({
        ...field,
        value: formData[field.name],
        onChange: (val: any) => handleFieldChange(field.name, val),
      } as any);
    }

    const fieldValue = formData[field.name];

    const options =
      typeof field.options === "function"
        ? field.options(formData)
        : field.options;

    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            id={field.id}
            name={field.name}
            placeholder={field.placeholder}
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            disabled={field.disabled}
            rows={field.rows}
            minLength={field.minLength}
            maxLength={field.maxLength}
            className={field.inputClassName}
          />
        );

      case "select":
        return (
          <Select
            value={fieldValue}
            onValueChange={(value) => handleFieldChange(field.name, value)}
            disabled={field.disabled}
          >
            <SelectTrigger className={field.inputClassName}>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {/* {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))} */}
              {options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "checkbox":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={field.id}
              checked={fieldValue}
              onCheckedChange={(checked) =>
                handleFieldChange(field.name, checked)
              }
              disabled={field.disabled}
              className={field.inputClassName}
            />
            {field.label && (
              <Label htmlFor={field.id} className="cursor-pointer">
                {field.label}
              </Label>
            )}
          </div>
        );

      case "radio":
        return (
          <RadioGroup
            value={fieldValue}
            onValueChange={(value) => handleFieldChange(field.name, value)}
            disabled={field.disabled}
            className={field.inputClassName}
          >
            {field.radioOptions?.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <RadioGroupItem
                  value={option.value}
                  id={`${field.id}-${option.value}`}
                />
                <Label
                  htmlFor={`${field.id}-${option.value}`}
                  className="cursor-pointer"
                >
                  <div>
                    <div>{option.label}</div>
                    {option.description && (
                      <div className="text-muted-foreground text-xs">
                        {option.description}
                      </div>
                    )}
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case "switch":
        return (
          <div className="flex items-center justify-between gap-4">
            {field.label && <Label htmlFor={field.id}>{field.label}</Label>}
            <Switch
              id={field.id}
              checked={fieldValue}
              onCheckedChange={(checked) =>
                handleFieldChange(field.name, checked)
              }
              disabled={field.disabled}
              className={field.inputClassName}
            />
          </div>
        );

      case "autoComplete":
        return (
          <Autocomplete
            // options={
            //   field.options?.map((o: any) => ({
            //     id: o.id ?? o.value,
            //     name: o.name ?? o.label,
            //     color: o.color,
            //   })) ?? []
            // }
            options={
              options?.map((o: any) => ({
                id: o.id ?? o.value,
                name: o.name ?? o.label,
                color: o.color,
              })) ?? []
            }
            value={fieldValue || ""}
            onChange={(val) => handleFieldChange(field.name, val)}
            placeholder={field.placeholder}
            className={field.inputClassName}
            dropdownClassName="z-50 max-h-[135px]"
            dropdownSearchPlaceholder={field.searchPlaceholder}
            allowTyping={field.allowUserTyping}
            limit={100000}
          />
        );

      case "autoComplete_addon":
        return (
          <Autocomplete
            // options={
            //   field.options?.map((o: any) => ({
            //     id: o.id ?? o.value,
            //     name: o.name ?? o.label,
            //     color: o.color,
            //   })) ?? []
            // }
            options={
              options?.map((o: any) => ({
                id: o.id ?? o.value,
                name: o.name ?? o.label,
                color: o.color,
              })) ?? []
            }
            value={fieldValue || ""}
            allowTyping={field.allowUserTyping}
            onChange={(val) => handleFieldChange(field.name, val)}
            placeholder={field.placeholder}
            className={field.inputClassName}
            dropdownClassName="z-50 max-h-[135px]"
            dropdownSearchPlaceholder={field.searchPlaceholder}
            noResultsText={field.noResultsText}
            addCustomLabel={field.addCustomLabel}
            limit={100000}
            customAddon
          />
        );

      case "autocomplete_without_search":
        return (
          <Autocomplete
            // options={
            //   field.options?.map((o: any) => ({
            //     id: o.id ?? o.value,
            //     name: o.name ?? o.label,
            //     color: o.color,
            //   })) ?? []
            // }
            options={
              options?.map((o: any) => ({
                id: o.id ?? o.value,
                name: o.name ?? o.label,
                color: o.color,
              })) ?? []
            }
            value={fieldValue || ""}
            allowTyping={field.allowUserTyping}
            onChange={(val) => handleFieldChange(field.name, val)}
            placeholder={field.placeholder}
            className={field.inputClassName}
            customClassDropdown="custom-fixed-dropdown-profile"
            dropdownClassName="z-50"
            limit={100000}
            showDropdownSearch={false}
          />
        );

      default:
        return (
          <Input
            id={field.id}
            name={field.name}
            type={field.type}
            placeholder={field.placeholder}
            value={fieldValue}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            required={field.required}
            disabled={field.disabled}
            pattern={field.pattern}
            minLength={field.minLength}
            maxLength={field.maxLength}
            min={field.min}
            max={field.max}
            step={field.step}
            className={field.inputClassName}
          />
        );
    }
  };

  return (
    <>
    <CustomModal
      {...modalProps}
      onOpenChange={handleOpenChange}
      footer={
        <div className="flex items-center justify-end gap-3">
          {showCancelButton && (
            <Button
              type="button"
              variant="custom_outline_gradient"
              onClick={handleCancelClick}
              className={cancelButtonClassName}
              disabled={isSubmitting}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="submit"
            variant="custom_background_gradient"
            onClick={handleSubmit}
            className={submitButtonClassName}
            disabled={isSubmitting || !hasChanges}
          >
            {isSubmitting ? "Submitting..." : submitLabel}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-6",
          fieldSpacing,
          formClassName,
        )}
      >
        {fields.map((field) => {
          if (field.showIf && !field.showIf(formData)) {
            return null;
          }
          return (
          <div
            key={field.id}
            className={cn(
              "space-y-2 form-input-custom md:col-span-2",
              field.className,
            )}
          >
            {field.type !== "checkbox" &&
              field.type !== "switch" &&
              field.label && (
                <div className="flex items-center gap-2">
                  <Label htmlFor={field.id} className={field.labelClassName}>
                    {field.label}
                    {field.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  {field.labelInfo}
                  {/* {field.badge && (
                  <Badge variant={field.badgeVariant ?? "secondary"} className="text-xs">
                    {field.badge}
                  </Badge>
                )} */}
                </div>
              )}
            {renderField(field)}
            {field.description && (
              <p className="text-muted-foreground text-sm">
                {field.description}
              </p>
            )}
          </div>
          );
        })}
        {/* Hidden submit button enables Enter-key submission */}
        <button type="submit" aria-hidden="true" tabIndex={-1} className="hidden" />
      </form>
    </CustomModal>

    {/* Rendered as a sibling of the dialog (not inside it) so its portal sits
        above the dialog rather than inside the dialog's transformed box. */}
    <UnsavedChangesModal
      isOpen={showUnsavedConfirm}
      onDiscard={handleDiscard}
      onKeepEditing={handleKeepEditing}
    />
    </>
  );
}
