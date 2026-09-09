// Everything the player reads in 4D Maze.
//
// Prose, meant to be edited like a document. Lines marked //kenan approved have
// been read by the author; everything else is an AI draft still waiting to be
// read, rewritten or thrown out. See shared/copy.js for the rule in full.

export const HUD = {
  title: '4D Maze', //kenan approved
  // What the game is, in the tone the other two use on the landing page: what
  // you do first, then the catch.
  blurb: 'Find the path to the exit', //kenan approved
  // The one counter. "Steps" rather than "moves" because a step is a thing you
  // can see on the map -- one segment of rope -- and a move is not.
  //
  // How far the exit still is used to sit beside it, and it gave the maze away:
  // a number that falls when you guess right turns the search into following a
  // dial, and there is nothing left to work out.
  steps: 'Steps', //kenan approved
  padFoot: 'menu · drag to look', //kenan approved
};

// Reaching the exit.
//
// Shown on a card over the board, like every other game's finish -- see
// maze/index.html. The board stays visible behind it, so the route just walked
// and the two goal boxes are still there to look at.
export const WON = {
  heading: 'Out', //kenan approved
  // The stat that is worth knowing at the end: how much of the maze you walked
  // versus how little you needed to.
  yourSteps: 'You took', //kenan approved
  // Composed rather than glued together at the call site, so the whole sentence
  // is readable here. See AGENTS.md.
  summary: (took, best) => took === best
    ? `${took} steps, which is the best there was.`
    : `${took} steps, where ${best} would have done.`,
  playAgainKey: 'Space', //kenan approved
  playAgain: 'New maze', //kenan approved
};


// The axis letters and the panel footers are the same words in every game here,
// so they live in shared/copy.js and are re-exported rather than restated. See
// the note there.
export { AXIS_NAME, PANELS } from '../../shared/copy.js';
