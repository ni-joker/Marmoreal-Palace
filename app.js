/* ============================================
   小龙虾广场 · app.js
   ============================================ */

(function () {
  'use strict';

  // ----------- 存储键 -----------
  const KEY_POSTS = 'xlx.posts';
  const KEY_CONFIG = 'xlx.config';
  const KEY_LIKED = 'xlx.liked';
  const KEY_NICK = 'xlx.nickname';
  const KEY_ADMIN_PW = 'xlx.adminPwHash';
  const KEY_ADMIN_SESSION = 'xlx.adminSession';
  const KEY_THEME = 'xlx.theme';
  const DEFAULT_PASSWORD = 'admin';

  // ----------- 状态 -----------
  const state = {
    posts: [],
    config: {},
    likedIds: new Set(),
    filter: 'latest',
    search: '',
    isAdmin: false,
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

  // 简单字符串哈希（不是加密级，仅做密码本地比对用）
  function hashStr(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  // 颜色生成：根据昵称生成渐变色头像背景
  function avatarColor(nickname) {
    const palettes = [
      ['#ff5e7e', '#ff8a5b'],
      ['#7c5cff', '#5ac8fa'],
      ['#22c55e', '#84cc16'],
      ['#f59e0b', '#ef4444'],
      ['#06b6d4', '#3b82f6'],
      ['#ec4899', '#a855f7'],
      ['#14b8a6', '#0ea5e9'],
      ['#fb7185', '#fb923c'],
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
  }

  function formatTime(ts) {
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ----------- 持久化 -----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('解析存储失败', key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast('存储失败：' + e.message, 'error');
    }
  }

  function loadAll() {
    state.posts = loadJSON(KEY_POSTS, []);
    state.config = loadJSON(KEY_CONFIG, {});
    state.likedIds = new Set(loadJSON(KEY_LIKED, []));

    // 首次访问，加点示例内容（用户可以删）
    if (state.posts.length === 0 && !localStorage.getItem('xlx.seeded')) {
      state.posts = makeSeedPosts();
      saveJSON(KEY_POSTS, state.posts);
      localStorage.setItem('xlx.seeded', '1');
    }

    // 主题
    const theme = localStorage.getItem(KEY_THEME);
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      const btn = $('#btn-theme-toggle');
      if (btn) btn.textContent = '☀️';
    }

    // 管理员会话
    state.isAdmin = sessionStorage.getItem(KEY_ADMIN_SESSION) === '1';
    if (state.isAdmin) document.body.classList.add('admin-mode');

    // 昵称记忆
    const savedNick = localStorage.getItem(KEY_NICK);
    if (savedNick) $('#composer-nickname').value = savedNick;
  }

  function savePosts() { saveJSON(KEY_POSTS, state.posts); }
  function saveLiked() { saveJSON(KEY_LIKED, Array.from(state.likedIds)); }
  function saveConfig() { saveJSON(KEY_CONFIG, state.config); }

  function makeSeedPosts() {
    const now = Date.now();
    return [
      {
        id: uid(),
        nickname: '小龙虾管理员',
        content: '欢迎来到小龙虾广场 🦞\n这里是大家自由分享日常的小角落，发条动态打个招呼吧！',
        time: now - 1000 * 60 * 5,
        likes: 3,
        comments: [
          { id: uid(), nickname: '路过的人', content: '签到 ✋', time: now - 1000 * 60 * 3 },
        ],
      },
      {
        id: uid(),
        nickname: '匿名',
        content: '今天天气真好，适合发呆 ☀️',
        time: now - 1000 * 60 * 30,
        likes: 1,
        comments: [],
      },
    ];
  }

  // ----------- 配置应用 -----------
  function applyConfig() {
    $$('[data-edit]').forEach(el => {
      const key = el.dataset.edit;
      const v = state.config[key];
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
    const totalLikes = state.posts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalComments = state.posts.reduce((s, p) => s + (p.comments?.length || 0), 0);
    $('#stat-posts').textContent = totalPosts;
    $('#stat-likes').textContent = totalLikes;
    $('#stat-comments').textContent = totalComments;
  }

  function getVisiblePosts() {
    let list = state.posts.slice();
    if (state.filter === 'hot') {
      list.sort((a, b) => (b.likes || 0) - (a.likes || 0) || b.time - a.time);
    } else if (state.filter === 'mine') {
      const me = ($('#composer-nickname').value || '').trim();
      const nick = me || '匿名';
      list = list.filter(p => (p.nickname || '匿名') === nick);
      list.sort((a, b) => b.time - a.time);
    } else {
      list.sort((a, b) => b.time - a.time);
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

      applyAvatar(node.querySelector('.avatar'), post.nickname || '匿名');
      node.querySelector('.post-nickname').textContent = post.nickname || '匿名';
      const timeEl = node.querySelector('.post-time');
      timeEl.textContent = formatTime(post.time);
      timeEl.dateTime = new Date(post.time).toISOString();
      node.querySelector('.post-content').textContent = post.content;
      node.querySelector('.like-count').textContent = post.likes || 0;
      node.querySelector('.comment-count').textContent = post.comments?.length || 0;

      const likeBtn = node.querySelector('.like-btn');
      if (state.likedIds.has(post.id)) likeBtn.classList.add('liked');
      const likeIcon = node.querySelector('.like-btn .action-icon');
      likeIcon.textContent = state.likedIds.has(post.id) ? '♥' : '♡';

      // 评论列表渲染
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
      applyAvatar(node.querySelector('.avatar'), c.nickname || '匿名');
      node.querySelector('.comment-nickname').textContent = c.nickname || '匿名';
      const t = node.querySelector('.comment-time');
      t.textContent = formatTime(c.time);
      t.dateTime = new Date(c.time).toISOString();
      node.querySelector('.comment-content').textContent = c.content;
      container.appendChild(node);
    }
  }

  // ----------- 业务操作 -----------
  function publishPost() {
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
    const nickname = rawNick || '匿名';
    localStorage.setItem(KEY_NICK, rawNick);

    const post = {
      id: uid(),
      nickname,
      content,
      time: Date.now(),
      likes: 0,
      comments: [],
    };
    state.posts.unshift(post);
    savePosts();
    $('#composer-content').value = '';
    updateCharCount();
    renderFeed();
    toast('发布成功 🎉', 'success');
  }

  function toggleLike(postId) {
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    if (state.likedIds.has(postId)) {
      state.likedIds.delete(postId);
      post.likes = Math.max(0, (post.likes || 0) - 1);
    } else {
      state.likedIds.add(postId);
      post.likes = (post.likes || 0) + 1;
    }
    saveLiked();
    savePosts();
    renderFeed();
  }

  function addComment(postId, nickname, content) {
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    if (!content.trim()) return;
    post.comments = post.comments || [];
    post.comments.push({
      id: uid(),
      nickname: (nickname || '').trim() || '匿名',
      content: content.trim(),
      time: Date.now(),
    });
    savePosts();
    renderFeed();
  }

  function deletePost(postId) {
    if (!state.isAdmin) return;
    if (!confirm('确定删除这条动态吗？')) return;
    state.posts = state.posts.filter(p => p.id !== postId);
    savePosts();
    renderFeed();
    toast('已删除', 'success');
  }

  function deleteComment(postId, commentId) {
    if (!state.isAdmin) return;
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    post.comments = (post.comments || []).filter(c => c.id !== commentId);
    savePosts();
    renderFeed();
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

  // ----------- 管理员 -----------
  function getStoredPwHash() {
    return localStorage.getItem(KEY_ADMIN_PW) || hashStr(DEFAULT_PASSWORD);
  }

  function tryAdminLogin(password) {
    const stored = getStoredPwHash();
    if (hashStr(password) === stored) {
      state.isAdmin = true;
      sessionStorage.setItem(KEY_ADMIN_SESSION, '1');
      document.body.classList.add('admin-mode');
      $('#admin-panel').classList.remove('hidden');
      renderFeed();
      toast('管理员模式已开启', 'success');
      return true;
    }
    toast('密码错误', 'error');
    return false;
  }

  function adminLogout() {
    state.isAdmin = false;
    sessionStorage.removeItem(KEY_ADMIN_SESSION);
    document.body.classList.remove('admin-mode');
    $('#admin-panel').classList.add('hidden');
    // 关闭所有正在编辑的元素
    $$('[data-edit][contenteditable="true"]').forEach(el => {
      el.removeAttribute('contenteditable');
    });
    renderFeed();
    toast('已退出管理员', 'success');
  }

  function changePassword(oldPw, newPw, confirmPw) {
    if (hashStr(oldPw) !== getStoredPwHash()) {
      toast('当前密码不正确', 'error');
      return false;
    }
    if (newPw.length < 4) {
      toast('新密码至少 4 位', 'error');
      return false;
    }
    if (newPw !== confirmPw) {
      toast('两次输入不一致', 'error');
      return false;
    }
    localStorage.setItem(KEY_ADMIN_PW, hashStr(newPw));
    toast('密码已更新', 'success');
    return true;
  }

  function exportData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      config: state.config,
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

  function importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.posts)) throw new Error('数据格式不正确');
        if (!confirm(`即将导入 ${data.posts.length} 条动态，将覆盖当前数据，确定？`)) return;
        state.posts = data.posts;
        if (data.config && typeof data.config === 'object') {
          state.config = data.config;
          saveConfig();
          applyConfig();
        }
        savePosts();
        renderFeed();
        toast('导入成功', 'success');
      } catch (err) {
        toast('导入失败：' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function clearAllPosts() {
    if (!confirm('确定要清空所有动态吗？此操作不可撤销。')) return;
    if (!confirm('再确认一次：所有动态和评论都会被删除！')) return;
    state.posts = [];
    savePosts();
    renderFeed();
    toast('已清空全部动态', 'success');
  }

  // ----------- 可视化编辑 -----------
  function setupEditableContent() {
    $$('[data-edit]').forEach(el => {
      if (el.tagName === 'TITLE') return; // <title> 不能 contenteditable
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
    // 全选
    requestAnimationFrame(() => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  function finishEditing(el, save) {
    const key = el.dataset.edit;
    if (save) {
      const newText = el.textContent.trim() || el.dataset.original || '';
      el.textContent = newText;
      state.config[key] = newText;
      saveConfig();
      // 如果改的是页面标题
      if (key === 'page-title' || (el.tagName === 'H1' && key === 'hero-title')) {
        // brand-name / page-title 互不影响
      }
      toast('已保存', 'success');
    } else if (el.dataset.original != null) {
      el.textContent = el.dataset.original;
    }
    el.removeAttribute('contenteditable');
    delete el.dataset.original;
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

  // ----------- 事件绑定 -----------
  function bindEvents() {
    // 发布
    $('#btn-publish').addEventListener('click', publishPost);
    $('#composer-content').addEventListener('input', () => {
      updateCharCount();
      // 头像跟着昵称变（昵称变时也触发）
    });
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

    // 管理员
    $('#btn-admin-toggle').addEventListener('click', () => {
      if (state.isAdmin) {
        $('#admin-panel').classList.toggle('hidden');
      } else {
        openModal('admin-login-modal');
      }
    });
    $('#btn-admin-login').addEventListener('click', () => {
      const pw = $('#admin-password-input').value;
      if (tryAdminLogin(pw)) closeModal('admin-login-modal');
    });
    $('#admin-password-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') $('#btn-admin-login').click();
    });
    $('#btn-admin-logout').addEventListener('click', adminLogout);
    $('#btn-change-password').addEventListener('click', () => openModal('change-password-modal'));
    $('#btn-confirm-change-password').addEventListener('click', () => {
      const ok = changePassword(
        $('#old-password-input').value,
        $('#new-password-input').value,
        $('#confirm-password-input').value
      );
      if (ok) closeModal('change-password-modal');
    });
    $('#btn-export-data').addEventListener('click', exportData);
    $('#btn-import-data').addEventListener('click', () => $('#import-file-input').click());
    $('#import-file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });
    $('#btn-clear-all').addEventListener('click', clearAllPosts);

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

      // 删除动态
      if (e.target.closest('.post-delete')) {
        deletePost(postId);
        return;
      }
      // 删除评论
      const delC = e.target.closest('.comment-delete');
      if (delC) {
        const commentEl = delC.closest('.comment');
        deleteComment(postId, commentEl.dataset.commentId);
        return;
      }
      // 点赞
      if (e.target.closest('.like-btn')) {
        toggleLike(postId);
        return;
      }
      // 切换评论
      if (e.target.closest('.comment-btn')) {
        postEl.querySelector('.comments').classList.toggle('hidden');
        return;
      }
      // 分享
      if (e.target.closest('.share-btn')) {
        sharePost(postId);
        return;
      }
      // 提交评论
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

    // 可视化编辑：失焦保存、回车保存、ESC 取消
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
        if (iso) t.textContent = formatTime(Date.parse(iso));
      });
      $$('.comment-time').forEach(t => {
        const iso = t.dateTime;
        if (iso) t.textContent = formatTime(Date.parse(iso));
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
  function init() {
    loadAll();
    applyConfig();
    setupEditableContent();
    bindEvents();
    renderFeed();
    updateCharCount();
    if (state.isAdmin) {
      $('#admin-panel').classList.remove('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
