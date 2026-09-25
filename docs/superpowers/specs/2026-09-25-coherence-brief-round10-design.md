# Coherence brief, round 10: deep dive after deep dive

Date: 2026-09-25. Branch `experiment/coherence-pulse` (worktree `coherence-pulse`).
Approved in chat by Jonas ("B is better ... build it!").

## What Jonas said (round 9 review)

- Scrolling from the overall picture lands on the map; clicking green in the same
  view jumps past the map to "what works well". Confusing.
- The target-in-the-centre layout now appears three times (strongest alignments,
  targets to review first, document in focus). He liked it for the document in focus
  only; using it three times blurred target level and document level. Find a
  different visual for the two sides.
- He still likes the dots building from the cloud (round 8), but those clouds were
  not informative. The How it works triangle had more information thanks to the
  document squares; he hoped for that philosophy, not a copy of the triangle.
- The map's colour view is hard to hit while scrolling; the potential misalignment
  view looks blurry. The alignment and misalignment landscapes (sparse, and where,
  between which documents) are liked.
- Clicking a document's name around the document in the centre should put it in
  the centre.
- The comparison (two targets and a short green line) reads as a text wall.
- Consider the Explore ring (built in parallel) now.
- The two sides need not mirror each other one to one.

## Decisions

R10.1 **One path.** The overview's steps: overall, map, what works well, where to look
      closer, documents. A rating in the overall legend leads to the map (the step
      scrolling reaches next) with that rating brought forward there, until the reader
      moves on. The map step holds for most of a screen, so its colours are easy to
      reach.

R10.2 **No target in the centre on the two sides.** Each side is one step and its own
      landscape on the map (variant B, chosen by Jonas):
      - What works well shows only the strong alignments (the pairs its headline
        counts); where to look closer shows only the potential misalignments. Other
        pairs leave; every pair of documents keeps its pale square, so empty squares
        read as empty.
      - Within each document, the targets re-sort: those that carry the side first
        (the ones the side names first of all, then by how many of the side's pairs
        they are in, then document order). The side's pairs slide into the corner of
        their square; the dots move at every step (the building Jonas liked).
      - The side names its targets on the map, under their document's name at the
        front of the document: the headline's targets when they are at most eight,
        otherwise the first six of the side's list. Each name carries its count.
      - At rest the headline's targets' pairs are drawn full, the side's other pairs
        paler. Pointing at a name or a row brings that target's pairs forward (its
        row and column); selecting it keeps it forward and opens the row.
      - A theme outlines its pairs of documents and brings their pairs forward; a
        type brings its pairs forward.
      - Pointing at a dot names the two targets and their rating; selecting it opens
        the comparison. Pointing at a square gives its figures; selecting it opens the
        pair of documents.

R10.3 **Sharp.** On the map every pair is a solid square on the pixel grid; pale means
      a lighter ink, not transparency.

R10.4 **Order within a side:** headline, the side's targets (list), themes, then (for
      potential misalignment) the types. The list answers the headline first.

R10.5 **Single targets go to the ring.** A selected row opens with its text and
      "Explore this target", which puts it in the Explore ring's centre and scrolls
      there. The overview stays at landscape and document level.

R10.6 **Document in focus unchanged,** except: clicking another document around the
      centre (its name, bar or dots) puts it in the centre; the list follows. The pair
      of documents opens from the list and the summary sentence, as before.

R10.7 **The comparison, one design for the panel and the ring:** the two targets are
      two stops on one line in the rating's ink (solid green aligned, grey partial,
      dotted grey no clear relationship, dashed red potential misalignment), each stop
      marked with its document's colour square and name; the target's title in bold,
      its text a few lines long with "Full text" when longer. The AI explanation
      shows its first sentence with the rest on request, its confidence beside the
      heading, one caveat line and the review control.

R10.8 **Walkthrough:** stops follow the new order (strongest alignments before the
      themes) and describe the map's two sides and the document names; es/mn get
      English placeholders for rewritten stops, as in round 9.

R10.9 **Unchanged:** the landing, the overall dot field, the map (apart from sharp
      squares and pale squares behind every pair of documents), the documents step,
      print, the ring itself.

## Out of scope

Sectors, implementation and finance in the overview; a "Show all 21" for the strongest
alignments; translations; the dashboard.

## Checks

- Library tests for the side layouts (sorting, visibility, names, emphasis).
- Component tests for the new path, rows, names, ring hand-off, document centring,
  comparison.
- All four countries render the overview; the Mongolia numbers stay as in round 9.
