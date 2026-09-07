// Everything the player reads in 4D Maze.
//
// Prose, meant to be edited like a document. NOTHING HERE IS APPROVED: every
// sentence below was drafted by an AI and is waiting to be read, rewritten or
// thrown out by the author. The other games mark approved lines with a comment;
// none of these carry it yet. See shared/copy.js for the rule in full.

export const HUD = {
  title: '4D Maze',
  // What the game is, in the tone the other two use on the landing page: what
  // you do first, then the catch.
  blurb: 'Find your way out. The passages are the rope; there are no walls to ' +
         'see, only the ways you may go.',
  // The two counters. "Steps" rather than "moves" because a step is a thing you
  // can see on the map -- one segment of rope -- and a move is not.
  steps: 'Steps',
  // How far the exit is as the crow flies, which in four dimensions is not a
  // number anyone can eyeball. Giving it turns the maze from a search into a
  // judgement about which direction is worth trying.
  toGo: 'To go',
  padFoot: 'menu · drag to look',
};

// ---------------------------------------------------------------------------
// The fourth direction.
//
// The one thing this game has to teach that the other two do not: a passage can
// leave the slice you are looking at. These are the words for that.
// ---------------------------------------------------------------------------

export const FOURTH = {
  // Shown the first time the player stands at a junction with a w passage.
  // Deliberately about what is on screen -- an arrow pointing off at nothing --
  // rather than about dimensions in the abstract.
  firstSight: 'That arrow points at a passage you cannot see. It leaves this ' +
              'slice entirely. Take it and the whole map changes.',
  // The label on such a passage in the legend beside the board.
  legend: 'an arrow: a way out of this slice',
  // And the other mark worth explaining: the places where you have to choose.
  legendJunction: 'a place to choose',
};

export const WON = {
  heading: 'Out',
  // The stat that is worth knowing at the end: how much of the maze you walked
  // versus how little you needed to.
  yourSteps: 'You took',
  shortest: 'The short way was',
  // Composed rather than glued together at the call site, so the whole sentence
  // is readable here. See CLAUDE.md.
  summary: (took, best) => took === best
    ? `${took} steps, which is the best there was.`
    : `${took} steps, where ${best} would have done.`,
  playAgainKey: 'Space',
  playAgain: 'Another maze',
};

// What each axis is called in a panel footer. Single letters, because the
// footer is a caption under a small square and a word would not fit -- and
// because x, y, z and w are what the axes are called everywhere else in these
// games, including in the prose that teaches them.
export const AXIS_NAME = ['x', 'y', 'z', 'w'];

// The slice panels' footers, naming the axes each one holds still. Worded
// exactly as Snake's are: a player who reads one should not have to learn a
// second phrasing for the same idea.
export const PANELS = {
  heldFixed: (axis, value) => `${axis} <b>${value}</b> held fixed`,
  pair: (a, av, b, bv) => `${a} <b>${av}</b> &middot; ${b} <b>${bv}</b>`,
};
