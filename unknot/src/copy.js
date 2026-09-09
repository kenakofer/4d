// Everything the player reads in 4D Unknot.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.

export const HUD = {
  padHeading: 'Push the rope', //kenan approved
  rotateHint: '+dir rotates 4D', //kenan approved
  reset: 'Reset', //kenan approved
  solved: 'SOLVED', //kenan approved
};

// ---------------------------------------------------------------------------
// The levels.
//
// A name and a sentence each, in the order they are played. The shapes they
// describe are in levels.js, which joins these to them by the id below; the
// prose is here so that every sentence the player reads is in one place to be
// read as writing.
//
// A blurb says what the level is about without saying how to do it. The last
// one is the exception, because what it has to say IS the fourth dimension.
// ---------------------------------------------------------------------------

export const LEVEL_TEXT = {
  bump: {
    name: 'Little bump', //kenan approved
    blurb: 'Press right to smooth the rope straight', //kenan approved
  },
  bend: {
    name: 'Long bend', //kenan approved
    blurb: 'Move to the corner and smooth it out', //kenan approved
  },
  staircase: {
    name: 'Staircase', //kenan approved
    blurb: 'Untangle in 3d now', //kenan approved
  },
  tangle: {
    name: 'Tangle', //kenan approved
    blurb: 'Still no 4d necessary', //kenan approved
  },
  trefoil: {
    name: 'Trefoil', //kenan approved
    blurb: 'This one\'s a real knot in 3d. Use the fourth to "cheat".', //kenan approved
  },
};
