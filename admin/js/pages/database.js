import { api, esc, date, num, icon } from '../core.js';

const NAMES = {
  products: 'გემოები',
  stock_movements: 'მარაგის მოძრაობა',
  orders: 'შეკვეთები',
  order_items: 'შეკვეთის პოზიციები',
  order_events: 'შეკვეთის ისტორია',
  customers: 'მომხმარებლები',
  coupons: 'პრომოკოდები',
  delivery_zones: 'მიწოდების ზონები',
  reviews: 'შეფასებები',
  faqs: 'კითხვა-პასუხი',
  settings: 'პარამეტრები',
  content: 'შეცვლილი ტექსტები',
  staff: 'თანამშრომლები',
  audit_log: 'ცვლილებების ისტორია',
  visits: 'ვიზიტები (დღე × ვიზიტორი)',
};

export async function render(view) {
  const d = await api('/api/admin/database');
  const local = d.kind === 'pglite';
  view.innerHTML = `
    <div class="page-head"><div><h1>ბაზა</h1><p>რა ბაზაა, სად არის და რამდენი ჩანაწერია. მხოლოდ სანახავად — ცვლილება ადმინის გვერდებიდან ხდება.</p></div>
      <a class="btn btn--primary" href="/api/admin/database/backup">${icon('download')} სარეზერვო ასლი (JSON)</a></div>
    <div class="grid-2" style="margin-bottom:14px">
      <div class="card">
        <div class="card__head"><h2>${esc(d.version)}</h2><span class="badge ${local ? 'badge--warn' : 'badge--good'}">${local ? 'ლოკალური (PGlite)' : 'სერვერი'}</span></div>
        <dl class="kv">
          <dt>სად</dt><dd>${esc(d.where)}</dd>
          <dt>ზომა</dt><dd>${esc(d.size)}</dd>
          <dt>მიგრაციები</dt><dd>${d.migrations.map((m) => esc(m.name)).join(', ')}</dd>
        </dl>
        ${
          local
            ? `<p class="note" style="margin:14px 0 0">ეს არის ჩაშენებული PostgreSQL შენს კომპიუტერზე (საქაღალდე <b>data/pglite</b>). ინტერნეტში გაშვებისას <b>.env</b>-ში ჩაწერე <b>DATABASE_URL</b> (Supabase, Neon ან ნებისმიერი Postgres) — კოდი იგივე რჩება.</p>`
            : ''
        }
      </div>
      <div class="card">
        <div class="card__head"><h2>სარეზერვო ასლი</h2></div>
        <p style="margin:0" class="muted">ჩამოტვირთავს ყველა ცხრილს ერთ JSON ფაილად (სესიების გარდა). ფაილში არის მომხმარებლების ტელეფონები და მისამართები — შეინახე უსაფრთხო ადგილას.</p>
      </div>
    </div>
    <div class="card card--flush"><div class="card__head"><h2>ცხრილები</h2></div><div class="table-wrap"><table>
      <thead><tr><th>ცხრილი</th><th></th><th class="right">ჩანაწერი</th></tr></thead>
      <tbody>${Object.entries(d.counts)
        .map(([t, n]) => `<tr><td>${esc(NAMES[t] || t)}</td><td class="muted small"><code>${esc(t)}</code></td><td class="right num">${num(n)}</td></tr>`)
        .join('')}</tbody></table></div></div>
    <p class="muted small" style="margin-top:12px">ბოლო მიგრაცია: ${date(d.migrations.at(-1)?.applied_at)}</p>`;
}
