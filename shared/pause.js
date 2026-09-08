// The pause menu.
//
// Every game here gets the same one, opened the same way, with the same items
// in the same order -- so a player who has found it once has found it in all of
// them. It is the only place a run can be abandoned, which is the point:
// restarting used to be a bare keypress, and a bare keypress next to the
// movement keys will eventually be hit by accident and throw away a good game.
//
// Escape opens and closes it. That is what Escape means everywhere else, and it
// is nowhere near the keys a player is actually using. A small button in the
// corner does the same for a phone, which has no Escape.

import { soundEnabled, toggleSound } from './audio.js';
import { PAUSE } from './copy.js';

const NS_HTML = 'http://www.w3.org/1999/xhtml';

export class PauseMenu {
  // `onPause` / `onResume` let a game stop its own clock. A turn-based game can
  // ignore them; a game with a clock must not run while the menu is up.
  //
  // `onRestart` starts a fresh run. `home` is where "All games" goes.
  // `onTutorial`, when a game has one, adds a "Movement tutorial" item that
  // replays it. Named for what it teaches rather than which game it lives in:
  // it covers the controls and the ring of rooms, which every game here
  // shares, not the rules of any one of them.
  constructor({ onRestart, onPause, onResume, onTutorial,
                home = '../' } = {}) {
    this.onRestart = onRestart || (() => {});
    this.onTutorial = onTutorial || null;
    this.onPause = onPause || (() => {});
    this.onResume = onResume || (() => {});
    this.home = home;
    this.open = false;
    // Which item the keyboard is on. Kept as an index rather than an element so
    // it survives the tutorial row being shown or hidden between openings.
    this.index = 0;
    this.build();
    this.bind();
  }

