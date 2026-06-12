const USERS_KEY = 'stock_users';
const ACTIVE_KEY = 'stock_active_user';

export function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

export function createUser(name) {
  const trimmed = name.trim();
  const users = getUsers();
  if (users.some(u => u.name === trimmed)) return null;
  const user = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    createdAt: Date.now(),
  };
  users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return user;
}

export function deleteUser(id) {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.removeItem('stock_watchlist_' + id);
}

export function setActiveUser(user) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(user));
}

export function getActiveUser() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_KEY)) || null;
  } catch {
    return null;
  }
}

export function clearActiveUser() {
  localStorage.removeItem(ACTIVE_KEY);
}

export function showUserModal(onDone) {
  const overlay = document.getElementById('user-overlay');
  overlay.classList.add('show');
  renderUserList(onDone);
  setupCreateForm(onDone);
}

function hideUserModal() {
  document.getElementById('user-overlay').classList.remove('show');
}

function renderUserList(onDone) {
  const list = document.getElementById('user-list');
  const users = getUsers();
  if (users.length === 0) {
    list.innerHTML = '<div class="user-empty">暂无用户，请创建一个</div>';
    return;
  }
  list.innerHTML = users.map(u =>
    `<div class="user-item" data-id="${u.id}">
      <span class="user-avatar">${u.name.charAt(0)}</span>
      <span class="user-name">${u.name}</span>
      <button class="user-delete" title="删除用户">&times;</button>
    </div>`
  ).join('');

  list.querySelectorAll('.user-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.user-delete')) return;
      const user = users.find(u => u.id === el.dataset.id);
      if (user) {
        setActiveUser(user);
        hideUserModal();
        onDone(user);
      }
    });
    el.querySelector('.user-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteUser(el.dataset.id);
      renderUserList(onDone);
    });
  });
}

function setupCreateForm(onDone) {
  const input = document.getElementById('user-name-input');
  const btn = document.getElementById('user-create-btn');
  const err = document.getElementById('user-error');
  const overlay = document.getElementById('user-overlay');
  const clearError = () => { err.textContent = ''; };
  const doCreate = () => {
    const name = input.value.trim();
    if (!name) return;
    const user = createUser(name);
    if (!user) {
      err.textContent = '此用户已经存在，请重新输入';
      return;
    }
    clearError();
    setActiveUser(user);
    input.value = '';
    hideUserModal();
    onDone(user);
  };
  btn.onclick = doCreate;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') doCreate();
    else clearError();
  };
  input.onfocus = clearError;
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      clearError();
      input.value = '';
      hideUserModal();
    }
  };
}
