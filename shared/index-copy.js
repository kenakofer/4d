// The text on the landing page.
//
// Prose, meant to be edited like a document. Anything written here by an AI is
// a draft: the author reads, edits or approves every player-visible sentence
// before it ships, which is only possible while the copy is gathered in a few
// known files. See shared/copy.js for the rule in full.
// It lives in shared/ rather than beside index.html because the page has no
// source directory of its own -- it is one file at the root.

export const INDEX = {
  title: '4D Games', //kenan approved
  lede: 'Grid games played in four dimensions, (or in three, or in two...)' + //kenan approved
        'The movement tutorial is recommended if you\'re new to 4D motion', //kenan approved

  // The way straight into the movement tutorial, above the games and set apart
  // from them by a rule.
  //
  // It is not a game, so it does not belong in the list -- but the lede
  // recommends it to anyone new to 4D motion, and until now there was nothing
  // on the page to act on that with. A player who took the advice had to pick a
  // game, wait to be redirected, and end up somewhere they had not chosen.
  //
  // The link carries `then=/` -- the tutorial's own return mechanism, the same
  // one a game uses when it sends a new player here. So finishing or skipping
  // comes back to this page rather than dropping the player into Snake, which
  // is a game they did not ask for.
  tutorial: {
    href: './snake/?then=%2F',
    name: '', //draft
    text: '', //draft
  },

  games: [
    {
      href: './unknot/', //kenan approved
      dim: '4D', //kenan approved
      name: 'Unknot', //kenan approved
      text: 'Untangle a purportedly knotted rope.', //kenan approved
    },
    {
      href: './snake/', //kenan approved
      dim: '4D', //kenan approved
      name: 'Snake', //kenan approved
      text: 'Eat, grow, and don\'t bonk your head or get burned.' //kenan approved
    },
    {
      href: './tron/', //kenan approved
      dim: '4D', //kenan approved
      name: 'Tron', //kenan approved
      tag: '2 players', //kenan approved
      text: 'Competitive 2 player classic in a fast-paced 4-dimensional head-to-head', //kenan approved
    },
    {
      href: './maze/',
      dim: '4D',
      name: 'Maze',
      text: 'Find the way out. Only the passages are drawn, so a corridor ' +
            'that stops short is a way into the next slice.',
    },
  ],

  notes: [
    {
      lead: 'The fourth dimension.', //kenan approved
      text: 'The 4th dimension here is treated as another spatial dimension ' + //kenan approved
            'just like the others. Use arrow keys and WASD to move around.' //kenan approved
    },
  ],
};
