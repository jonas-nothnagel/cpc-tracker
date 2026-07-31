import { describe, expect, it } from "vitest";
import { isEditableTarget } from "./keyboard";

function el(tagName: string, props: Record<string, unknown> = {}) {
  return { tagName, ...props } as unknown as EventTarget;
}

describe("isEditableTarget", () => {
  it("treats text-entry fields as editable", () => {
    expect(isEditableTarget(el("INPUT"))).toBe(true);
    expect(isEditableTarget(el("INPUT", { type: "text" }))).toBe(true);
    expect(isEditableTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isEditableTarget(el("INPUT", { type: "email" }))).toBe(true);
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(el("SELECT"))).toBe(true);
  });

  it("treats contenteditable elements as editable", () => {
    expect(isEditableTarget(el("DIV", { isContentEditable: true }))).toBe(true);
  });

  it("does not treat button-like inputs as editable", () => {
    expect(isEditableTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isEditableTarget(el("INPUT", { type: "radio" }))).toBe(false);
    expect(isEditableTarget(el("INPUT", { type: "button" }))).toBe(false);
    expect(isEditableTarget(el("INPUT", { type: "range" }))).toBe(false);
  });

  it("does not treat ordinary elements as editable", () => {
    expect(isEditableTarget(el("BUTTON"))).toBe(false);
    expect(isEditableTarget(el("DIV"))).toBe(false);
    expect(isEditableTarget(el("A"))).toBe(false);
    expect(isEditableTarget(el("DIV", { isContentEditable: false }))).toBe(
      false,
    );
  });

  it("is case-insensitive about tag names and input types", () => {
    expect(isEditableTarget(el("input", { type: "TEXT" }))).toBe(true);
    expect(isEditableTarget(el("textarea"))).toBe(true);
    expect(isEditableTarget(el("input", { type: "CHECKBOX" }))).toBe(false);
  });

  it("returns false for null and non-object targets", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget("input" as unknown as EventTarget)).toBe(false);
  });
});
