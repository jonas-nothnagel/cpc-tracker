import type { Contract, ContractsFile, LensKey, Tier } from "./model";
import type { ContractsSetup } from "./setup";

/**
 * The record's contracts as columns, for the page: one array per field
 * instead of one object per contract, which spells every field's name once
 * per contract (Mongolia, 5,913 contracts: 2.41 MB raw and 370 KB gzipped as
 * objects; 1.8 MB and 267 KB as columns). `unpackSetup` gives the objects
 * back, the same as they were.
 */
export interface PackedContracts {
  packed: 1;
  id: string[];
  tender: string[];
  year: number[];
  tier: Tier[];
  value: number[];
  title: string[];
  translated: (0 | 1)[];
  place: (string | null)[];
  /** One column per lens: each contract's area under it, or null. */
  areas: Partial<Record<LensKey, (string | null)[]>>;
  matches: string[][];
  misaligned: string[][];
}

export type PackedContractsSetup = Omit<ContractsSetup, "file"> & {
  file: Omit<ContractsFile, "contracts"> & { contracts: PackedContracts };
};

export function packSetup(setup: ContractsSetup): PackedContractsSetup {
  const contracts = setup.file.contracts;
  const lenses = [...new Set(contracts.flatMap((c) => Object.keys(c.areas) as LensKey[]))];
  return {
    ...setup,
    file: {
      ...setup.file,
      contracts: {
        packed: 1,
        id: contracts.map((c) => c.id),
        tender: contracts.map((c) => c.tender),
        year: contracts.map((c) => c.year),
        tier: contracts.map((c) => c.tier),
        value: contracts.map((c) => c.value),
        title: contracts.map((c) => c.title),
        translated: contracts.map((c) => (c.translated ? 1 : 0)),
        place: contracts.map((c) => c.place),
        areas: Object.fromEntries(lenses.map((lens) => [lens, contracts.map((c) => c.areas[lens] ?? null)])),
        matches: contracts.map((c) => c.matches),
        misaligned: contracts.map((c) => c.misaligned),
      },
    },
  };
}

/** The setup with its contracts as objects; a setup already unpacked (as
 *  tests and the server build it) comes back as it is. */
export function unpackSetup(setup: ContractsSetup | PackedContractsSetup): ContractsSetup {
  const packed = setup.file.contracts;
  if (Array.isArray(packed)) return setup as ContractsSetup;
  const lenses = Object.entries(packed.areas) as [LensKey, (string | null)[]][];
  const contracts: Contract[] = packed.id.map((id, i) => {
    const areas: Partial<Record<LensKey, string>> = {};
    for (const [lens, column] of lenses) {
      const area = column[i];
      if (area !== null) areas[lens] = area;
    }
    return {
      id,
      tender: packed.tender[i],
      year: packed.year[i],
      tier: packed.tier[i],
      value: packed.value[i],
      title: packed.title[i],
      translated: packed.translated[i] === 1,
      place: packed.place[i],
      areas,
      matches: packed.matches[i],
      misaligned: packed.misaligned[i],
    };
  });
  return { ...setup, file: { ...setup.file, contracts } };
}
