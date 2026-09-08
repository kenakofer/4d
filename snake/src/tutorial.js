import { TUTORIAL } from './copy.js';
// The tutorial.
//
// Four steps, and the shape of it is the argument: each one adds exactly two
// keys, and the machinery for those two keys appears on screen at the same
// moment. Two dimensions is a game everyone already knows. Three is that game
// with W and S. Four is that game with A and D, and a ring of rooms to put
// them in.
//
// Nothing here explains the fourth dimension in words, because words are what
// everyone else has already tried. Instead the third lesson puts a wall
// squarely between the player and the apple, gives them a direction the wall
// does not extend along, and lets them find out what that means by using it.
//
// Every lesson is a real game on a real board, drawn by the ordinary renderer.
// That is why the renderer learned to handle 2, 3 and 4 dimensions rather than
// the lessons being drawn as diagrams: a tutorial that does not look like the
// game teaches the wrong thing.

// A note on the axes.
//
// The arrow keys drive x and z; W and S drive y. So a "2D" lesson is a board
// with x and z, one cell deep in y -- flat, and steered entirely by the arrows,
// which is what a player expects from a game they already know. The 3D lesson
// opens y up. The 4D lesson adds w.
// The boards. Each lesson's words live in copy.js; what stays here is the
// layout that makes the lesson work -- the wall in the way, the gap that is
// not, the room next door that is empty.
const BOARDS = [
  // Flat: 8 by 8, one cell deep in y.
  {
    dims: [8, 1, 8],
    wrap: [false, false, false],
    lavaCount: 0,
    // A wall of lava between the snake and the apple, with a gap at the far
    // end. Going straight at the apple does not work; going around does.
    lava: [{ origin: [4, 0, 0], size: [1, 1, 6] }],
    body: [[1, 0, 4], [1, 0, 3], [1, 0, 2]],
    apple: [6, 0, 4],
  },
  {
    dims: [8, 8, 8],
    wrap: [false, false, false],
    lavaCount: 0,
    // A slab across the whole floor of the room, with headroom above it. It
    // spans every x and z the snake can reach at floor level, so no amount of
    // going around gets past it -- the only way through is over, which is what
    // the two new keys are for. Checked by the suite.
    lava: [{ origin: [4, 0, 0], size: [1, 5, 8] }],
    body: [[1, 0, 4], [1, 0, 3], [1, 0, 2]],
    apple: [6, 0, 4],
  },
  {
    dims: [8, 8, 8, 4],
    wrap: [false, false, false, false],
    lavaCount: 0,
    // A wall filling the whole cross-section of slice 1 -- there is no way
    // around it in three dimensions. It exists only in slice 1, so ana or kata
    // is the only way through, which is the entire lesson. Slice 1 rather
    // than 0 so that BOTH new keys are safe to try: w is walled, and a lesson
    // that killed you for pressing the key it just named would be a trap.
    lava: [{ origin: [4, 0, 0, 1], size: [1, 8, 8, 1] }],
    body: [[1, 4, 4, 1], [1, 4, 3, 1], [1, 4, 2, 1]],
    apple: [6, 4, 4, 1],
  },
];

// A lesson is its board and its words, joined by position: the nth board is
// described by the nth block of copy.
export const LESSONS = BOARDS.map((opts, i) => ({
  id: ['2d', '3d', '4d'][i],
  opts,
  ...TUTORIAL.lessons[i],
}));

export const DONE = TUTORIAL.done;
export const DIED = TUTORIAL.died;

// How big a lesson's shower is next to the one at the end. A third: plainly a
// celebration, plainly not the finish.
const LESSON_CONFETTI = 0.35;

// The flag is shared across every game, so finishing this counts everywhere.
export { tutorialSeen, markTutorialSeen } from '../../shared/tutorial-flag.js';
import { markTutorialSeen } from '../../shared/tutorial-flag.js';
import { dropConfetti } from '../../shared/confetti.js';

// ---------------------------------------------------------------------------
// The overlay.
//
// A card in the corner rather than a modal: the lesson is played, not read, so
// the board has to stay visible and reachable the whole time. It sits opposite
// the slice panels so it never covers the thing the lesson is about.
// ---------------------------------------------------------------------------

export class Tutorial {
  // `onLesson(lesson)` starts a board and describes it; `onFinish()` returns
  // to the real game.
  // `gate` is asked before the card takes a keypress, and can refuse it -- a
  // game with a menu open passes one so the two do not both answer the key.
  constructor({ onLesson, onFinish, finishLabel = TUTORIAL.finish, gate = null }) {
    this.onLesson = onLesson;
    this.onFinish = onFinish;
    this.finishLabel = finishLabel;
    this.gate = gate;
    this.step = -1;
    // Set by start(); see `active`.
    this.running = false;
    this.build();
  }

  build() {
    const el = document.createElement('div');
    el.id = 'tut';
    el.innerHTML = `
      <div class="card">
        <div class="step" id="tutStep"></div>
        <h2 id="tutTitle"></h2>
        <p id="tutText"></p>
        <div class="row">
          <button id="tutNext">Start</button>
          <button id="tutSkip" class="quiet">Skip</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#tutNext').addEventListener('click', () => this.next());
    el.querySelector('#tutSkip').addEventListener('click', () => this.finish());

    // The death card, and the same one is reused for the end of the tutorial.
    //
    // It is the ordinary game's `#over` card -- same id, same stylesheet, so a
    // lesson death looks like a death rather than like a lesson. The board
    // stays visible behind it, which is the whole reason that card is built the
    // way it is: seeing the wall you hit is most of what makes the next attempt
    // better, and that is truer in a lesson than anywhere.
    const over = document.createElement('div');
    over.id = 'tutOver';
    // Borrow the game-over card's look wholesale.
    over.className = 'overlay';
    over.innerHTML = `
      <div class="card">
        <h2 id="tutOverHeading"></h2>
        <p class="cause" id="tutOverCause"></p>
        <button id="tutOverBtn"></button>
      </div>`;
    document.body.appendChild(over);
    this.over = over;
    over.querySelector('#tutOverBtn').addEventListener('click', () => {
      this.dismissOver();
    });

    // Space or Enter takes the button, so a retry costs no reach for the mouse
    // -- the player's hands are already on the keys that got them killed.
    //
    // `gate` lets the host refuse the press. The pause menu can be opened over
    // this card and drives itself with Enter and Space, so without it a player
    // choosing an item in the menu would also dismiss the card behind it.
    this._onKey = (ev) => {
      if (!this.overShown) return;
      if (this.gate && !this.gate()) return;
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      ev.preventDefault();
      this.dismissOver();
    };
    addEventListener('keydown', this._onKey);
  }

