const API_BASE = "/api";

const dom = {
  boardList: document.getElementById("boardList"),
  forumStats: document.getElementById("forumStats"),
  accountPanel: document.getElementById("accountPanel"),
  boardEyebrow: document.getElementById("boardEyebrow"),
  boardTitle: document.getElementById("boardTitle"),
  boardDescription: document.getElementById("boardDescription"),
  topicSummary: document.getElementById("topicSummary"),
  topicList: document.getElementById("topicList"),
  threadView: document.getElementById("threadView"),
  activityFeed: document.getElementById("activityFeed"),
  searchInput: document.getElementById("searchInput"),
  chipRow: document.querySelector(".chipRow"),
  focusComposerBtn: document.getElementById("focusComposerBtn"),
  resetDemoBtn: document.getElementById("resetDemoBtn"),
  topicForm: document.getElementById("topicForm"),
  topicBoardSelect: document.getElementById("topicBoardSelect"),
  topicAuthorInput: document.getElementById("topicAuthorInput"),
  topicTitleInput: document.getElementById("topicTitleInput"),
  topicTagsInput: document.getElementById("topicTagsInput"),
  topicContentInput: document.getElementById("topicContentInput"),
  fillExampleBtn: document.getElementById("fillExampleBtn"),
  formStatus: document.getElementById("formStatus"),
  adminPanel: document.getElementById("adminPanel"),
  composePane: document.querySelector(".composePane"),
  panels: document.querySelectorAll(".panel")
};

const uiState = {
  activeBoardId: "",
  activeTopicId: "",
  search: "",
  sort: "latest",
  authStatus: "",
  formStatus: "",
  replyStatus: ""
};

let forumState = loadForumState();
let currentUser = loadSession();
let loginAudit = loadLoginAudit();

init();

async function init() {
  bindEvents();
  renderLoadingState();

  try {
    await refreshFromServer();
  } catch (error) {
    uiState.authStatus = error.message || "Не удалось подключиться к серверу.";
  }

  renderBoardOptions();
  syncComposerBoardSelection();
  syncComposerIdentity();
  render();
}

function bindEvents() {
  dom.accountPanel.addEventListener("click", handleAccountClick);
  dom.accountPanel.addEventListener("submit", handleAccountSubmit);
  dom.boardList.addEventListener("click", handleBoardClick);
  dom.topicList.addEventListener("click", handleTopicListClick);
  dom.activityFeed.addEventListener("click", handleActivityClick);
  dom.threadView.addEventListener("click", handleThreadClick);
  dom.threadView.addEventListener("submit", handleThreadSubmit);
  dom.adminPanel.addEventListener("click", handleAdminClick);
  dom.searchInput.addEventListener("input", handleSearchInput);
  dom.chipRow.addEventListener("click", handleSortClick);
  dom.topicForm.addEventListener("submit", handleTopicSubmit);
  dom.focusComposerBtn.addEventListener("click", focusComposer);
  dom.fillExampleBtn.addEventListener("click", fillExample);
  dom.resetDemoBtn.addEventListener("click", resetDemoData);
}

function render() {
  ensureActiveTopic();
  renderAccountPanel();
  renderBoardHeader();
  renderBoardList();
  renderStats();
  renderTopicSummary();
  renderTopicList();
  renderThread();
  renderAdminPanel();
  renderActivity();
  renderSortState();
  renderBoardOptions();
  dom.formStatus.textContent = uiState.formStatus;
  syncComposerIdentity();
  syncResetVisibility();
  syncPanelAccent();
}

function renderBoardHeader() {
  const board = getActiveBoard();

  if (!board) {
    dom.boardEyebrow.textContent = "Раздел";
    dom.boardTitle.textContent = "Темы";
    dom.boardDescription.textContent = "Раздел не найден.";
    return;
  }

  const visibleTopics = getVisibleTopics();
  dom.boardEyebrow.textContent = `Раздел ${String(forumState.boards.indexOf(board) + 1).padStart(2, "0")}`;
  dom.boardTitle.textContent = board.name;
  dom.boardDescription.textContent = `${board.description} Сейчас показано ${visibleTopics.length} ${pluralize(visibleTopics.length, ["тема", "темы", "тем"])}.`;
}

