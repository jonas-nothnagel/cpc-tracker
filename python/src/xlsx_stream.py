"""Read very large .xlsx worksheets row by row, without opening the workbook.

Expenditure reviews ship as workbooks whose line sheets run to hundreds of
thousands of rows (Mongolia's BER_1112.xlsx: about 2 GB of sheet XML). openpyxl
loads a sheet whole; this reader streams the sheet XML out of the zip with
lxml's iterparse and keeps one row in memory at a time.

Values are the cached results Excel stored with the file, so a formula cell
reads as the number the workbook shows. `formulas` reads the formula text
itself, which is how an adapter confirms the review's own rule (for example
that a total is a SUMIFS over the after-BAR column).
"""

from __future__ import annotations

import re
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from lxml import etree

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_ID = re.compile(r'Id="([^"]+)"')
_REL_TARGET = re.compile(r'Target="([^"]+)"')
_SHEET_NAME = re.compile(r'name="([^"]+)"')
_SHEET_RID = re.compile(r'r:id="([^"]+)"')
_COLUMN = re.compile(r"[A-Z]+")


def column_letters(ref: str) -> str:
    """'AB12' -> 'AB'."""
    match = _COLUMN.match(ref)
    if not match:
        raise ValueError(f"Not a cell reference: {ref!r}")
    return match.group(0)


def _release(element: etree._Element) -> None:
    """Free a parsed row and everything parsed before it."""
    element.clear()
    while element.getprevious() is not None:
        del element.getparent()[0]


class Workbook:
    """One .xlsx file, read lazily. Use as a context manager or call close()."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._zip = zipfile.ZipFile(self.path)
        self._shared: list[str] | None = None
        self._sheets: dict[str, str] | None = None

    def __enter__(self) -> Workbook:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._zip.close()

    @property
    def sheets(self) -> dict[str, str]:
        """Sheet name -> path of its XML inside the zip, in workbook order."""
        if self._sheets is None:
            workbook = self._zip.read("xl/workbook.xml").decode("utf8")
            rels = self._zip.read("xl/_rels/workbook.xml.rels").decode("utf8")
            targets: dict[str, str] = {}
            for attrs in re.findall(r"<Relationship\b([^>]*)/?>", rels):
                rid, target = _REL_ID.search(attrs), _REL_TARGET.search(attrs)
                if rid and target:
                    targets[rid.group(1)] = target.group(1)
            sheets: dict[str, str] = {}
            for attrs in re.findall(r"<sheet\b([^>]*)/?>", workbook):
                name, rid = _SHEET_NAME.search(attrs), _SHEET_RID.search(attrs)
                if not name or not rid:
                    continue
                target = targets[rid.group(1)].lstrip("/")
                sheets[_unescape(name.group(1))] = target if target.startswith("xl/") else f"xl/{target}"
            self._sheets = sheets
        return self._sheets

    @property
    def shared_strings(self) -> list[str]:
        if self._shared is None:
            strings: list[str] = []
            try:
                handle = self._zip.open("xl/sharedStrings.xml")
            except KeyError:
                self._shared = strings
                return strings
            for _, item in etree.iterparse(handle, events=("end",), tag=f"{NS}si"):
                strings.append("".join(t.text or "" for t in item.iter(f"{NS}t")))
                _release(item)
            self._shared = strings
        return self._shared

    def _open_sheet(self, sheet: str):
        try:
            return self._zip.open(self.sheets[sheet])
        except KeyError as err:
            raise KeyError(f"No sheet {sheet!r} in {self.path.name}; sheets: {list(self.sheets)}") from err

    def rows(self, sheet: str, max_rows: int | None = None) -> Iterator[tuple[int, dict[str, Any]]]:
        """Yield (row number, {column letters: value}) for every stored row.

        Numbers come back as int when whole, else float; text as str. Empty
        cells, and formula cells with no cached value, are left out.
        """
        shared = self.shared_strings
        handle = self._open_sheet(sheet)
        count = 0
        for _, row in etree.iterparse(handle, events=("end",), tag=f"{NS}row"):
            values: dict[str, Any] = {}
            for cell in row.iter(f"{NS}c"):
                value = _cell_value(cell, shared)
                if value is not None and value != "":
                    values[column_letters(cell.get("r"))] = value
            yield int(row.get("r")), values
            _release(row)
            count += 1
            if max_rows is not None and count >= max_rows:
                break

    def formulas(self, sheet: str, max_rows: int | None = None) -> Iterator[tuple[str, str]]:
        """Yield (cell reference, formula text) for every formula cell.

        Cells that share a formula with a master cell carry no text of their
        own; they are yielded with an empty string.
        """
        handle = self._open_sheet(sheet)
        count = 0
        for _, row in etree.iterparse(handle, events=("end",), tag=f"{NS}row"):
            for cell in row.iter(f"{NS}c"):
                formula = cell.find(f"{NS}f")
                if formula is not None:
                    yield cell.get("r"), formula.text or ""
            _release(row)
            count += 1
            if max_rows is not None and count >= max_rows:
                break


def _cell_value(cell: etree._Element, shared: list[str]) -> Any:
    kind = cell.get("t")
    if kind == "inlineStr":
        return "".join(t.text or "" for t in cell.iter(f"{NS}t"))
    raw = cell.find(f"{NS}v")
    if raw is None or raw.text is None:
        return None
    if kind == "s":
        return shared[int(raw.text)]
    if kind in ("str", "e", "b"):
        return raw.text
    try:
        number = float(raw.text)
    except ValueError:
        return raw.text
    return int(number) if number.is_integer() and abs(number) < 1e15 else number


def _unescape(text: str) -> str:
    return (
        text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")
    )