  get overShown() { return this.over.classList.contains('show'); }

  // Is the tutorial holding the board still?
  //
  // True while either of its cards is up -- a death waiting for a retry, or the
  // finish waiting to be dismissed. The host asks this before it moves anything,
  // so the board behind a card cannot be steered. Without it the card was a
  // picture laid over a game that was still running: the snake kept moving under
  // the finish screen, which says the tutorial has not really ended.
  get frozen() { return this.overShown; }

  // What the card's button does depends on why it is up: after a death it puts
  // the lesson back, and after the last lesson it leaves the tutorial.
  dismissOver() {
    this.over.classList.remove('show');
    const done = this._overIsDone;
    this._overIsDone = false;
    if (done) this.finish();
    else if (this.step >= 0 && this.step < LESSONS.length) {
      this.onLesson(LESSONS[this.step]);
    }
  }

  showOver(heading, cause, button, isDone) {
    this.over.querySelector('#tutOverHeading').textContent = heading;
    this.over.querySelector('#tutOverCause').innerHTML = cause || '';
    this.over.querySelector('#tutOverBtn').textContent = button;
    this._overIsDone = !!isDone;
    this.over.classList.add('show');
    // Focus the button so Space and Enter reach it even where the window's own
    // key handler is not what the browser routes to first.
    this.over.querySelector('#tutOverBtn').focus();
  }

  start() {
    this.step = -1;
    this.running = true;
    this.el.classList.add('show');
    this.next();
  }

  // Whether the tutorial owns the game right now.
  //
  // A flag rather than "is the lesson card visible", which is what this used to
  // ask. The finish card hides the lesson card while the tutorial is still very
  // much running, and reading the DOM would have said the tutorial had ended
  // the moment it put its last screen up -- handing the board back to the real
  // game underneath the card.
  get active() { return !!this.running; }

  next() {
    this.step++;
    if (this.step >= LESSONS.length) return this.showDone();
    const lesson = LESSONS[this.step];
    this.el.querySelector('#tutStep').textContent =
      TUTORIAL.stepLabel(this.step + 1, LESSONS.length);
    this.el.querySelector('#tutTitle').textContent = lesson.title;
    this.el.querySelector('#tutText').innerHTML = lesson.text;
    // No "next" while a lesson is being played: eating the apple is what
    // advances it. A button that skipped ahead would let a player leave
    // without doing the one thing the step exists to make them do.
    this.el.querySelector('#tutNext').hidden = true;
    this.el.querySelector('#tutSkip').textContent = TUTORIAL.skip;
    this.onLesson(lesson);
  }

  // The lesson's board says the player has done it -- they ate the apple.
  //
  // Every lesson gets its own shower, not just the last one. Each of these is a
  // real thing done for the first time -- moving in three dimensions, then in
  // four -- and the moment it works is the moment worth marking. A tutorial
  // that saved all its congratulation for the end spends three lessons giving
  // no sign that anything has gone right.
  //
  // Smaller than the finish's, so the end still lands as the bigger event.
  solved() {
    if (!this.active || this.step < 0 || this.step >= LESSONS.length) return;
    // Not on the last lesson: that one runs straight into showDone(), whose own
    // full shower would otherwise fall on top of this one.
    if (this.step < LESSONS.length - 1) dropConfetti(LESSON_CONFETTI);
    this.next();
  }

  // They died.
  //
  // The lesson restarts, since the point is to do it rather than to be told
  // about it, and losing a tutorial should cost nothing. But it restarts when
  // the PLAYER says so, not on a timer: a board that silently reset itself a
  // beat after the crash gave no account of what had happened, and left the
  // player unsure whether they had died at all or the lesson had simply moved.
  //
  // `cause` is the same sentence the real game's card carries -- the caller
  // works it out, since only it knows what hit what.
  failed(cause = '') {
    if (!this.active || this.step < 0 || this.step >= LESSONS.length) return;
    this.showOver(DIED.heading, cause, DIED.retry, false);
  }

  showDone() {
    // The last apple is the finish, so the shower falls as the card appears
    // rather than when its button is pressed.
    dropConfetti();
    // The corner card goes: the finish is not another lesson to read beside a
    // board still being played, it is the end of the thing.
    this.el.classList.remove('show');
    // And the screen freezes, exactly as a death does. Until now the tutorial
    // ended with a card in the corner over a board that was still live, so the
    // player could carry on steering a snake through a lesson that was already
    // over -- which says the tutorial has not really finished, whatever the
    // card claims. Stopping the board is what makes the ending an ending.
    this.showOver(DONE.title, DONE.text, this.finishLabel, true);
  }

  finish() {
    this.running = false;
    this.el.classList.remove('show');
    this.over.classList.remove('show');
    this.step = -1;
    markTutorialSeen();
    this.onFinish();
  }
}
