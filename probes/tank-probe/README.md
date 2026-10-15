# Kelp Tank Probe

A throwaway plugin that answered issue #2's open questions in Kelpi's private test instance. It is never installed in Dita's live Kelpi and is not part of Kelp Tank.

- The backend logs every event Kelpi pushes to it, and whatever the view reports. Read them with `kelpi_test plugin logs dita.kelp-tank-probe`.
- The view animates 12 shapes and reports frames per second with its width. It also focuses the pane labelled `focus-target` through `ui.focusPane` once that pane is waiting.

Build it with `pnpm build --probe`, which writes `probes/tank-probe/dist/`.

It has no tests on purpose: it is a one-off measuring tool, and its output is the evidence. That evidence is recorded in `docs/prd.md` and in `tests/fixtures/`.