  build() {
    const el = document.createElementNS(NS_HTML, 'div');
    el.id = 'pause';
    el.innerHTML = `
      <div class="card">
        <h2>${PAUSE.heading}</h2>
        <div class="items">
          <button data-act="resume"><span class="k">Esc</span><span class="s">${PAUSE.resume}</span></button>
          <button data-act="restart"><span class="k">↺</span><span class="s">${PAUSE.restart}</span></button>
          <button data-act="sound"><span class="k" id="pauseSoundIcon">♪</span><span class="s" id="pauseSoundLabel">${PAUSE.soundOn}</span></button>
          <button data-act="tutorial"${this.onTutorial ? '' : ' hidden'}><span class="k">?</span><span class="s">${PAUSE.tutorial}</span></button>
          <a data-act="home" href="${this.home}"><span class="k">←</span><span class="s">${PAUSE.home}</span></a>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;

    // The corner button. A glyph rather than a word, since it sits over the
    // board in every game and should read as a control, not a label.
    const btn = document.createElementNS(NS_HTML, 'button');
    btn.id = 'pauseBtn';
    btn.type = 'button';
    btn.title = PAUSE.button;
    btn.setAttribute('aria-label', PAUSE.button);
    btn.textContent = '❚❚';
    btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(btn);
    this.button = btn;

    el.addEventListener('click', (ev) => {
      // A click on the backdrop closes, like any modal. A click inside the card
      // must not, or picking a menu item would dismiss the menu under the
      // pointer before the item ran.
      if (ev.target === el) { this.hide(); return; }
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      // Route the click through the same place the keyboard goes, so the two
      // cannot drift apart -- an item that gained a keyboard-only quirk would
      // be a menu that behaves differently depending on how you reached it.
      this.activate(btn);
    });

    // The pointer moves the selection with it, so the highlight is never
    // somewhere other than where the player is looking.
    el.addEventListener('pointermove', (ev) => {
      const btn = ev.target.closest && ev.target.closest('[data-act]');
      if (!btn) return;
      const i = this.items().indexOf(btn);
      if (i >= 0) this.select(i);
    });

    this.syncSound();
  }

  // The items that can currently be picked, in the order they are shown.
  //
  // Read fresh each time rather than cached: the tutorial item is hidden on
  // games that have no tutorial, and a cached list would offer a row the player
  // cannot see.
  items() {
    return [...this.el.querySelectorAll('[data-act]')].filter((b) => !b.hidden);
  }

  // Move the highlight to item `i`, wrapping at both ends.
  //
  // Wrapping rather than stopping: this is a short list of unrelated actions,
  // not a scale with a top and a bottom, so there is nothing for an end to
  // mean. Pressing down past the last item to reach the first is the shortest
  // way to "All games" and costs nothing.
  select(i) {
    const items = this.items();
    if (!items.length) return;
    const n = ((i % items.length) + items.length) % items.length;
    this.index = n;
    // The highlight is a class of our own AND the browser's focus.
    //
    // Focus alone is not enough: the sheet draws it with :focus-visible, and a
    // browser withholds that when it judges the focus to have come from a
    // pointer -- which is exactly the case when the menu was opened by clicking
    // the corner button. The selection would then be real but invisible, and
    // the first arrow press would appear to jump from nowhere.
    //
    // Focus is still moved as well, so the selection and what a screen reader
    // announces stay the same row. Two separate notions of "current" would
    // eventually disagree, and the announced one would be the wrong one.
    for (const it of items) it.classList.remove('on');
    items[n].classList.add('on');
    items[n].focus();
  }

  move(delta) { this.select(this.index + delta); }

  // Do what an item says. The one path for both a click and a keypress.
  activate(btn) {
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'resume') { this.hide(); }
    else if (act === 'restart') { this.hide(); this.onRestart(); }
    else if (act === 'sound') { toggleSound(); this.syncSound(); }
    else if (act === 'tutorial' && this.onTutorial) { this.onTutorial(); }
    else if (act === 'home') {
      // A real link, and a click on it is followed by the browser. Reached from
      // the keyboard there is no click to follow, so the navigation is done
      // here -- otherwise Enter on the last item would be the one row in the
      // menu that does nothing.
      location.href = btn.getAttribute('href');
    }
  }

  syncSound() {
    const on = soundEnabled();
    const label = this.el.querySelector('#pauseSoundLabel');
    const icon = this.el.querySelector('#pauseSoundIcon');
    if (label) label.textContent = on ? PAUSE.soundOn : PAUSE.soundOff;
    // A struck-through note for off, so the state is legible from the glyph
    // alone rather than only from the word beside it.
    if (icon) icon.textContent = on ? '♪' : '♪̸';
    const btn = this.el.querySelector('[data-act="sound"]');
    if (btn) btn.classList.toggle('off', !on);
  }

  bind() {
    addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.toggle();
        return;
      }
      if (!this.open) return;
      // While the menu is up it owns the keyboard. Every game already ignores
      // its movement keys when `open` is set, so claiming them here takes
      // nothing away -- and it means the keys a player's hands are already on
      // drive the menu, rather than their having to find the arrows.
      //
      // WASD as well as the arrows, and for the same reason those two sets are
      // interchangeable everywhere else in these games: W is up on the board,
      // so W is up in the menu. A and D have no left and right to move in here
      // -- the menu is one column -- so they are left out rather than given
      // some invented meaning.
      const k = ev.key;
      if (k === 'ArrowDown' || k === 's' || k === 'S') {
        ev.preventDefault(); this.move(1);
      } else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
        ev.preventDefault(); this.move(-1);
      } else if (k === 'Enter' || k === ' ') {
        ev.preventDefault();
        this.activate(this.items()[this.index]);
      }
    });
  }

  toggle() { this.open ? this.hide() : this.show(); }

  show() {
    if (this.open) return;
    this.open = true;
    this.el.classList.add('show');
    this.onPause();
    // Start at the top every time, so the menu opens the same way whatever was
    // picked last. Resume is the first item and by far the likeliest thing
    // wanted, which makes "Escape, Enter" the fast way back into the game.
    this.select(0);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove('show');
    this.onResume();
  }
}
