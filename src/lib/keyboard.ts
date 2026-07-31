/**
 * Keyboard-event helpers shared by overlay panels.
 *
 * `isEditableTarget` is what keeps panel-level shortcuts from stealing keys the
 * user is typing. Backspace navigates back in a drawer, but inside the target
 * search field it has to delete a character; Cmd+Left goes back, but inside a
 * text field it means "start of line". Every panel shortcut that could collide
 * with text entry is guarded by this.
 */

/** Input types that behave like buttons, not text fields: their Backspace and
 *  arrow keys carry no editing meaning, so panel shortcuts may claim them. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "file",
  "range",
  "color",
  "image",
]);

/**
 * True when the event target is somewhere the user could be typing, so a
 * single-key shortcut must not fire.
 *
 * Duck-typed rather than `instanceof`-checked: the event target may come from
 * another document (an iframe) or from a test environment whose globals differ
 * from the ones this module closed over.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as Partial<HTMLElement> & {
    tagName?: string;
    type?: string;
  };
  if (el.isContentEditable === true) return true;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.type ?? "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}