function renderBoardList() {
  dom.boardList.innerHTML = forumState.boards
    .map((board, index) => {
      const topics = getBoardTopics(board.id);
      const replies = countReplies(topics);
      const latestTopic = getSortedTopics(topics, "latest")[0];
      const isActive = board.id === uiState.activeBoardId;

      return `
        <button
          class="boardCard ${isActive ? "is-active" : ""}"
          data-board-id="${board.id}"
          style="--board-accent:${board.accent}; --item-index:${index};"
          type="button"
        >
          <div class="boardCardHeader">
            <div class="authorChip">
              <span class="boardBadge">${escapeHtml(board.icon)}</span>
              <div>
                <h3>${escapeHtml(board.name)}</h3>
                <div class="boardCount">${topics.length} ${pluralize(topics.length, ["тема", "темы", "тем"])}</div>
              </div>
            </div>
            <span class="boardMeta">${latestTopic ? formatRelativeTime(latestTopic.updatedAt) : "пусто"}</span>
          </div>
          <p class="boardMeta">${escapeHtml(board.description)}</p>
          <div class="metricRow">
            <span>${replies} ${pluralize(replies, ["ответ", "ответа", "ответов"])}</span>
            <span>${topics.filter(isUnanswered).length} без ответа</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderStats() {
  const topicCount = forumState.topics.length;
  const replyCount = countReplies(forumState.topics);
  const unansweredCount = forumState.topics.filter(isUnanswered).length;
  const totalViews = forumState.topics.reduce((sum, topic) => sum + topic.views, 0);

  const stats = [
    { label: "раздела", value: forumState.boards.length },
    { label: "тем", value: topicCount },
    { label: "ответов", value: replyCount },
    { label: "просмотров", value: totalViews },
    { label: "без ответа", value: unansweredCount }
  ];

  dom.forumStats.innerHTML = stats
    .map(
      (item, index) => `
        <div class="statCard" style="--item-index:${index};">
          <span class="statValue">${formatCompactNumber(item.value)}</span>
          <span class="boardMeta">${item.label}</span>
        </div>
      `
    )
    .join("");
}

function renderAccountPanel() {
  if (!currentUser) {
    dom.accountPanel.innerHTML = `
      <form id="loginForm" class="stackedForm compactStack">
        <label>
          <span>Логин</span>
          <input name="login" type="text" maxlength="32" placeholder="DevBoggy">
        </label>

        <label>
          <span>Пароль</span>
          <input name="password" type="password" maxlength="64" placeholder="Введите пароль">
        </label>

        <button class="accentButton fullWidth" type="submit">Войти как разработчик</button>
        <p class="statusText">${escapeHtml(uiState.authStatus)}</p>
        <p class="authNote">После входа темы и ответы публикуются от аккаунта с DEV-префиксом, а также открывается admin tool.</p>
      </form>
    `;
    return;
  }

  dom.accountPanel.innerHTML = `
    <div class="accountCard">
      <div class="accountHeader">
        <div>
          <div class="inlineMeta">
            ${renderPrefixBadge(currentUser.prefix)}
            <span class="rolePill">Admin</span>
          </div>
          <h3>${escapeHtml(currentUser.login)}</h3>
          <p class="authNote">${escapeHtml(currentUser.roleLabel)} с правами модерации и управления темами.</p>
        </div>
        <button class="ghostButton" data-logout type="button">Выйти</button>
      </div>

      <div class="accountMeta">
        <span>Префикс: ${escapeHtml(currentUser.prefix)}</span>
        <span>Роль: ${escapeHtml(currentUser.role)}</span>
        <span>Сессия: серверная cookie-сессия</span>
      </div>
    </div>
  `;
}

function renderAdminPanel() {
  if (!isDeveloper()) {
    dom.adminPanel.classList.add("hidden");
    dom.adminPanel.innerHTML = "";
    return;
  }

  const topic = getActiveTopic();
  dom.adminPanel.classList.remove("hidden");
  const auditMarkup = renderLoginAudit();
  const topicMarkup = topic
    ? renderAdminTopicTools(topic)
    : `
      <div class="sectionTitle">Admin Tool</div>
      <h3>Панель разработчика</h3>
      <p class="helperText">Выберите тему, чтобы управлять закрепом, статусом и удалением обсуждения.</p>
      <div class="adminActions">
        <button class="ghostButton fullWidth" data-admin-action="focus-compose" type="button">Новая тема от DevBoggy</button>
      </div>
    `;

  dom.adminPanel.innerHTML = `
    ${topicMarkup}
    <div class="auditBlock">
      <div class="adminSummary">
          <div>
            <div class="sectionTitle">Журнал входов</div>
          <p class="helperText">Показывает серверный журнал входов и best-effort lookup IP, страны и города.</p>
          </div>
        <button class="ghostButton" data-admin-action="clear-login-log" type="button">Очистить журнал</button>
      </div>
      ${auditMarkup}
    </div>
  `;
}

function renderAdminTopicTools(topic) {
  const replyCount = Math.max(topic.posts.length - 1, 0);

  return `
    <div class="sectionTitle">Admin Tool</div>
    <h3>${escapeHtml(topic.title)}</h3>
    <p class="helperText">Инструменты разработчика для активной темы.</p>

    <div class="adminSummary">
      <div class="accountMeta">
        <span>${replyCount} ${pluralize(replyCount, ["ответ", "ответа", "ответов"])}</span>
        <span>${topic.views} просмотров</span>
      </div>
      <div class="inlineMeta">
        ${topic.pinned ? `<span class="rolePill">Pinned</span>` : ""}
        ${topic.solved ? `<span class="rolePill">Solved</span>` : ""}
      </div>
    </div>

    <div class="adminActions">
      <button class="ghostButton fullWidth" data-admin-action="toggle-pin" type="button">${topic.pinned ? "Снять закреп" : "Закрепить тему"}</button>
      <button class="ghostButton fullWidth" data-admin-action="toggle-solved" type="button">${topic.solved ? "Убрать статус решено" : "Отметить как решено"}</button>
      <button class="ghostButton fullWidth" data-admin-action="focus-compose" type="button">Новая тема от DevBoggy</button>
      <button class="ghostButton dangerButton fullWidth" data-admin-action="delete-topic" type="button">Удалить тему</button>
    </div>
  `;
}

function renderLoginAudit() {
  if (!loginAudit.length) {
    return `<div class="emptyState"><h3>Пока пусто</h3><p>Новые входы появятся здесь после авторизации.</p></div>`;
  }

  return `
    <div class="auditList">
      ${loginAudit
        .map(
          (entry, index) => `
            <article class="auditItem" style="--item-index:${index};">
              <div class="auditRow">
                <div class="authorNameRow">
                  <strong>${escapeHtml(entry.login)}</strong>
                  ${renderPrefixBadge(entry.prefix)}
                </div>
                <span class="boardMeta">${formatAbsoluteDate(entry.loggedAt)}</span>
              </div>
              <div class="auditMeta">
                <span>IP: ${escapeHtml(entry.ip)}</span>
                <span>Страна: ${escapeHtml(entry.country)}</span>
                <span>Город: ${escapeHtml(entry.city)}</span>
              </div>
              <div class="auditMeta">
                <span>Статус: ${escapeHtml(entry.status)}</span>
                <span>Источник: ${escapeHtml(entry.source)}</span>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderTopicSummary() {
  const allBoardTopics = getBoardTopics(uiState.activeBoardId);
  const visibleTopics = getVisibleTopics();
  const replies = countReplies(visibleTopics);
  const filters = [];

  if (uiState.search) {
    filters.push(`поиск: "${uiState.search}"`);
  }

  if (uiState.sort === "popular") {
    filters.push("сначала популярные");
  } else if (uiState.sort === "unanswered") {
    filters.push("только без ответа");
  }

  const filterText = filters.length ? ` Фильтр: ${filters.join(" · ")}.` : "";
  dom.topicSummary.textContent = `Показано ${visibleTopics.length} из ${allBoardTopics.length} тем, ${replies} ${pluralize(replies, ["ответ", "ответа", "ответов"])}.${filterText}`;
}

function renderTopicList() {
  const topics = getVisibleTopics();

  if (!topics.length) {
    dom.topicList.innerHTML = `
      <div class="emptyState">
        <h3>Ничего не найдено</h3>
        <p>Сбросьте фильтр или создайте новую тему прямо справа.</p>
        <button class="ghostButton" data-clear-filters type="button">Сбросить фильтры</button>
      </div>
    `;
    return;
  }

  dom.topicList.innerHTML = topics
    .map((topic, index) => {
      const board = getBoardById(topic.boardId);
      const firstPost = topic.posts[0];
      const tags = topic.tags.slice(0, 4);
      const replyCount = Math.max(topic.posts.length - 1, 0);
      const isActive = topic.id === uiState.activeTopicId;

      return `
        <button
          class="topicCard ${isActive ? "is-active" : ""}"
          data-topic-id="${topic.id}"
          style="--board-accent:${board?.accent || "#f4a261"}; --item-index:${index};"
          type="button"
        >
          <div class="topicCardHeader">
            <div class="badgeRow">
              ${topic.pinned ? `<span class="badge">Важно</span>` : ""}
              ${topic.solved ? `<span class="badge alt">Решено</span>` : ""}
              ${isUnanswered(topic) ? `<span class="tag">Без ответа</span>` : ""}
            </div>
            <div class="topicMeta">${formatRelativeTime(topic.updatedAt)}</div>
          </div>

          <h3>${escapeHtml(topic.title)}</h3>
          <p class="topicExcerpt">${escapeHtml(getExcerpt(firstPost.content, 148))}</p>

          <div class="tagRow">
            ${tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
          </div>

          <div class="topicFooter">
            <div class="authorChip">
              <span class="authorInitials">${escapeHtml(getInitials(firstPost.author))}</span>
              <div class="authorMeta">
                <div class="authorNameRow">
                  <strong>${escapeHtml(firstPost.author)}</strong>
                  ${renderPrefixBadge(firstPost.prefix)}
                </div>
                <div class="boardMeta">${escapeHtml(board?.name || "Раздел")}</div>
              </div>
            </div>

            <div class="metricRow">
              <span>${replyCount} ${pluralize(replyCount, ["ответ", "ответа", "ответов"])}</span>
              <span>${topic.views} просмотров</span>
              <span>${topic.likes} бустов</span>
            </div>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderThread() {
  const topic = getActiveTopic();

  if (!topic) {
    dom.threadView.innerHTML = `
      <div class="emptyState">
        <h3>Выберите тему</h3>
        <p>Откройте обсуждение слева или опубликуйте новую тему, чтобы заполнить форум живым контентом.</p>
      </div>
    `;
    return;
  }

  const board = getBoardById(topic.boardId);
  const firstPost = topic.posts[0];

  dom.threadView.innerHTML = `
    <div class="threadHero" style="--thread-accent:${board?.accent || "#f4a261"};">
      <div class="metaRow">
        <span>${escapeHtml(board?.name || "Раздел")}</span>
        <span>${formatAbsoluteDate(topic.createdAt)}</span>
      </div>
      <h2>${escapeHtml(topic.title)}</h2>
      <div class="authorChip">
        <span class="authorInitials">${escapeHtml(getInitials(firstPost.author))}</span>
        <div class="authorMeta">
          <div class="authorNameRow">
            <strong>${escapeHtml(firstPost.author)}</strong>
            ${renderPrefixBadge(firstPost.prefix)}
          </div>
          <div class="boardMeta">${escapeHtml(firstPost.role || "Автор темы")}</div>
        </div>
      </div>
      <p class="threadLead">${escapeHtml(getExcerpt(firstPost.content, 240))}</p>
      <div class="tagRow">
        ${topic.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("")}
        ${topic.pinned ? `<span class="badge">Важно</span>` : ""}
        ${topic.solved ? `<span class="badge alt">Решено</span>` : ""}
      </div>
      <div class="threadHeroActions">
        <button class="postAction" data-like-topic="${topic.id}" type="button">Поддержать тему · ${topic.likes}</button>
        <div class="metricRow">
          <span>${Math.max(topic.posts.length - 1, 0)} ответов</span>
          <span>${topic.views} просмотров</span>
        </div>
      </div>
    </div>

    <div class="postList">
      ${topic.posts.map((post, index) => renderPost(topic.id, post, index, board?.accent || "#f4a261")).join("")}
    </div>

    <form id="replyForm" class="replyForm">
      <div class="replyHeader">
        <div>
          <p class="eyebrow">Новый ответ</p>
          <h3>Подключиться к обсуждению</h3>
        </div>
        <div class="replyMeta">Последняя активность ${formatRelativeTime(topic.updatedAt)}</div>
      </div>

      <div class="stackedForm">
        ${renderReplyIdentityFields()}

        <label>
          <span>Сообщение</span>
          <textarea name="content" rows="5" placeholder="Напишите ответ, уточнение или решение"></textarea>
        </label>

        <div class="formActions">
          <button class="accentButton" type="submit">Отправить ответ</button>
        </div>

        <p class="statusText" id="replyStatus">${escapeHtml(uiState.replyStatus)}</p>
      </div>
    </form>
  `;
}

function renderActivity() {
  const items = forumState.topics
    .flatMap((topic) =>
      topic.posts.map((post, index) => ({
        topicId: topic.id,
        boardId: topic.boardId,
        title: topic.title,
        author: post.author,
        createdAt: post.createdAt,
        action: index === 0 ? "создал(а) тему" : "ответил(а)"
      }))
    )
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 6);

  if (!items.length) {
    dom.activityFeed.innerHTML = `
      <div class="emptyState">
        <h3>Активности еще нет</h3>
        <p>Как только кто-то создаст тему или ответ, события появятся здесь.</p>
      </div>
    `;
    return;
  }

  dom.activityFeed.innerHTML = items
    .map((item, index) => {
      const board = getBoardById(item.boardId);
      return `
        <button
          class="activityItem"
          data-topic-id="${item.topicId}"
          style="--item-index:${index};"
          type="button"
        >
          <div class="metaRow">${escapeHtml(board?.name || "Раздел")} · ${formatRelativeTime(item.createdAt)}</div>
          <h4>${escapeHtml(item.author)} ${item.action}</h4>
          <p>${escapeHtml(item.title)}</p>
        </button>
      `;
    })
    .join("");
}

function renderSortState() {
  const chips = Array.from(dom.chipRow.querySelectorAll(".chip"));
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.sort === uiState.sort);
  });
}

function renderBoardOptions() {
  const optionsHtml = forumState.boards
    .map((board) => `<option value="${board.id}">${escapeHtml(board.name)}</option>`)
    .join("");

  if (dom.topicBoardSelect.innerHTML !== optionsHtml) {
    dom.topicBoardSelect.innerHTML = optionsHtml;
  }
}

function renderPost(topicId, post, index, accent) {
  const isOpeningPost = index === 0;
  const role = post.role || (isOpeningPost ? "Автор темы" : "Участник");

  return `
    <article class="postCard" style="--thread-accent:${accent}; --item-index:${index};">
      <div class="postHeader">
        <div class="authorChip">
          <span class="profileBlob" style="--board-accent:${accent};">${escapeHtml(getInitials(post.author))}</span>
          <div class="authorMeta">
            <div class="authorNameRow">
              <h3>${escapeHtml(post.author)}</h3>
              ${renderPrefixBadge(post.prefix)}
            </div>
            <div class="postMeta">${escapeHtml(role)} · ${formatAbsoluteDate(post.createdAt)}</div>
          </div>
        </div>

        <div class="metricRow">${isOpeningPost ? "Старт обсуждения" : "Ответ"}</div>
      </div>

      <div class="postBody">${formatRichText(post.content)}</div>

      <div class="postActions">
        <button class="postAction" data-like-post="${post.id}" data-topic-id="${topicId}" type="button">Полезно · ${post.likes}</button>
        ${isDeveloper() && !isOpeningPost ? `<button class="postAction dangerButton" data-delete-post="${post.id}" data-topic-id="${topicId}" type="button">Удалить ответ</button>` : ""}
      </div>
    </article>
  `;
}

function handleBoardClick(event) {
  const button = event.target.closest("[data-board-id]");
  if (!button) {
    return;
  }

  uiState.activeBoardId = button.dataset.boardId;
  uiState.activeTopicId = getSortedTopics(getBoardTopics(uiState.activeBoardId), "latest")[0]?.id || "";
  uiState.search = "";
  uiState.sort = "latest";
  uiState.replyStatus = "";
  uiState.formStatus = "";
  dom.searchInput.value = "";
  syncComposerBoardSelection();
  render();
}

function handleTopicListClick(event) {
  const clearButton = event.target.closest("[data-clear-filters]");
  if (clearButton) {
    uiState.search = "";
    uiState.sort = "latest";
    dom.searchInput.value = "";
    render();
    return;
  }

  const topicButton = event.target.closest("[data-topic-id]");
  if (!topicButton) {
    return;
  }

  openTopic(topicButton.dataset.topicId, true);
}

function handleActivityClick(event) {
  const topicButton = event.target.closest("[data-topic-id]");
  if (!topicButton) {
    return;
  }

  openTopic(topicButton.dataset.topicId, true);
}

async function handleAccountClick(event) {
  const logoutButton = event.target.closest("[data-logout]");
  if (!logoutButton) {
    return;
  }

  try {
    const payload = await apiRequest("/logout", { method: "POST" });
    uiState.authStatus = "Вы вышли из аккаунта разработчика.";
    applyServerPayload(payload);
    syncComposerIdentity();
    render();
  } catch (error) {
    uiState.authStatus = error.message || "Не удалось завершить сессию.";
    renderAccountPanel();
  }
}

async function handleAccountSubmit(event) {
  if (event.target.id !== "loginForm") {
    return;
  }

  event.preventDefault();
  const formData = new FormData(event.target);
  const login = cleanText(formData.get("login"));
  const password = String(formData.get("password") || "").trim();

  try {
    const payload = await apiRequest("/login", {
      method: "POST",
      body: { login, password }
    });
    uiState.authStatus = `Вход выполнен: ${login}.`;
    applyServerPayload(payload);
    syncComposerIdentity();
    render();
  } catch (error) {
    uiState.authStatus = error.message || "Неверный логин или пароль.";
    renderAccountPanel();
  }
}

async function handleAdminClick(event) {
  const button = event.target.closest("[data-admin-action]");
  if (!button || !isDeveloper()) {
    return;
  }

  const topic = getActiveTopic();
  const action = button.dataset.adminAction;

  if (action === "focus-compose") {
    focusComposer();
    return;
  }

  if (action === "clear-login-log") {
    const confirmed = window.confirm("Очистить журнал входов?");
    if (!confirmed) {
      return;
    }
  }

  if (!topic && action !== "clear-login-log") {
    return;
  }

  try {
    let payload;

    if (action === "clear-login-log") {
      payload = await apiRequest("/admin/login-audit", { method: "DELETE" });
    } else if (action === "toggle-pin") {
      payload = await apiRequest(`/admin/topics/${topic.id}/toggle-pin`, { method: "POST" });
    } else if (action === "toggle-solved") {
      payload = await apiRequest(`/admin/topics/${topic.id}/toggle-solved`, { method: "POST" });
    } else if (action === "delete-topic") {
      const confirmed = window.confirm(`Удалить тему "${topic.title}"?`);
      if (!confirmed) {
        return;
      }
      payload = await apiRequest(`/admin/topics/${topic.id}`, { method: "DELETE" });
      uiState.activeTopicId = "";
    } else {
      return;
    }

    applyServerPayload(payload);
    render();
  } catch (error) {
    uiState.formStatus = error.message || "Не удалось выполнить admin action.";
    render();
  }
}

async function handleThreadClick(event) {
  const deletePostButton = event.target.closest("[data-delete-post]");
  if (deletePostButton && isDeveloper()) {
    const topic = getTopicById(deletePostButton.dataset.topicId);
    if (!topic) {
      return;
    }

    const post = topic.posts.find((entry) => entry.id === deletePostButton.dataset.deletePost);
    if (!post) {
      return;
    }

    const confirmed = window.confirm(`Удалить ответ пользователя ${post.author}?`);
    if (!confirmed) {
      return;
    }

    try {
      const payload = await apiRequest(`/admin/topics/${topic.id}/posts/${post.id}`, { method: "DELETE" });
      applyServerPayload(payload);
      render();
    } catch (error) {
      uiState.replyStatus = error.message || "Не удалось удалить ответ.";
      render();
    }
    return;
  }

  const topicLikeButton = event.target.closest("[data-like-topic]");
  if (topicLikeButton) {
    try {
      const payload = await apiRequest(`/topics/${topicLikeButton.dataset.likeTopic}/like`, { method: "POST" });
      applyServerPayload(payload);
      render();
    } catch (error) {
      uiState.replyStatus = error.message || "Не удалось обновить лайк темы.";
      render();
    }
    return;
  }

  const postLikeButton = event.target.closest("[data-like-post]");
  if (!postLikeButton) {
    return;
  }

  const topic = getTopicById(postLikeButton.dataset.topicId);
  const post = topic?.posts.find((entry) => entry.id === postLikeButton.dataset.likePost);

  if (!post) {
    return;
  }

  try {
    const payload = await apiRequest(`/topics/${topic.id}/posts/${post.id}/like`, { method: "POST" });
    applyServerPayload(payload);
    render();
  } catch (error) {
    uiState.replyStatus = error.message || "Не удалось обновить лайк сообщения.";
    render();
  }
}

async function handleThreadSubmit(event) {
  if (event.target.id !== "replyForm") {
    return;
  }

  event.preventDefault();
  const topic = getActiveTopic();

  if (!topic) {
    return;
  }

  const formData = new FormData(event.target);
  const content = cleanText(formData.get("content"));

  if (!content) {
    uiState.replyStatus = "Нужно написать хотя бы одно сообщение.";
    render();
    return;
  }

  try {
    const payload = await apiRequest(`/topics/${topic.id}/replies`, {
      method: "POST",
      body: {
        author: formData.get("author"),
        content
      }
    });
    applyServerPayload(payload);
    uiState.replyStatus = "Ответ добавлен.";
    render();
  } catch (error) {
    uiState.replyStatus = error.message || "Не удалось отправить ответ.";
    render();
    return;
  }

  requestAnimationFrame(() => {
    dom.threadView.scrollTop = dom.threadView.scrollHeight;
  });
}

function handleSearchInput(event) {
  uiState.search = cleanText(event.target.value);
  render();
}

function handleSortClick(event) {
  const chip = event.target.closest("[data-sort]");
  if (!chip) {
    return;
  }

  uiState.sort = chip.dataset.sort;
  render();
}

async function handleTopicSubmit(event) {
  event.preventDefault();

  const formData = new FormData(dom.topicForm);
  const boardId = cleanText(formData.get("board"));
  const title = cleanText(formData.get("title"));
  const content = cleanText(formData.get("content"));
  const tags = parseTags(formData.get("tags"));

  if (!title || !content) {
    uiState.formStatus = "Нужны заголовок и первое сообщение.";
    render();
    return;
  }

  try {
    const payload = await apiRequest("/topics", {
      method: "POST",
      body: {
        boardId,
        author: formData.get("author"),
        title,
        tags,
        content
      }
    });
    applyServerPayload(payload);
    uiState.activeBoardId = payload.activeBoardId || boardId;
    uiState.activeTopicId = payload.activeTopicId || "";
    uiState.search = "";
    uiState.sort = "latest";
    uiState.replyStatus = "";
    uiState.formStatus = `Тема "${title}" опубликована.`;

    dom.searchInput.value = "";
    dom.topicForm.reset();
    syncComposerBoardSelection();
    syncComposerIdentity();
    render();
  } catch (error) {
    uiState.formStatus = error.message || "Не удалось опубликовать тему.";
    render();
  }
}

function focusComposer(shouldScroll = true) {
  dom.topicBoardSelect.value = uiState.activeBoardId;
  dom.topicTitleInput.focus();

  if (shouldScroll) {
    dom.composePane.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function fillExample() {
  dom.topicBoardSelect.value = uiState.activeBoardId;
  dom.topicAuthorInput.value = dom.topicAuthorInput.value || "Alex";
  dom.topicTitleInput.value = "Идея: закрепить фильтры списка тем";
  dom.topicTagsInput.value = "ux, feedback, forum";
  dom.topicContentInput.value = "Предлагаю сделать строку поиска и сортировку липкими при скролле.\n\nТак список тем будет быстрее просматривать на длинных разделах, особенно на планшете.";
  uiState.formStatus = "Пример заполнен, можно публиковать или поправить под себя.";
  dom.formStatus.textContent = uiState.formStatus;
  dom.topicTitleInput.focus();
}

async function resetDemoData() {
  if (!isDeveloper()) {
    uiState.formStatus = "Сброс демо-данных доступен только разработчику.";
    render();
    return;
  }

  const confirmed = window.confirm("Сбросить серверные темы и вернуть демо-наполнение?");

  if (!confirmed) {
    return;
  }

  try {
    const payload = await apiRequest("/admin/reset-demo", { method: "POST" });
    applyServerPayload(payload);
    uiState.activeBoardId = forumState.boards[0]?.id || "";
    uiState.activeTopicId = getSortedTopics(getBoardTopics(uiState.activeBoardId), "latest")[0]?.id || "";
    uiState.search = "";
    uiState.sort = "latest";
    uiState.formStatus = "Серверные демо-данные восстановлены.";
    uiState.replyStatus = "";
    dom.searchInput.value = "";
    dom.topicForm.reset();
    syncComposerBoardSelection();
    syncComposerIdentity();
    render();
  } catch (error) {
    uiState.formStatus = error.message || "Не удалось сбросить демо-данные.";
    render();
  }
}

async function openTopic(topicId, bumpViews) {
  const topic = getTopicById(topicId);

  if (!topic) {
    return;
  }

  uiState.activeBoardId = topic.boardId;
  uiState.activeTopicId = topicId;
  uiState.replyStatus = "";

  if (bumpViews) {
    try {
      const payload = await apiRequest(`/topics/${topicId}/view`, { method: "POST" });
      applyServerPayload(payload);
    } catch (error) {
      uiState.replyStatus = error.message || "Не удалось обновить просмотры.";
    }
  }

  render();
}

function syncComposerBoardSelection() {
  dom.topicBoardSelect.value = uiState.activeBoardId;
}

function syncComposerIdentity() {
  if (!dom.topicAuthorInput) {
    return;
  }

  if (currentUser) {
    dom.topicAuthorInput.value = currentUser.login;
    dom.topicAuthorInput.readOnly = true;
    dom.topicAuthorInput.classList.add("lockedField");
    dom.topicAuthorInput.placeholder = `${currentUser.prefix} ${currentUser.login}`;
    return;
  }

  dom.topicAuthorInput.readOnly = false;
  dom.topicAuthorInput.classList.remove("lockedField");
  if (dom.topicAuthorInput.value === "DevBoggy") {
    dom.topicAuthorInput.value = "";
  }
  dom.topicAuthorInput.placeholder = "Ваше имя";
}

function syncPanelAccent() {
  const board = getActiveBoard();
  if (!board) {
    return;
  }

  dom.panels.forEach((panel) => {
    panel.style.setProperty("--thread-accent", board.accent);
  });
}

function ensureActiveTopic() {
  const visibleTopics = getVisibleTopics();
  if (visibleTopics.some((topic) => topic.id === uiState.activeTopicId)) {
    return;
  }

  uiState.activeTopicId = visibleTopics[0]?.id || "";
}

function getVisibleTopics() {
  const normalizedQuery = uiState.search.toLowerCase();
  let topics = getBoardTopics(uiState.activeBoardId);

  if (normalizedQuery) {
    topics = topics.filter((topic) => matchesQuery(topic, normalizedQuery));
  }

  if (uiState.sort === "unanswered") {
    topics = topics.filter(isUnanswered);
  }

  return getSortedTopics(topics, uiState.sort);
}

function getSortedTopics(topics, mode) {
  return [...topics].sort((left, right) => {
    const pinDelta = Number(right.pinned) - Number(left.pinned);
    if (pinDelta !== 0) {
      return pinDelta;
    }

    if (mode === "popular") {
      return getPopularityScore(right) - getPopularityScore(left);
    }

    return new Date(right.updatedAt) - new Date(left.updatedAt);
  });
}

function matchesQuery(topic, query) {
  const haystack = [
    topic.title,
    topic.tags.join(" "),
    ...topic.posts.map((post) => `${post.author} ${post.content}`)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function getPopularityScore(topic) {
  return topic.likes * 5 + topic.views * 0.18 + Math.max(topic.posts.length - 1, 0) * 7;
}

function countReplies(topics) {
  return topics.reduce((sum, topic) => sum + Math.max(topic.posts.length - 1, 0), 0);
}

function isUnanswered(topic) {
  return topic.posts.length <= 1;
}

function getBoardTopics(boardId) {
  return forumState.topics.filter((topic) => topic.boardId === boardId);
}

function getBoardById(boardId) {
  return forumState.boards.find((board) => board.id === boardId);
}

function getActiveBoard() {
  return getBoardById(uiState.activeBoardId);
}

function getTopicById(topicId) {
  return forumState.topics.find((topic) => topic.id === topicId);
}

function getActiveTopic() {
  return getTopicById(uiState.activeTopicId);
}

function renderLoadingState() {
  dom.topicList.innerHTML = `
    <div class="emptyState">
      <h3>Загрузка форума</h3>
      <p>Подключаемся к серверу и собираем актуальное состояние.</p>
    </div>
  `;
  dom.threadView.innerHTML = `
    <div class="emptyState">
      <h3>Подготовка тредов</h3>
      <p>Еще пару секунд, и можно будет работать с обсуждениями.</p>
    </div>
  `;
}

async function refreshFromServer() {
  const payload = await apiRequest("/bootstrap");
  applyServerPayload(payload);
}

function applyServerPayload(payload) {
  forumState = payload?.forum || { boards: [], topics: [] };
  currentUser = payload?.currentUser || null;
  loginAudit = Array.isArray(payload?.loginAudit) ? payload.loginAudit : [];

  if (!forumState.boards.some((board) => board.id === uiState.activeBoardId)) {
    uiState.activeBoardId = forumState.boards[0]?.id || "";
  }

  const boardTopics = getBoardTopics(uiState.activeBoardId);
  if (!boardTopics.some((topic) => topic.id === uiState.activeTopicId)) {
    uiState.activeTopicId = getSortedTopics(boardTopics, "latest")[0]?.id || "";
  }
}

async function apiRequest(path, options = {}) {
  const requestOptions = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin"
  };

  if (options.body !== undefined) {
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, requestOptions);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Ошибка запроса к серверу.");
  }

  return payload;
}

function syncResetVisibility() {
  dom.resetDemoBtn.classList.toggle("hidden", !isDeveloper());
}

function loadSession() {
  return null;
}

function loadLoginAudit() {
  return [];
}

function saveLoginAudit() {
  return undefined;
}

function saveSession() {
  return undefined;
}

function clearSession() {
  return undefined;
}

function isDeveloper() {
  return Boolean(currentUser?.isAdmin && currentUser?.role === "developer");
}

function renderReplyIdentityFields() {
  if (!currentUser) {
    return `
      <label>
        <span>Автор</span>
        <input name="author" type="text" maxlength="32" placeholder="Ваше имя">
      </label>
    `;
  }

  return `
    <div class="accountCard">
      <div class="inlineMeta">
        ${renderPrefixBadge(currentUser.prefix)}
        <span class="rolePill">${escapeHtml(currentUser.roleLabel)}</span>
      </div>
      <p><strong>${escapeHtml(currentUser.login)}</strong></p>
      <p class="helperText">Ответ будет опубликован от аккаунта разработчика.</p>
    </div>
  `;
}

function renderPrefixBadge(prefix) {
  return prefix ? `<span class="prefixBadge">${escapeHtml(prefix)}</span>` : "";
}

function loadForumState() {
  return {
    boards: [],
    topics: []
  };
}

function saveForumState() {
  return undefined;
}

function parseTags(input) {
  return String(input || "")
    .split(",")
    .map((tag) => cleanText(tag).replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 4);
}

function getExcerpt(text, maxLength) {
  const normalized = cleanText(text).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function formatRichText(text) {
  return cleanText(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function formatAbsoluteDate(isoString) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoString));
}

function formatRelativeTime(isoString) {
  const now = Date.now();
  const date = new Date(isoString).getTime();
  const diff = date - now;
  const absolute = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

  if (absolute < 60 * 1000) {
    return "только что";
  }

  if (absolute < 60 * 60 * 1000) {
    return formatter.format(Math.round(diff / (60 * 1000)), "minute");
  }

  if (absolute < 24 * 60 * 60 * 1000) {
    return formatter.format(Math.round(diff / (60 * 60 * 1000)), "hour");
  }

  return formatter.format(Math.round(diff / (24 * 60 * 60 * 1000)), "day");
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact" }).format(value);
}

function pluralize(value, forms) {
  const remainder10 = value % 10;
  const remainder100 = value % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return forms[0];
  }

  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return forms[1];
  }

  return forms[2];
}

function getInitials(name) {
  return cleanText(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
