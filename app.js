/* ============================================
   云石天宫 · app.js (Supabase 联网版)
   ============================================ */

(function () {
  'use strict';

  // ----------- Supabase 客户端 -----------
  let supabase = null;
  if (typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined'
      && SUPABASE_URL && SUPABASE_ANON_KEY
      && !SUPABASE_URL.includes('你的项目')) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // ----------- 存储键（本地缓存/回退）-----------
  const KEY_THEME = 'xlx.theme';

  // ----------- 状态 -----------
  const state = {
    posts: [],
    likedIds: new Set(),
    filter: 'latest',
    search: '',
    user: null,
    profile: null,
    siteConfig: {},
    isAdmin: false,
    initialized: false,
  };

  // ----------- 工具函数 -----------
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function avatarColor(nickname) {
    const palettes = [
      ['#c9a96e', '#8b6914'],
      ['#a08050', '#6b5018'],
      ['#d4b87a', '#9a7b3d'],
      ['#b8956a', '#7a5a20'],
      ['#e0c88e', '#a08040'],
      ['#9a8050', '#5a4010'],
      ['#c8b070', '#8a6a28'],
      ['#b0a060', '#705818'],
    ];
    let h = 0;
    const s = nickname || '?';
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return palettes[h % palettes.length];
  }

  function applyAvatar(el, nickname) {
    const display = (nickname || '?').trim() || '?';
    const initial = display.slice(0, 1).toUpperCase();
    const [c1, c2] = avatarColor(display);
    el.textContent = initial;
    el.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
    el.style.color = '#1a1f3d';
    el.style.border = '2px solid #c9a96e';
  }

  function formatTime(ts) {
    if (!ts) return '';
    const time = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const now = Date.now();
    const diff = Math.floor((now - time) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    const d = new Date(time);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ----------- Toast -----------
  let toastTimer = null;
  function toast(msg, type = '') {
    const el = $('#toast');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ----------- 弹窗辅助 -----------
  function openModal(id) {
    const m = $('#' + id);
    if (!m) return;
    m.classList.remove('hidden');
    const firstInput = m.querySelector('input');
    if (firstInput) {
      firstInput.value = '';
      setTimeout(() => firstInput.focus(), 50);
    }
  }
  function closeModal(id) {
    const m = $('#' + id);
    if (!m) return;
    m.classList.add('hidden');
    m.querySelectorAll('input').forEach(i => (i.value = ''));
  }

  // ----------- 认证 UI -----------
  function updateAuthUI() {
    const area = $('#auth-area');
    const adminBtn = $('#btn-admin-toggle');
    if (!area) return;

    if (state.user) {
      const username = state.profile?.username || state.user.email?.split('@')[0] || '用户';
      area.innerHTML = `
        <div class="auth-user">
          <span class="avatar" title="${escapeHtml(username)}"></span>
          <span class="auth-username">${escapeHtml(username)}</span>
          <button class="btn btn-small btn-ghost" id="btn-logout">退出</button>
        </div>
      `;
      const avatar = area.querySelector('.avatar');
      if (avatar) applyAvatar(avatar, username);
      $('#btn-logout')?.addEventListener('click', logout);
    } else {
      area.innerHTML = `<button class="btn btn-small btn-primary" id="btn-login-show">登录</button>`;
      $('#btn-login-show')?.addEventListener('click', () => openModal('login-modal'));
    }

    // 管理员按钮
    if (adminBtn) {
      if (state.isAdmin) {
        adminBtn.classList.remove('hidden');
        document.body.classList.add('admin-mode');
        $('#admin-panel')?.classList.remove('hidden');
      } else {
        adminBtn.classList.add('hidden');
        document.body.classList.remove('admin-mode');
        $('#admin-panel')?.classList.add('hidden');
      }
    }

    // 发布区/登录提示
    if (state.user) {
      $('#login-prompt')?.classList.add('hidden');
      $('#compose-area')?.classList.remove('hidden');
      const nickInput = $('#composer-nickname');
      if (nickInput && !nickInput.value) {
        nickInput.value = state.profile?.username || '';
        applyAvatar($('#composer-avatar'), nickInput.value);
      }
    } else {
      $('#login-prompt')?.classList.remove('hidden');
      $('#compose-area')?.classList.add('hidden');
    }
  }

  // ----------- Supabase 数据操作 -----------
  async function loadPosts() {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('posts')
      .select('*, comments(*), likes(*)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('加载动态失败', error);
      return [];
    }
    return data || [];
  }

  async function loadSiteConfig() {
    if (!supabase) return {};
    const { data, error } = await supabase.from('site_config').select('*');
    if (error) {
      console.error('加载配置失败', error);
      return {};
    }
    const config = {};
    for (const row of data || []) {
      config[row.key] = row.value;
    }
    return config;
  }

  async function loadUserLikes() {
    if (!supabase || !state.user) return new Set();
    const { data, error } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', state.user.id);
    if (error) {
      console.error('加载点赞失败', error);
      return new Set();
    }
    return new Set((data || []).map(r => r.post_id));
  }

  async function loadProfile(userId) {
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('加载资料失败', error);
      return null;
    }
    return data;
  }

  async function publishPost() {
    if (!supabase || !state.user) {
      toast('请先登录', 'error');
      return;
    }
    const content = $('#composer-content').value.trim();
    if (!content) {
      toast('说点什么吧～', 'error');
      $('#composer-content').focus();
      return;
    }
    if (content.length > 500) {
      toast('不能超过 500 字哟', 'error');
      return;
    }

    const rawNick = $('#composer-nickname').value.trim();
    const nickname = rawNick || state.profile?.username || '用户';

    const { error } = await supabase.from('posts').insert({
      user_id: state.user.id,
      nickname,
      content,
    });

    if (error) {
      toast('发布失败：' + error.message, 'error');
      return;
    }

    $('#composer-content').value = '';
    updateCharCount();
    toast('发布成功 🎉', 'success');
  }

  async function toggleLike(postId) {
    if (!supabase || !state.user) {
      toast('请先登录', 'error');
      return;
    }
    const liked = state.likedIds.has(postId);
    if (liked) {
      const { error } = await supabase.from('likes').delete().match({
        post_id: postId,
        user_id: state.user.id,
      });
      if (error) {
        toast('取消点赞失败', 'error');
        return;
      }
      state.likedIds.delete(postId);
    } else {
      const { error } = await supabase.from('likes').insert({
        post_id: postId,
        user_id: state.user.id,
      });
      if (error) {
        toast('点赞失败', 'error');
        return;
      }
      state.likedIds.add(postId);
    }
    renderFeed();
  }

  async function addComment(postId, nickname, content) {
    if (!supabase || !state.user) {
      toast('请先登录', 'error');
      return;
    }
    if (!content.trim()) return;
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: state.user.id,
      nickname: (nickname || '').trim() || state.profile?.username || '用户',
      content: content.trim(),
    });
    if (error) {
      toast('评论失败：' + error.message, 'error');
      return;
    }
  }

  async function deletePost(postId) {
    if (!state.isAdmin) return;
    if (!confirm('确定删除这条动态吗？')) return;
    if (!supabase) return;
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      toast('删除失败：' + error.message, 'error');
      return;
    }
    toast('已删除', 'success');
  }

  async function deleteComment(postId, commentId) {
    if (!state.isAdmin) return;
    if (!supabase) return;
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) {
      toast('删除失败：' + error.message, 'error');
      return;
    }
  }

  function sharePost(postId) {
    const url = new URL(location.href);
    url.hash = `post-${postId}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url.toString())
        .then(() => toast('链接已复制', 'success'))
        .catch(() => toast('复制失败', 'error'));
    } else {
      toast(url.toString());
    }
  }

  // ----------- 认证操作 -----------
  async function register(username, email, password) {
    if (!supabase) {
      toast('Supabase 未配置', 'error');
      return false;
    }
    if (!username.trim()) {
      toast('请输入用户名', 'error');
      return false;
    }
    if (password.length < 6) {
      toast('密码至少 6 位', 'error');
      return false;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      toast('注册失败：' + error.message, 'error');
      return false;
    }
    toast('注册成功，请查收验证邮件', 'success');
    return true;
  }

  async function login(email, password) {
    if (!supabase) {
      toast('Supabase 未配置', 'error');
      return false;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast('登录失败：' + error.message, 'error');
      return false;
    }
    state.user = data.user;
    state.profile = await loadProfile(data.user.id);
    state.isAdmin = state.profile?.role === 'admin';
    state.likedIds = await loadUserLikes();
    updateAuthUI();
    await refreshData();
    toast('登录成功', 'success');
    return true;
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    state.user = null;
    state.profile = null;
    state.isAdmin = false;
    state.likedIds = new Set();
    updateAuthUI();
    renderFeed();
    toast('已退出登录', 'success');
  }

  // ----------- 管理员操作 -----------
  async function exportData() {
    if (!state.isAdmin) return;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config: state.siteConfig,
      posts: state.posts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xlx-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出', 'success');
  }

  async function importData(file) {
    if (!state.isAdmin) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.posts)) throw new Error('数据格式不正确');
        if (!confirm(`即将导入 ${data.posts.length} 条动态（仅导入配置），确定？`)) return;
        if (data.config && typeof data.config === 'object') {
          for (const [key, value] of Object.entries(data.config)) {
            await supabase.from('site_config').upsert({ key, value });
          }
          state.siteConfig = await loadSiteConfig();
          applyConfig();
        }
        toast('导入成功', 'success');
      } catch (err) {
        toast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  async function clearAllPosts() {
    if (!state.isAdmin) return;
    if (!confirm('确定要清空所有动态吗？此操作不可撤销。')) return;
    if (!confirm('再确认一次：所有动态和评论都会被删除！')) return;
    if (!supabase) return;
    const { error } = await supabase.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      toast('清空失败：' + error.message, 'error');
      return;
    }
    toast('已清空全部动态', 'success');
  }

  // ----------- 可视化编辑 -----------
  function setupEditableContent() {
    $$('[data-edit]').forEach(el => {
      if (el.tagName === 'TITLE') return;
      el.addEventListener('click', e => {
        if (!state.isAdmin) return;
        if (el.getAttribute('contenteditable') === 'true') return;
        e.preventDefault();
        startEditing(el);
      });
    });
  }

  function startEditing(el) {
    const originalText = el.textContent;
    el.setAttribute('contenteditable', 'true');
    el.dataset.original = originalText;
    el.focus();
    requestAnimationFrame(() => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  async function finishEditing(el, save) {
    const key = el.dataset.edit;
    if (save) {
      const newText = el.textContent.trim() || el.dataset.original || '';
      el.textContent = newText;
      state.siteConfig[key] = newText;
      if (supabase) {
        await supabase.from('site_config').upsert({ key, value: newText });
      }
      toast('已保存', 'success');
    } else if (el.dataset.original != null) {
      el.textContent = el.dataset.original;
    }
    el.removeAttribute('contenteditable');
    delete el.dataset.original;
  }

  // ----------- 配置应用 -----------
  function applyConfig() {
    $$('[data-edit]').forEach(el => {
      const key = el.dataset.edit;
      const v = state.siteConfig[key];
      if (typeof v === 'string' && v.length) {
        if (el.tagName === 'TITLE') {
          document.title = v;
        } else {
          el.textContent = v;
        }
      }
    });
  }

  // ----------- 渲染 -----------
  function renderStats() {
    const totalPosts = state.posts.length;
    const totalLikes = state.posts.reduce((s, p) => s + (p.likes?.length || 0), 0);
    const totalComments = state.posts.reduce((s, p) => s + (p.comments?.length || 0), 0);
    $('#stat-posts').textContent = totalPosts;
    $('#stat-likes').textContent = totalLikes;
    $('#stat-comments').textContent = totalComments;
  }

  function getVisiblePosts() {
    let list = state.posts.slice();
    if (state.filter === 'hot') {
      list.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0) || new Date(b.created_at) - new Date(a.created_at));
    } else if (state.filter === 'mine') {
      if (!state.user) return [];
      list = list.filter(p => p.user_id === state.user.id);
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (state.search) {
      const kw = state.search.toLowerCase();
      list = list.filter(p =>
        (p.content || '').toLowerCase().includes(kw) ||
        (p.nickname || '').toLowerCase().includes(kw)
      );
    }
    return list;
  }

  function renderFeed() {
    const feed = $('#feed');
    const tpl = $('#tpl-post');
    feed.innerHTML = '';
    const list = getVisiblePosts();
    $('#visible-count').textContent = list.length;

    if (list.length === 0) {
      $('#empty-state').classList.remove('hidden');
    } else {
      $('#empty-state').classList.add('hidden');
    }

    for (const post of list) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.postId = post.id;

      applyAvatar(node.querySelector('.avatar'), post.nickname || '用户');
      node.querySelector('.post-nickname').textContent = post.nickname || '用户';
      const timeEl = node.querySelector('.post-time');
      timeEl.textContent = formatTime(post.created_at);
      timeEl.dateTime = post.created_at;
      node.querySelector('.post-content').textContent = post.content;
      node.querySelector('.like-count').textContent = post.likes?.length || 0;
      node.querySelector('.comment-count').textContent = post.comments?.length || 0;

      const likeBtn = node.querySelector('.like-btn');
      if (state.likedIds.has(post.id)) likeBtn.classList.add('liked');
      const likeIcon = node.querySelector('.like-btn .action-icon');
      likeIcon.textContent = state.likedIds.has(post.id) ? '♥' : '♡';

      const commentsBox = node.querySelector('.comments');
      const commentList = node.querySelector('.comment-list');
      renderComments(commentList, post);

      feed.appendChild(node);
    }

    renderStats();
  }

  function renderComments(container, post) {
    container.innerHTML = '';
    const tpl = $('#tpl-comment');
    for (const c of post.comments || []) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.commentId = c.id;
      applyAvatar(node.querySelector('.avatar'), c.nickname || '用户');
      node.querySelector('.comment-nickname').textContent = c.nickname || '用户';
      const t = node.querySelector('.comment-time');
      t.textContent = formatTime(c.created_at);
      t.dateTime = c.created_at;
      node.querySelector('.comment-content').textContent = c.content;
      container.appendChild(node);
    }
  }

  // ----------- 数据刷新 -----------
  async function refreshData() {
    if (!supabase) return;
    state.posts = await loadPosts();
    state.siteConfig = await loadSiteConfig();
    state.likedIds = await loadUserLikes();
    applyConfig();
    renderFeed();
  }

  // ----------- Realtime 订阅 -----------
  function setupRealtime() {
    if (!supabase) return;

    supabase.channel('public:posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        refreshData();
      })
      .subscribe();

    supabase.channel('public:comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
        refreshData();
      })
      .subscribe();

    supabase.channel('public:likes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
        refreshData();
      })
      .subscribe();
  }

  // ----------- 主题 -----------
  function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(KEY_THEME, 'light');
      $('#btn-theme-toggle').textContent = '🌙';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(KEY_THEME, 'dark');
      $('#btn-theme-toggle').textContent = '☀️';
    }
  }

  // ----------- 字符计数 -----------
  function updateCharCount() {
    const ta = $('#composer-content');
    const count = ta.value.length;
    $('#char-count').textContent = count;
    const charCountEl = $('.char-count');
    if (count > 500) charCountEl.classList.add('over');
    else charCountEl.classList.remove('over');
  }

  // ----------- 事件绑定 -----------
  function bindEvents() {
    // 发布
    $('#btn-publish').addEventListener('click', publishPost);
    $('#composer-content').addEventListener('input', updateCharCount);
    $('#composer-content').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        publishPost();
      }
    });
    $('#composer-nickname').addEventListener('input', () => {
      applyAvatar($('#composer-avatar'), $('#composer-nickname').value);
    });
    applyAvatar($('#composer-avatar'), $('#composer-nickname').value);

    // emoji
    $('#emoji-bar').addEventListener('click', e => {
      const btn = e.target.closest('.emoji-btn');
      if (!btn) return;
      const ta = $('#composer-content');
      const emoji = btn.dataset.emoji;
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
      updateCharCount();
    });

    // 过滤
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.filter = tab.dataset.filter;
        renderFeed();
      });
    });

    // 搜索
    $('#btn-search-toggle').addEventListener('click', () => {
      $('#search-bar').classList.toggle('hidden');
      if (!$('#search-bar').classList.contains('hidden')) {
        $('#search-input').focus();
      }
    });
    $('#btn-search-close').addEventListener('click', () => {
      $('#search-bar').classList.add('hidden');
      $('#search-input').value = '';
      state.search = '';
      renderFeed();
    });
    $('#search-input').addEventListener('input', e => {
      state.search = e.target.value.trim();
      renderFeed();
    });

    // 主题
    $('#btn-theme-toggle').addEventListener('click', toggleTheme);

    // 登录提示
    $('#btn-login-prompt')?.addEventListener('click', () => openModal('login-modal'));

    // 登录/注册切换
    $('#btn-show-register')?.addEventListener('click', () => {
      closeModal('login-modal');
      openModal('register-modal');
    });
    $('#btn-show-login')?.addEventListener('click', () => {
      closeModal('register-modal');
      openModal('login-modal');
    });

    // 登录
    $('#btn-login')?.addEventListener('click', async () => {
      const ok = await login($('#login-email').value, $('#login-password').value);
      if (ok) closeModal('login-modal');
    });
    $('#login-password')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('#btn-login').click();
    });

    // 注册
    $('#btn-register')?.addEventListener('click', async () => {
      const ok = await register(
        $('#register-username').value,
        $('#register-email').value,
        $('#register-password').value
      );
      if (ok) closeModal('register-modal');
    });
    $('#register-password')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') $('#btn-register').click();
    });

    // 管理员按钮
    $('#btn-admin-toggle')?.addEventListener('click', () => {
      $('#admin-panel')?.classList.toggle('hidden');
    });

    // 管理员操作
    $('#btn-admin-logout')?.addEventListener('click', () => {
      state.isAdmin = false;
      document.body.classList.remove('admin-mode');
      $('#admin-panel')?.classList.add('hidden');
      renderFeed();
      toast('已退出管理员', 'success');
    });

    $('#btn-export-data')?.addEventListener('click', exportData);
    $('#btn-import-data')?.addEventListener('click', () => $('#import-file-input').click());
    $('#import-file-input')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });
    $('#btn-clear-all')?.addEventListener('click', clearAllPosts);

    // 弹窗关闭
    document.addEventListener('click', e => {
      if (e.target.matches('[data-modal-close]')) {
        const modal = e.target.closest('.modal');
        if (modal) modal.classList.add('hidden');
      }
      if (e.target.classList?.contains('modal')) {
        e.target.classList.add('hidden');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        $$('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
        $$('[data-edit][contenteditable="true"]').forEach(el => finishEditing(el, false));
      }
    });

    // 动态卡片事件委托
    $('#feed').addEventListener('click', e => {
      const postEl = e.target.closest('.post');
      if (!postEl) return;
      const postId = postEl.dataset.postId;

      if (e.target.closest('.post-delete')) {
        deletePost(postId);
        return;
      }
      const delC = e.target.closest('.comment-delete');
      if (delC) {
        const commentEl = delC.closest('.comment');
        deleteComment(postId, commentEl.dataset.commentId);
        return;
      }
      if (e.target.closest('.like-btn')) {
        toggleLike(postId);
        return;
      }
      if (e.target.closest('.comment-btn')) {
        postEl.querySelector('.comments').classList.toggle('hidden');
        return;
      }
      if (e.target.closest('.share-btn')) {
        sharePost(postId);
        return;
      }
      if (e.target.closest('.comment-submit')) {
        const nick = postEl.querySelector('.comment-compose .comment-nickname').value;
        const content = postEl.querySelector('.comment-input').value;
        addComment(postId, nick, content);
        return;
      }
    });

    $('#feed').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('.comment-input')) {
        const postEl = e.target.closest('.post');
        const postId = postEl.dataset.postId;
        const nick = postEl.querySelector('.comment-compose .comment-nickname').value;
        addComment(postId, nick, e.target.value);
      }
    });

    // 可视化编辑
    document.addEventListener('blur', e => {
      const el = e.target;
      if (el?.dataset && el.hasAttribute('data-edit') && el.getAttribute('contenteditable') === 'true') {
        finishEditing(el, true);
      }
    }, true);
    document.addEventListener('keydown', e => {
      const el = e.target;
      if (el?.dataset && el.hasAttribute && el.hasAttribute('data-edit') && el.getAttribute('contenteditable') === 'true') {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          el.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishEditing(el, false);
        }
      }
    });

    // 定时刷新时间显示
    setInterval(() => {
      $$('.post-time').forEach(t => {
        const iso = t.dateTime;
        if (iso) t.textContent = formatTime(iso);
      });
      $$('.comment-time').forEach(t => {
        const iso = t.dateTime;
        if (iso) t.textContent = formatTime(iso);
      });
    }, 60000);

    // 滚到锚点
    if (location.hash.startsWith('#post-')) {
      const id = location.hash.slice('#post-'.length);
      setTimeout(() => {
        const el = document.querySelector(`.post[data-post-id="${CSS.escape(id)}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  // ----------- 启动 -----------
  async function init() {
    // 主题
    const theme = localStorage.getItem(KEY_THEME);
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      const btn = $('#btn-theme-toggle');
      if (btn) btn.textContent = '☀️';
    }

    // Supabase 检查
    if (!supabase) {
      $('#feed').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚙️</div>
          <p class="empty-title">Supabase 未配置</p>
          <p class="empty-hint">请先编辑 supabase-config.js 填入你的项目 URL 和 Anon Key</p>
        </div>
      `;
      return;
    }

    // 获取当前会话
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      state.user = session.user;
      state.profile = await loadProfile(session.user.id);
      state.isAdmin = state.profile?.role === 'admin';
      state.likedIds = await loadUserLikes();
    }

    // 监听认证状态变化
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        state.user = session.user;
        state.profile = await loadProfile(session.user.id);
        state.isAdmin = state.profile?.role === 'admin';
        state.likedIds = await loadUserLikes();
        updateAuthUI();
        await refreshData();
      } else if (event === 'SIGNED_OUT') {
        state.user = null;
        state.profile = null;
        state.isAdmin = false;
        state.likedIds = new Set();
        updateAuthUI();
        renderFeed();
      }
    });

    updateAuthUI();
    setupEditableContent();
    bindEvents();
    setupRealtime();
    await refreshData();
    updateCharCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
