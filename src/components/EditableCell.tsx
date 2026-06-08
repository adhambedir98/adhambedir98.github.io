"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inline-editable text cell. Holds a local draft, commits on blur (or Enter for
 * single-line) only when the value actually changed. While focused, it ignores
 * external prop updates so a background refresh never clobbers what you type.
 *
 * onSave returns true on success, false on failure (parent reverts).
 */
export function EditableCell({
  value,
  onSave,
  multiline = false,
  placeholder = "—",
  ariaLabel,
  inputClassName = "",
}: {
  value: string | null;
  onSave: (next: string) => Promise<boolean>;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  inputClassName?: string;
}) {
  const initial = value ?? "";
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value ?? "");
  }, [value]);

  async function commit() {
    focusedRef.current = false;
    setFocused(false);
    const next = draft.trim();
    const current = (value ?? "").trim();
    if (next === current) {
      setDraft(value ?? "");
      return;
    }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (!ok) setDraft(value ?? "");
  }

  const base =
    "w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition " +
    "border border-transparent hover:border-border focus:border-sand/60 focus:bg-surface-2 " +
    (saving ? "opacity-60 " : "");

  const shared = {
    value: draft,
    "aria-label": ariaLabel,
    placeholder,
    onFocus: () => {
      focusedRef.current = true;
      setFocused(true);
    },
    onBlur: commit,
    disabled: saving,
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={focused ? 3 : 2}
        onChange={(e) => setDraft(e.target.value)}
        className={`${base} resize-y leading-snug ${inputClassName}`}
      />
    );
  }

  return (
    <input
      {...shared}
      type="text"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`${base} ${inputClassName}`}
    />
  );
}
