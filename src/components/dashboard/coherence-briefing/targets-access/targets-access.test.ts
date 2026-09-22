import { describe, it, expect } from "vitest";
import { isPubliclyReachable, publicSourceUrl } from "./public-source-url";
import type { CountryConfig, Target } from "@/types";

/** Shaped like Panama's config: a curated, verified public URL per document. */
const CONFIG = {
  documentTypes: [
    {
      id: "NP",
      shortLabel: "NP",
      mediumLabel: "NP",
      fullLabel: "NP",
      color: "#000",
      url: "https://unfccc.int/sites/default/files/pacto.pdf",
    },
    {
      id: "HR",
      shortLabel: "HR",
      mediumLabel: "HR",
      fullLabel: "HR",
      color: "#000",
      // Panama's Hoja de Ruta genuinely has no public copy.
    },
  ],
} as CountryConfig;

const target = (over: Partial<Target>): Target =>
  ({ id: "t", text: "x", sourceDocument: "NP", ...over }) as Target;

describe("isPubliclyReachable", () => {
  it("accepts the government and convention hosts the corpora actually use", () => {
    for (const url of [
      "https://unfccc.int/x.pdf",
      "https://ort.cbd.int/x",
      "https://legalinfo.mn/x",
      "https://www.mef.gob.pa/x.pdf",
      "https://pancanal.com/x.pdf",
    ]) {
      expect(isPubliclyReachable(url), url).toBe(true);
    }
  });

  it("rejects hosts that need an account this tool's readers do not have", () => {
    for (const url of [
      "https://undp.sharepoint.com/sites/x/doc.pdf",
      "https://anytenant.sharepoint.com/x",
      "https://drive.google.com/file/d/abc",
      "https://docs.google.com/document/d/abc",
      "https://www.dropbox.com/s/abc",
    ]) {
      expect(isPubliclyReachable(url), url).toBe(false);
    }
  });

  it("rejects anything that is not web traffic, and anything unparseable", () => {
    expect(isPubliclyReachable("file:///home/x/doc.pdf")).toBe(false);
    expect(isPubliclyReachable("/local/path.pdf")).toBe(false);
    expect(isPubliclyReachable("")).toBe(false);
    expect(isPubliclyReachable(undefined)).toBe(false);
  });

  it("does not match a host that merely contains a private host's name", () => {
    // notsharepoint.com is a different registrable domain and must pass.
    expect(isPubliclyReachable("https://notsharepoint.com/x")).toBe(true);
  });
});

describe("publicSourceUrl", () => {
  it("prefers the target's own span URL when it is public", () => {
    // Mongolia's spans point at the exact instrument, which beats a
    // config-level fallback.
    const t = target({
      sources: [{ sourceText: "q", url: "https://legalinfo.mn/exact" }],
    });
    expect(publicSourceUrl(t, CONFIG)).toBe("https://legalinfo.mn/exact");
  });

  it("falls back to the config document URL when the span is SharePoint", () => {
    // This is the Panama case: 213 of 368 targets.
    const t = target({
      sources: [
        { sourceText: "q", url: "https://undp.sharepoint.com/sites/x/doc.pdf" },
      ],
    });
    expect(publicSourceUrl(t, CONFIG)).toBe(
      "https://unfccc.int/sites/default/files/pacto.pdf",
    );
  });

  it("falls back when the target has no span URL at all", () => {
    // Sri Lanka: every span carries an empty url.
    const t = target({ sources: [{ sourceText: "q", url: "" }] });
    expect(publicSourceUrl(t, CONFIG)).toBe(
      "https://unfccc.int/sites/default/files/pacto.pdf",
    );
    expect(publicSourceUrl(target({ sources: [] }), CONFIG)).toBe(
      "https://unfccc.int/sites/default/files/pacto.pdf",
    );
  });

  it("returns null rather than a dead link when nothing resolves", () => {
    const t = target({
      sourceDocument: "HR",
      sources: [{ sourceText: "q", url: "https://undp.sharepoint.com/x" }],
    });
    expect(publicSourceUrl(t, CONFIG)).toBeNull();
    expect(publicSourceUrl(target({ sourceDocument: "HR" }), CONFIG)).toBeNull();
  });

  it("returns null for an unknown document and for no config", () => {
    expect(publicSourceUrl(target({ sourceDocument: "NOPE" }), CONFIG)).toBeNull();
    expect(publicSourceUrl(target({}), null)).toBeNull();
  });

  it("takes the first public span when several are present", () => {
    const t = target({
      sources: [
        { sourceText: "a", url: "https://undp.sharepoint.com/x" },
        { sourceText: "b", url: "https://unfccc.int/real.pdf" },
      ],
    });
    expect(publicSourceUrl(t, CONFIG)).toBe("https://unfccc.int/real.pdf");
  });
});
