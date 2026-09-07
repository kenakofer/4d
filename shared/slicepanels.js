// The double slice panel, and the split pad that goes with it.
//
// Two cross-sections through wherever the player is, side by side, each with
// the key cluster that moves in ITS plane directly above it. WASD sits over the
// w-y panel because those are the keys that move in the w-y plane; the arrows
// sit over the x-z panel for the same reason. The cluster is the legend, which
// is what lets the panels drop their own axis labels.
//
// Snake built this first and Tron copied it, and by the time a third game
// wanted it the two copies had drifted -- different container classes, two
// separately maintained sets of phone rules, and the footer logic written out
// twice. Every game on a four-axis board wants exactly this furniture, so it
// lives here once. The markup and CSS are shared too: `.mapcols`, `.mapcol`
// and `.mapfoot` in shared/style.css.
//
// What a game still owns is what the panels DRAW -- `cellFill`, `joined`,
// `glow` and the rest are passed straight through to the SliceMap underneath.

import { SliceMap } from './slicemap.js';
import { Pad } from './pad.js';

// Which plane each column shows, and which axes it therefore holds still.
//
// The w-y column is first because w is the axis the player is learning; putting
// it on the left, where reading starts, is a small thing repeated in every game
// that uses this.
export const COLUMNS = [
  { axes: [3, 1], pins: [0, 2] },   // w across, y up   -- pins x and z
  { axes: [0, 2], pins: [3, 1] },   // x across, z down -- pins w and y
];

export class SlicePanels {
  // `hosts` names the elements to fill: for each column, the cluster div, the
  // svg and the footer. `axisName` turns an axis index into the letter a footer
  // calls it, and `copy` supplies the two sentences a footer can be -- both
  // come from the game, because the words are the game's to review.
  constructor({ columns, dims, wrap = [], axisName, copy, onPush,
                isLive, isPresent, teachOnly = true }) {
    this.columns = columns;
    this.dims = dims;
    this.axisName = axisName;
    this.copy = copy;

    this.maps = columns.map((c, i) => {
      if (!c.svg) return null;
      return new SliceMap(c.svg, {
        axes: COLUMNS[i].axes,
        dims,
        wrap,
        // The x-z panel is a plan view seen from above, so z grows downward on
        // it -- the coordinate and the screen run the same way. The w-y panel
        // is an elevation and keeps y growing upward.
        flipV: COLUMNS[i].axes[1] === 2,
      });
    });

    this.pad = new Pad(columns.map((c) => c.cluster).filter(Boolean),
                       { onPush, isLive, isPresent, teachOnly });
  }

  // Pass the drawing rules on to both panels. A game sets `cellFill`, `joined`,
  // `glow`, `body`, `labels` and so on once, here, rather than twice.
  configure(fn) {
    for (const m of this.maps) if (m) fn(m);
  }

  // Draw both panels at `focus`, and write what each is holding still.
  draw(focus) {
    this.columns.forEach((col, i) => {
      const map = this.maps[i];
      if (map) {
        map.focus = focus;
        map.draw();
      }
      if (col.foot) col.foot.innerHTML = this.footText(i, focus);
    });
  }

  // A footer names the axes ITS panel is pinning, so the player can tell which
  // of the four they are looking at a slice of.
  //
  // An axis only one cell deep is not named. A board that is flat in y has no y
  // worth holding still -- its single layer is not a place the player can be --
  // and saying it is fixed would describe a dimension they do not have.
  footText(i, focus) {
    const pins = COLUMNS[i].pins.filter(
      (ax) => ax < this.dims.length && this.dims[ax] > 1);
    if (!pins.length) return '';
    if (pins.length === 1) {
      return this.copy.heldFixed(this.axisName(pins[0]), focus[pins[0]]);
    }
    return this.copy.pair(this.axisName(pins[0]), focus[pins[0]],
                          this.axisName(pins[1]), focus[pins[1]]);
  }

  // Hide a column whose plane the board does not have. The KEYS above it stay:
  // a 3D board has W and S but no w-y plane, and removing the cluster would
  // take away directions the player really can move in.
  fit() {
    this.columns.forEach((col, i) => {
      const has = COLUMNS[i].axes.every(
        (ax) => ax < this.dims.length && this.dims[ax] > 1);
      if (col.svg) col.svg.classList.toggle('absent', !has);
      if (col.foot) col.foot.classList.toggle('absent', !has);
    });
  }

  update() { if (this.pad) this.pad.update(); }
}
