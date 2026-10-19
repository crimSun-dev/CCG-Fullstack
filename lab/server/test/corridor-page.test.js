'use strict';

/* The corridor script in index.html, run on ce-store.js's local backend with just enough DOM to paint:
 * the sign, the name list, the timetable, the booking form, invitations, notices, and arrivals. The CSS
 * rules it relies on are checked as text. The DOM lives in page-harness.js; office-player.test.js runs the same
 * page on the shared backends. A real browser walk-through is the top of the pyramid (6.5). */

const test = require('node:test');
const assert = require('node:assert/strict');
const { CORRIDOR_SRC, CSS, HTML, corridorPage, buttons, button } = require('./page-harness');

const HOUR_PX = 48;

/* Wait out the last seconds of a minute, so "this minute" is still now when the store checks it. */
async function settledMinute() { if (Date.now() % 60_000 > 56_000) await new Promise((r) => setTimeout(r, 4_100)); }

test('the corridor script is in the page, after ce-store.js, and owns no storage, socket or timer', () => {
  assert.ok(CORRIDOR_SRC, 'index.html has the corridor script');
  assert.ok(HTML.indexOf('src="ce-store.js"') < HTML.indexOf("The corridor's rooms"));
  assert.doesNotMatch(CORRIDOR_SRC, /localStorage|fetch\(|new\s+WebSocket|setInterval|setTimeout/);
  assert.doesNotMatch(HTML, /Hub code|code-input|code-form/, 'no hub codes');
});

test('CSS: Black Box in use is indigo and yellow and never animated; the ON AIR red belongs to the lamp', () => {
  const inUse = CSS.split('}').filter((rule) => rule.includes('data-state="in-use"'));
  assert.ok(inUse.length >= 2);
  for (const rule of inUse) assert.doesNotMatch(rule, /E2231A|--on-air|animation/i, rule);
  assert.ok(inUse.some((r) => /background:\s*var\(--spark\)/.test(r) && /color:\s*var\(--indigo\)/.test(r)));
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{\s*button\.pill \{ transition: none; \}/);
  assert.doesNotMatch(CSS, /@keyframes[^{]*(pill|lamp|air|use)/i, 'nothing on the sign pulses');
  assert.equal([...HTML.matchAll(/E2231A/gi)].length, 1, '#E2231A is written once, as the --on-air token');
  for (const rule of CSS.split('}').filter((r) => r.includes('var(--on-air)'))) assert.match(rule, /\.lamp\.is-on\s*\{[^{]*$/, rule);
});

test('Founder & Story Producer opens the configured CCG site', () => {
  const unlabeled = corridorPage();
  assert.equal(unlabeled.$('pill-founder').href, undefined);
  const linked = corridorPage({ CE_CCG_SITE: 'https://ccg.example' });
  assert.equal(linked.$('pill-founder').href, 'https://ccg.example/');
  const refused = corridorPage({ CE_CCG_SITE: 'javascript:alert(1)' });
  assert.equal(refused.$('pill-founder').href, undefined);
});

test('the corridor on the local backend', async (t) => {
  const page = corridorPage();
  const { $, CE } = page;
  const rooms = CE.rooms;
  await page.settle();
  let dewi, sari, pak;

  await t.test('your name: no codes; add a name and the sign says who you are', async () => {
    assert.equal($('you-name').textContent, 'pick your name');
    $('you-open').click();
    assert.equal($('sheet-title').textContent, 'Your name');
    assert.equal($('names-panel').hidden, false);
    $('name-input').value = 'Rina';
    $('name-form').fire('submit');
    await page.settle();
    assert.equal(rooms.me().displayName, 'Rina');
    assert.equal($('you-name').textContent, 'Rina');
    assert.equal($('composer-who-name').textContent, 'Rina');
    dewi = await rooms.addName('Dewi'); sari = await rooms.addName('Sari'); pak = await rooms.addName('Pak Hall', 'hall_operator');
    await rooms.pick((await rooms.addName('Rina')).id);
    await page.settle();
    const rows = $('names-list').children;
    assert.equal(rows.length, 4);
    const dewiRow = rows.find((r) => r.textContent.startsWith('Dewi'));
    assert.deepEqual(buttons(dewiRow).map((b) => b.textContent), ['This is me', 'Follow']);
    assert.match(rows.find((r) => r.textContent.startsWith('Rina')).textContent, /you$/);
  });

  await t.test('a note without a name opens the name list', async () => {
    $('sheet-close').click();
    await page.settle();
    page.document.dispatchEvent({ type: 'ce:need-name' });
    assert.equal($('room-sheet').open, true);
    assert.equal($('names-panel').hidden, false);
    assert.match($('sheet-msg').textContent, /Pick or add your name/);
  });

  /* The weekdays of the reach (the rooms are booked Monday to Friday), the first one after today, and its button. */
  const officeDays = () => [...Array(14).keys()].map((i) => rooms.addDays(rooms.today(), i)).filter((d) => rooms.isOfficeDay(d));
  const later = () => officeDays().find((d) => d !== rooms.today());
  const dayButton = (d) => $('days').children.map((li) => li.firstChild).find((b) => b.dataset.day === d);

  await t.test('the schedule: the weekdays of the next two weeks, nothing before today, no weekend', async () => {
    $('sheet-close').click();
    $('pill-black-box').click();
    await page.settle();
    assert.equal($('room-sheet').open, true, 'a late close event does not undo the new view');
    assert.equal($('sheet-title').textContent, 'Room schedule');
    assert.equal($('sched-panel').hidden, false);
    const days = $('days').children;
    assert.deepEqual(days.map((li) => li.firstChild.dataset.day), officeDays(), 'Monday to Friday only');
    assert.ok(days.length >= 9 && days.length <= 10);
    assert.ok(days.every((li) => !/^(Sat|Sun)/.test(li.firstChild.textContent)), 'no Saturday or Sunday');
    if (rooms.isOfficeDay(rooms.today())) assert.match(days[0].firstChild.textContent, /^Today/);
    else assert.equal($('tt-title').textContent.startsWith('Today'), false, 'on a weekend the schedule opens on Monday');
    assert.equal($('book-date').value, officeDays()[0]);
    assert.equal($('day-other').min, rooms.today());
    assert.equal($('book-date').min, rooms.today());
    $('day-other').value = '2001-01-01';
    $('day-other').fire('change');
    assert.match($('sheet-msg').textContent, /Days before today are closed/);
    const weekend = [...Array(7).keys()].map((i) => rooms.addDays(rooms.today(), i)).find((d) => !rooms.isOfficeDay(d));
    $('day-other').value = weekend;
    $('day-other').fire('change');
    assert.equal($('sheet-msg').textContent, 'The rooms are booked Monday to Friday. Pick a weekday.');
    assert.equal($('tt-title').textContent.startsWith('Saturday') || $('tt-title').textContent.startsWith('Sunday'), false);
    assert.equal(await page.book({ title: 'Weekend', date: weekend, from: '10:00', to: '11:00' }),
      'The rooms are booked Monday to Friday. Pick a weekday.');
    assert.equal(rooms.bookings(weekend).length, 0);
  });

  await t.test('clicking free time on the timetable fills the form to the quarter hour', async () => {
    const laterDay = later();
    dayButton(laterDay).click();
    await page.settle();
    assert.equal($('tt-title').textContent.startsWith('Today'), false);
    const first = parseInt($('tt-hours').children[0].textContent, 10);
    $('tt-col-ck_hall').fire('click', { offsetY: (14 - first) * HOUR_PX + 0.6 * HOUR_PX });
    assert.equal($('book-date').value, laterDay);
    assert.equal($('book-start').value, '14:30');
    assert.equal($('book-end').value, '15:30');
    assert.equal(page.radios.find((r) => r.checked).value, 'ck_hall');
    assert.equal($('book-title-label').textContent, 'Name on the booking');
  });

  await t.test('book a meeting with an invitation; it lands on the timetable; an overlap is refused', async () => {
    const laterDay = later();
    const msg = await page.book({ title: 'Pitch review', date: laterDay, from: '14:00', to: '15:30', invite: ['Dewi'] });
    assert.equal(msg, 'Booked: Pitch review, 14:00–15:30.');
    const block = $('tt-col-black_box').children.find((n) => n.classList.contains('tt__block'));
    assert.ok(block.classList.contains('is-mine'));
    assert.ok(block.classList.contains('is-selected'));
    const first = parseInt($('tt-hours').children[0].textContent, 10);
    assert.equal(block.style.top, ((14 - first) * HOUR_PX) + 'px');
    assert.equal(block.style.height, (1.5 * HOUR_PX) + 'px');
    assert.equal($('detail').hidden, false);
    assert.match($('detail-people').textContent, /Rina · booked itDewi · invited/);
    assert.equal($('detail-table').hidden, false, 'a Black Box booking shows its table');
    assert.equal(page.chair('detail', 1).textContent, 'RinaHost');
    assert.equal(page.chair('detail', 2).textContent, 'Dewiinvited');
    assert.match(page.chair('detail', 2).getAttribute('aria-label'), /^Chair 2, Dewi, invited, no answer yet/);
    assert.equal(rooms.meetings(laterDay)[0].invites[0].seat, 2, 'the chair is stored with the invitation');
    assert.ok(button($('detail-acts'), 'Cancel meeting'));
    assert.match(await page.book({ title: 'Clash', date: laterDay, from: '15:00', to: '16:00' }), /Already booked/);
    assert.match(await page.book({ title: 'Backwards', date: laterDay, from: '16:00', to: '15:00' }), /end after it starts/);
    assert.match(await page.book({ title: 'Old', date: '2001-01-01', from: '10:00', to: '11:00' }), /Days before today are closed/);
  });

  await t.test('the invitee sees a notice, accepts it, and the booker sees who is coming', async () => {
    await rooms.pick(dewi.id);
    await page.settle();
    assert.equal($('notices-count').hidden, false);
    assert.equal($('notices-count').textContent, '1');
    $('notices-open').click();
    const item = $('notices-list').children[0];
    assert.match(item.textContent, /Rina invited you to “Pitch review” · Black Box/);
    button(item, 'Accept').click();
    await page.settle();
    assert.equal($('notices-count').hidden, true);
    await rooms.pick(rooms.people().find((p) => p.displayName === 'Rina').id);
    $('pill-black-box').click();
    dayButton(later()).click();
    await page.settle();
    assert.match($('detail-people').textContent, /Dewi · coming/);
    assert.equal(page.chair('detail', 2).textContent, 'Dewi', 'accepted: solid, no "invited"');
    assert.equal(page.chair('detail', 2).tagName, 'SPAN', 'a taken chair is not a button');
    page.seat('detail', 5, 'Sari');
    await page.settle();
    assert.match($('detail-msg').textContent, /Invited Sari to chair 5/);
    assert.equal(page.chair('detail', 5).textContent, 'Sariinvited');
    assert.equal($('more-form').hidden, true, 'Black Box invites through its chairs, not the ticked list');
  });

  await t.test('declining gives the chair back', async () => {
    await rooms.pick(sari.id);
    const b = rooms.meetings(later())[0];
    await rooms.respond(b.id, 'declined');
    await rooms.pick(rooms.people().find((p) => p.displayName === 'Rina').id);
    $('pill-black-box').click();
    dayButton(later()).click();
    await page.settle();
    assert.equal(page.chair('detail', 5).textContent, '+');
    assert.equal(page.chair('detail', 5).tagName, 'BUTTON', 'the booker can seat someone else there');
  });

  await t.test('a meeting from this minute turns the Black Box pill to in use', async (st) => {
    if (!rooms.isOfficeDay(rooms.today())) return st.skip('today is a weekend in Jakarta');
    await settledMinute();
    const now = page.jakarta(0), soon = page.jakarta(0.5);
    if (soon.date !== now.date) return st.skip('crosses Jakarta midnight');
    assert.equal($('pill-black-box').dataset.state, 'idle');
    assert.match(await page.book({ title: 'Standup', date: now.date, from: now.time, to: soon.time }), /^Booked: Standup/);
    assert.equal($('pill-black-box').dataset.state, 'in-use');
    assert.match($('black-box-state').textContent, /in use till \d\d:\d\d/);
    assert.match($('sheet-now').textContent, /Black Box: in use \(Standup\)/);
    button($('detail-acts'), 'Cancel meeting').click();
    await page.settle();
    assert.equal($('pill-black-box').dataset.state, 'idle');
  });

  await t.test('CK Hall: a request does not light the lamp; the hall operator confirms; cancel puts it out', async (st) => {
    if (!rooms.isOfficeDay(rooms.today())) return st.skip('today is a weekend in Jakarta');
    await settledMinute();
    const now = page.jakarta(0), soon = page.jakarta(0.5);
    if (soon.date !== now.date) return st.skip('crosses Jakarta midnight');
    await rooms.pick(sari.id);
    dayButton(rooms.today()).click();
    assert.match(await page.book({ room: 'ck_hall', title: 'Sari', date: now.date, from: now.time, to: soon.time }), /^Requested: Sari/);
    assert.equal($('ck-hall-lamp').classList.contains('is-on'), false);
    assert.equal(button($('detail-acts'), 'Confirm'), undefined, 'a guest cannot approve');
    await rooms.pick(pak.id);
    await page.settle();
    button($('detail-acts'), 'Confirm').click();
    await page.settle();
    assert.equal($('ck-hall-lamp').classList.contains('is-on'), true);
    assert.match($('ck-hall-sr').textContent, /ON AIR until/);
    assert.equal($('pill-black-box').dataset.state, 'idle', 'the hall lamp never lights Black Box');
    button($('detail-acts'), 'Cancel booking').click();
    await page.settle();
    assert.equal($('ck-hall-lamp').classList.contains('is-on'), false);
  });

  await t.test('follow a colleague; their coming in is a notice; one line per name per day', async () => {
    await rooms.pick(sari.id);
    $('you-open').click();
    await page.settle();
    button($('names-list').children.find((r) => r.textContent.startsWith('Dewi')), 'Follow').click();
    await page.settle();
    assert.ok(rooms.isFollowing(dewi.id));
    await rooms.pick(dewi.id);
    $('arrivals-open').click();
    assert.equal($('sheet-title').textContent, 'Office days');
    const first = rooms.addDays(rooms.today(), 0);
    const day = [...Array(14).keys()].map((i) => rooms.addDays(rooms.today(), i)).find((d) => rooms.isOfficeDay(d));
    const isToday = day === first;
    assert.match($('pl-day').textContent, /day$/, 'the window names the weekday');
    $('arr-yes').click();
    await page.settle();
    $('arr-note').value = 'from 10';
    $('arr-yes').click();
    await page.settle();
    assert.equal($('arr-list').children.length, 1);
    assert.match($('arr-list').children[0].textContent, /^Coming inDewi \(you\)from 10/);
    assert.equal(rooms.plans(day).length, 1, 'one line per name per day');
    if (isToday) {
      assert.equal($('sheet-now').textContent, '1 person coming in today.');
      await rooms.pick(sari.id);
      await page.settle();
      assert.equal($('notices-count').textContent, '1');
      $('notices-open').click();
      assert.match($('notices-list').children[0].textContent, /Dewi is coming in today · from 10/);
    } else {
      assert.match($('sheet-now').textContent, /^1 person coming in on \w+day\.$/);
      await rooms.pick(sari.id);
      await page.settle();
      assert.equal($('notices-count').hidden, true, 'a later day is no notice: notices are for today');
    }
  });

  await t.test('the player: weekdays only, prev and next, repeat next week, and the big button says the next step', async () => {
    await rooms.pick(dewi.id);
    $('arrivals-open').click();
    await page.settle();
    const days = [...Array(14).keys()].map((i) => rooms.addDays(rooms.today(), i)).filter((d) => rooms.isOfficeDay(d));
    assert.ok(days.length >= 9 && days.length <= 10, 'two weeks of weekdays');
    assert.equal($('pl-days').children.length, 5);
    assert.deepEqual($('pl-days').children.map((li) => li.firstChild.textContent), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    assert.equal($('pl-prev').getAttribute('aria-disabled'), 'true', 'nothing before the first office day');
    $('pl-next').click();
    await page.settle();
    assert.match($('pl-day').textContent, /day$/);
    assert.equal(rooms.myPlan(days[1]), null);
    assert.equal($('pl-main').getAttribute('aria-label'), 'Coming in');
    assert.equal($('pl-repeat').getAttribute('aria-disabled'), 'true', 'nothing to repeat yet');
    $('pl-arrive').value = '08:45';
    $('pl-main').click();
    await page.settle();
    assert.equal(rooms.myPlan(days[1]).arriveAt, '08:45');
    assert.equal($('pl-badge').textContent, 'Coming in');
    assert.equal($('pl-eta').textContent, 'Arrive by 08:45');
    if (days[1] !== rooms.today()) {
      assert.equal($('pl-main').getAttribute('aria-pressed'), 'true', 'a later day: the button is the toggle');
    }
    assert.equal($('pl-repeat').getAttribute('aria-disabled'), 'false');
    $('pl-repeat').click();
    await page.settle();
    assert.equal(rooms.myPlan(rooms.addDays(days[1], 7)).arriveAt, '08:45', 'same plan, same weekday next week');
    assert.match($('sheet-msg').textContent, /^Same plan on /);
    assert.equal($('pl-repeat').dataset.on, 'true', 'repeat is lit with its 1');
    assert.equal($('pl-repeat').getAttribute('aria-pressed'), 'true');
    $('pl-repeat').click();
    await page.settle();
    assert.equal(rooms.myPlan(rooms.addDays(days[1], 7)), null, 'pressing again turns it off');
    assert.equal($('pl-repeat').dataset.on, 'false');
    assert.match($('sheet-msg').textContent, /^Repeat off\./);
    $('pl-repeat').click();
    await page.settle();
    assert.equal($('pl-repeat').dataset.on, 'true', 'and on again');
    assert.equal($('pl-list').hidden, true, 'the playlist starts closed');
    $('pl-who').click();
    await page.settle();
    assert.equal($('pl-list').hidden, false);
    assert.equal($('pl-who').getAttribute('aria-expanded'), 'true');
    $('pl-who').click();
    await page.settle();
    assert.equal($('pl-list').hidden, true);
    const last = days[days.length - 1];
    while (days.indexOf(page.$('pl-days').children.find((li) => li.firstChild.getAttribute('aria-pressed') === 'true').firstChild.dataset.day) < days.length - 1) {
      $('pl-next').click();
      await page.settle();
    }
    assert.equal($('pl-next').getAttribute('aria-disabled'), 'true', 'nothing past the reach');
    assert.ok(rooms.isOfficeDay(last));
    assert.match($('mini-state').textContent, /^(Today|\w{3} \d+ \w{3}): /, 'the sign shows your next office day');
  });

  await t.test('the trip in, on a weekday: on my way, then arrived, then undo', async (st) => {
    if (!rooms.isOfficeDay(rooms.today())) return st.skip('today is a weekend in Jakarta');
    await rooms.pick(dewi.id);
    $('arrivals-open').click();
    await page.settle();
    assert.equal($('pl-today').hidden, false);
    if (!rooms.myPlan(rooms.today()) || !rooms.myPlan(rooms.today()).coming) { $('arr-yes').click(); await page.settle(); }
    assert.equal($('pl-main').getAttribute('aria-label'), 'On my way');
    $('pl-main').click();
    await page.settle();
    assert.equal(rooms.myPlan(rooms.today()).trip, 'on_the_way');
    assert.equal($('pl-line').getAttribute('role'), 'progressbar');
    assert.match($('pl-left').textContent, /^Left \d\d:\d\d$/);
    assert.equal($('pl-main').getAttribute('aria-label'), 'I’ve arrived');
    $('pl-main').click();
    await page.settle();
    assert.match($('pl-main').getAttribute('aria-label'), /^Arrived \d\d:\d\d$/);
    assert.equal($('pl-main').getAttribute('aria-disabled'), 'true');
    $('pl-undo').click();
    await page.settle();
    assert.equal(rooms.myPlan(rooms.today()).trip, null);
  });
});
