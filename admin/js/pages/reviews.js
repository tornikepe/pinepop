import { api, esc, date, stars, emptyState, run, confirmModal } from '../core.js';

const TABS = [
  ['pending', 'მოლოდინში'],
  ['published', 'გამოქვეყნებული'],
  ['hidden', 'დამალული'],
  ['', 'ყველა'],
];
const LABEL = { pending: 'მოლოდინში', published: 'გამოქვეყნებული', hidden: 'დამალული' };

export async function render(view, { can, refreshBadges }) {
  const write = can('reviews:write');
  let status = 'pending';
  view.innerHTML = `
    <div class="page-head">
      <div><h1>შეფასებები</h1>
        <p>შეფასების დატოვება მხოლოდ მიწოდებული შეკვეთის მფლობელს შეუძლია, ამიტომ ყოველი ვარსკვლავი ნამდვილია. საიტზე მხოლოდ გამოქვეყნებული ჩანს.</p></div>
    </div>
    <div class="toolbar"><div class="seg" id="tabs" role="group" aria-label="სტატუსი"></div></div>
    <div class="stack" id="list"></div>`;

  async function load() {
    const d = await api(`/api/admin/reviews${status ? `?status=${status}` : ''}`);
    const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
    view.querySelector('#tabs').innerHTML = TABS.map(
      ([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === status}">${l}<span class="count">${v ? d.counts[v] || 0 : total}</span></button>`
    ).join('');
    view.querySelector('#list').innerHTML = d.reviews.length
      ? d.reviews
          .map(
            (r) => `<article class="card review" data-id="${r.id}">
              <div class="row row--between">
                <div class="row">${stars(r.rating)} <b>${esc(r.name)}</b> <span class="muted small">${esc(r.flavors)}</span></div>
                <div class="row"><span class="badge st-${r.status}">${LABEL[r.status]}</span>
                  <a class="muted small" href="#/orders/${r.orderId}">${esc(r.orderCode)}</a> <span class="muted small">${date(r.at)}</span></div>
              </div>
              <p class="review__body">${esc(r.body)}</p>
              <label class="field"><span>პასუხი საიტზე <small>(არასავალდებულო)</small></span>
                <textarea name="reply" rows="2" maxlength="600" ${write ? '' : 'disabled'} placeholder="მაგ. მადლობა! 🍍">${esc(r.reply)}</textarea></label>
              ${
                write
                  ? `<div class="row">
                      ${r.status !== 'published' ? '<button class="btn btn--primary" data-set="published">გამოქვეყნება</button>' : '<button class="btn" data-set="published">პასუხის შენახვა</button>'}
                      ${r.status !== 'hidden' ? '<button class="btn" data-set="hidden">დამალვა</button>' : ''}
                      <span class="spacer"></span><button class="btn btn--danger btn--sm" data-delete>წაშლა</button></div>`
                  : ''
              }
            </article>`
          )
          .join('')
      : `<div class="card">${emptyState(status === 'pending' ? 'ახალი შეფასება არ არის' : 'აქ ცარიელია', status === 'pending' ? 'მიწოდების შემდეგ მომხმარებელს შეუძლია შეფასების დატოვება „შეკვეთის სტატუსიდან“' : '')}</div>`;
  }

  view.querySelector('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) {
      status = b.dataset.v;
      load();
    }
  });

  view.querySelector('#list').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const set = e.target.closest('[data-set]');
    if (set) {
      await run(set, async () => {
        await api(`/api/admin/reviews/${id}`, { method: 'PATCH', body: { status: set.dataset.set, reply: card.querySelector('[name=reply]').value } });
        await load();
        refreshBadges();
      }, 'შენახულია');
    }
    if (e.target.closest('[data-delete]')) {
      if (!(await confirmModal('შეფასების წაშლა', 'სამუდამოდ წავშალო? თუ უბრალოდ არ გინდა საიტზე, დამალე.', { label: 'წაშლა' }))) return;
      await run(null, async () => {
        await api(`/api/admin/reviews/${id}`, { method: 'DELETE' });
        await load();
        refreshBadges();
      }, 'წაიშალა');
    }
  });

  await load();
}
