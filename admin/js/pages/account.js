import { api, esc, date, run } from '../core.js';

export async function render(view, { me }) {
  view.innerHTML = `
    <div class="page-head"><div><h1>ჩემი ანგარიში</h1>
      <p>ცვლილებისთვის საჭიროა მიმდინარე პაროლი. ახალი პაროლის შემდეგ სხვა მოწყობილობებიდან გამოგიყვანს.</p></div></div>
    <form class="card stack" id="form" style="max-width:520px" novalidate>
      <div class="grid-2">
        <label class="field"><span>ლოგინი</span><input name="username" value="${esc(me.username)}" autocomplete="username" required></label>
        <label class="field"><span>სახელი</span><input name="name" value="${esc(me.name)}" maxlength="60"></label>
      </div>
      <label class="field"><span>ახალი პაროლი <small>მინ. 10 სიმბოლო; თუ არ ცვლი — ცარიელი</small></span><input name="newPassword" type="password" autocomplete="new-password"></label>
      <label class="field"><span>გაიმეორე ახალი პაროლი</span><input name="repeat" type="password" autocomplete="new-password"></label>
      <label class="field"><span>მიმდინარე პაროლი</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <p class="muted small" style="margin:0">პაროლი ბოლოს შეიცვალა: ${date(me.password_changed_at)}</p>
      <div><button class="btn btn--primary" type="submit">შენახვა</button></div>
    </form>`;

  view.querySelector('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target.elements;
    if (f.newPassword.value !== f.repeat.value) {
      f.repeat.setCustomValidity('არ ემთხვევა');
      f.repeat.reportValidity();
      f.repeat.setCustomValidity('');
      return;
    }
    run(e.submitter, async () => {
      await api('/api/admin/account', {
        method: 'PUT',
        body: { username: f.username.value.trim(), name: f.name.value, newPassword: f.newPassword.value, currentPassword: f.currentPassword.value },
      });
      f.newPassword.value = f.repeat.value = f.currentPassword.value = '';
      Object.assign(me, { username: f.username.value.trim(), name: f.name.value });
    }, 'ანგარიში განახლდა');
  });
}
