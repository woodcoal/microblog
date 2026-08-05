(() => {
  const root = document.documentElement;
  const themes = [['light','☀ 亮色'],['dark','☾ 暗色'],['eye-care','♧ 护眼'],['high-contrast','◧ 高对比']];
  const accents = [['blue','靛蓝'],['green','绿色'],['orange','橙色'],['purple','紫色'],['rose','玫瑰']];

  const closeAll = () => document.querySelectorAll('.theme-menu,.nav-dropdown-menu,.admin-nav').forEach(x => x.classList.remove('open'));

  const toast = (message = '已保存原型状态') => {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
    el.textContent = message;
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 1800);
  };

  // 主题初始化
  const savedTheme = localStorage.getItem('theme') || 'light';
  const savedAccent = localStorage.getItem('accent') || '';
  root.dataset.theme = savedTheme;
  if (savedAccent) root.dataset.accent = savedAccent;

  // 主题切换菜单
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    const menu = document.createElement('div');
    menu.className = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = themes.map(([id,label]) =>
      `<button type="button" data-theme="${id}">${label}</button>`).join('') +
      '<hr>' + accents.map(([id,label]) =>
        `<button type="button" data-accent="${id}">● ${label}</button>`).join('');
    button.parentElement.append(menu);
    button.addEventListener('click', e => { e.stopPropagation(); closeAll(); menu.classList.add('open'); });
    menu.addEventListener('click', e => {
      const target = e.target.closest('button');
      if (!target) return;
      if (target.dataset.theme) { root.dataset.theme = target.dataset.theme; localStorage.setItem('theme', target.dataset.theme); toast('已切换至 ' + target.textContent.trim()); }
      if (target.dataset.accent) { root.dataset.accent = target.dataset.accent; localStorage.setItem('accent', target.dataset.accent); toast('强调色已更新'); }
      closeAll();
    });
  });

  // 用户下拉菜单（还原 Base.astro 结构）
  document.querySelectorAll('.nav-user-trigger').forEach(trigger => {
    const menu = trigger.parentElement.querySelector('.nav-dropdown-menu') || trigger.nextElementSibling;
    if (!menu) return;
    trigger.addEventListener('click', e => { e.stopPropagation(); closeAll(); menu.classList.add('open'); trigger.setAttribute('aria-expanded','true'); });
    if (menu) {
      menu.addEventListener('click', e => { if (e.target.closest('a,button')) closeAll(); });
    }
  });

  // 通用 toast 触发
  document.querySelectorAll('[data-toast]').forEach(el =>
    el.addEventListener('click', () => toast(el.dataset.toast)));

  // 点赞
  document.querySelectorAll('[data-like]').forEach(button =>
    button.addEventListener('click', () => {
      button.classList.toggle('liked');
      const n = button.querySelector('span');
      if (n) n.textContent = Number(n.textContent) + (button.classList.contains('liked') ? 1 : -1);
    }));

  // tabs
  document.querySelectorAll('[data-tab]').forEach(button =>
    button.addEventListener('click', () => {
      button.parentElement.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
    }));

  // 点击外部关闭
  document.addEventListener('click', closeAll);

  // ESC 关闭
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  // 管理后台移动端侧边栏
  document.querySelectorAll('.admin-mobile-toggle').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); e.target.closest('.admin-shell').querySelector('.admin-nav').classList.toggle('open'); }));

  // 管理后台导航链接
  document.querySelectorAll('.admin-nav a').forEach(link => {
    if (link.textContent.includes('帖子管理')) link.href = 'admin-posts.html';
    if (link.textContent.includes('仪表盘')) link.href = 'admin.html';
  });
})();
