const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const GEOLOOKUP_BASE = "https://api.ipwho.org/ip";

const STATIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" }
};

const ACCOUNTS = [
  {
    login: "DevBoggy",
    passwordHash: hashPassword("Qweasdyxc1643"),
    prefix: "DEV",
    role: "developer",
    roleLabel: "Разработчик",
    isAdmin: true
  }
];

const sessions = new Map();
let writeQueue = Promise.resolve();
let storeCache = null;

bootstrap()
  .then(() => {
    const server = http.createServer((request, response) => {
      handleRequest(request, response).catch((error) => {
        console.error("Unhandled request error:", error);
        sendJson(response, 500, { error: "Internal server error" });
      });
    });

    server.listen(PORT, HOST, () => {
      console.log(`NeoChat forum server listening on http://${HOST}:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to bootstrap server:", error);
    process.exitCode = 1;
  });

async function bootstrap() {
  await fsp.mkdir(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STORE_PATH)) {
    await writeStore(buildSeedStore());
    return;
  }

  const raw = await fsp.readFile(STORE_PATH, "utf8");
  storeCache = normalizeStore(JSON.parse(raw));
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);
  const sessionUser = await getSessionUser(request);
  const actorKey = buildActorKey(request, sessionUser);

  if (pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, pathname, sessionUser, actorKey);
    return;
  }

  if (STATIC_FILES[pathname]) {
    await serveStaticFile(response, STATIC_FILES[pathname]);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function handleApiRequest(request, response, pathname, sessionUser, actorKey) {
  if (request.method === "GET" && pathname === "/api/bootstrap") {
    const store = await readStore();
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  if (request.method === "POST" && pathname === "/api/login") {
    const body = await readJsonBody(request);
    const login = cleanText(body.login);
    const password = String(body.password || "").trim();
    const account = ACCOUNTS.find((item) => item.login === login && item.passwordHash === hashPassword(password));

    if (!account) {
      sendJson(response, 401, { error: "Неверный логин или пароль." });
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, {
      login: account.login,
      createdAt: new Date().toISOString()
    });

    const store = await readStore();
    const auditEntry = await buildLoginAuditEntry(request, account.login, account.prefix);
    store.loginAudit.unshift(auditEntry);
    store.loginAudit = store.loginAudit.slice(0, 50);
    await writeStore(store);

    response.setHeader("Set-Cookie", serializeCookie("sid", token, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      maxAge: 60 * 60 * 24 * 7
    }));
    sendJson(response, 200, buildClientPayload(store, toClientUser(account)));
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const cookies = parseCookies(request.headers.cookie || "");
    if (cookies.sid) {
      sessions.delete(cookies.sid);
    }

    response.setHeader("Set-Cookie", serializeCookie("sid", "", {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      maxAge: 0
    }));
    const store = await readStore();
    sendJson(response, 200, buildClientPayload(store, null));
    return;
  }

  if (request.method === "POST" && pathname === "/api/topics") {
    const body = await readJsonBody(request);
    const store = await readStore();
    const identity = resolveIdentity(sessionUser, body.author, "Автор темы");
    const title = cleanText(body.title);
    const content = cleanText(body.content);
    const boardId = cleanText(body.boardId);
    const tags = parseTags(body.tags);

    if (!title || !content || !store.boards.some((board) => board.id === boardId)) {
      sendJson(response, 400, { error: "Нужны корректные раздел, заголовок и сообщение." });
      return;
    }

    const now = new Date().toISOString();
    const topic = {
      id: createId("topic"),
      boardId,
      title,
      tags,
      pinned: false,
      solved: false,
        likes: 0,
        views: 1,
        createdAt: now,
        updatedAt: now,
        posts: [
          {
            id: createId("post"),
            author: identity.author,
            role: identity.role,
            prefix: identity.prefix,
            createdAt: now,
            likes: 0,
            content
          }
        ]
    };

    store.topics.unshift(topic);
    store.topicActors[topic.id] = {
      viewers: [actorKey],
      likers: []
    };
    store.postActors[topic.posts[0].id] = {
      likers: []
    };
    await writeStore(store);
    sendJson(response, 200, {
      ...buildClientPayload(store, sessionUser),
      activeBoardId: boardId,
      activeTopicId: topic.id
    });
    return;
  }

  const replyMatch = pathname.match(/^\/api\/topics\/([^/]+)\/replies$/);
  if (request.method === "POST" && replyMatch) {
    const topicId = replyMatch[1];
    const body = await readJsonBody(request);
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === topicId);

    if (!topic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    const content = cleanText(body.content);
    if (!content) {
      sendJson(response, 400, { error: "Нужно написать сообщение." });
      return;
    }

    const identity = resolveIdentity(sessionUser, body.author, "Участник");
    const now = new Date().toISOString();
    topic.posts.push({
      id: createId("post"),
      author: identity.author,
      role: identity.role,
      prefix: identity.prefix,
      createdAt: now,
      likes: 0,
      content
    });
    store.postActors[topic.posts[topic.posts.length - 1].id] = {
      likers: []
    };
    topic.updatedAt = now;

    await writeStore(store);
    sendJson(response, 200, {
      ...buildClientPayload(store, sessionUser),
      activeBoardId: topic.boardId,
      activeTopicId: topic.id
    });
    return;
  }

  const viewMatch = pathname.match(/^\/api\/topics\/([^/]+)\/view$/);
  if (request.method === "POST" && viewMatch) {
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === viewMatch[1]);

    if (!topic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    const actorState = ensureTopicActors(store, topic.id);
    if (!actorState.viewers.includes(actorKey)) {
      actorState.viewers.push(actorKey);
      topic.views = actorState.viewers.length;
    }
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  const topicLikeMatch = pathname.match(/^\/api\/topics\/([^/]+)\/like$/);
  if (request.method === "POST" && topicLikeMatch) {
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === topicLikeMatch[1]);

    if (!topic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    const actorState = ensureTopicActors(store, topic.id);
    if (!actorState.likers.includes(actorKey)) {
      actorState.likers.push(actorKey);
      topic.likes = actorState.likers.length;
    }
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  const postLikeMatch = pathname.match(/^\/api\/topics\/([^/]+)\/posts\/([^/]+)\/like$/);
  if (request.method === "POST" && postLikeMatch) {
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === postLikeMatch[1]);
    const post = topic?.posts.find((entry) => entry.id === postLikeMatch[2]);

    if (!post) {
      sendJson(response, 404, { error: "Сообщение не найдено." });
      return;
    }

    const actorState = ensurePostActors(store, post.id);
    if (!actorState.likers.includes(actorKey)) {
      actorState.likers.push(actorKey);
      post.likes = actorState.likers.length;
    }
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  if (!sessionUser?.isAdmin) {
    sendJson(response, 403, { error: "Admin access required." });
    return;
  }

  const adminPinMatch = pathname.match(/^\/api\/admin\/topics\/([^/]+)\/toggle-pin$/);
  if (request.method === "POST" && adminPinMatch) {
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === adminPinMatch[1]);

    if (!topic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    topic.pinned = !topic.pinned;
    topic.updatedAt = new Date().toISOString();
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  const adminSolvedMatch = pathname.match(/^\/api\/admin\/topics\/([^/]+)\/toggle-solved$/);
  if (request.method === "POST" && adminSolvedMatch) {
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === adminSolvedMatch[1]);

    if (!topic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    topic.solved = !topic.solved;
    topic.updatedAt = new Date().toISOString();
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  const adminDeleteTopicMatch = pathname.match(/^\/api\/admin\/topics\/([^/]+)$/);
  if (request.method === "DELETE" && adminDeleteTopicMatch) {
    const store = await readStore();
    const hadTopic = store.topics.some((entry) => entry.id === adminDeleteTopicMatch[1]);
    if (!hadTopic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    const removedTopic = store.topics.find((entry) => entry.id === adminDeleteTopicMatch[1]);
    delete store.topicActors[adminDeleteTopicMatch[1]];
    if (removedTopic?.posts) {
      removedTopic.posts.forEach((post) => {
        delete store.postActors[post.id];
      });
    }
    store.topics = store.topics.filter((entry) => entry.id !== adminDeleteTopicMatch[1]);
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  const adminDeletePostMatch = pathname.match(/^\/api\/admin\/topics\/([^/]+)\/posts\/([^/]+)$/);
  if (request.method === "DELETE" && adminDeletePostMatch) {
    const store = await readStore();
    const topic = store.topics.find((entry) => entry.id === adminDeletePostMatch[1]);

    if (!topic) {
      sendJson(response, 404, { error: "Тема не найдена." });
      return;
    }

    const postIndex = topic.posts.findIndex((entry) => entry.id === adminDeletePostMatch[2]);
    if (postIndex === -1) {
      sendJson(response, 404, { error: "Сообщение не найдено." });
      return;
    }

    if (postIndex === 0) {
      sendJson(response, 400, { error: "Стартовый пост нельзя удалить отдельно от темы." });
      return;
    }

    delete store.postActors[topic.posts[postIndex].id];
    topic.posts.splice(postIndex, 1);
    topic.updatedAt = new Date().toISOString();
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  if (request.method === "DELETE" && pathname === "/api/admin/login-audit") {
    const store = await readStore();
    store.loginAudit = [];
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  if (request.method === "POST" && pathname === "/api/admin/reset-demo") {
    const store = buildSeedStore();
    await writeStore(store);
    sendJson(response, 200, buildClientPayload(store, sessionUser));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const session = cookies.sid ? sessions.get(cookies.sid) : null;

  if (!session) {
    return null;
  }

  const account = ACCOUNTS.find((item) => item.login === session.login);
  return account ? toClientUser(account) : null;
}

async function readStore() {
  if (!storeCache) {
    const raw = await fsp.readFile(STORE_PATH, "utf8");
    storeCache = normalizeStore(JSON.parse(raw));
  }

  const parsed = cloneStore(storeCache);

  if (!Array.isArray(parsed.boards) || !Array.isArray(parsed.topics) || !Array.isArray(parsed.loginAudit)) {
    throw new Error("Store format is invalid.");
  }

  return parsed;
}

async function writeStore(store) {
  storeCache = normalizeStore(store);
  const payload = JSON.stringify(storeCache, null, 2);
  writeQueue = writeQueue.then(() => fsp.writeFile(STORE_PATH, payload, "utf8"));
  return writeQueue;
}

async function serveStaticFile(response, fileInfo) {
  const filePath = path.join(ROOT, fileInfo.file);
  const content = await fsp.readFile(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", fileInfo.type);
  response.setHeader("Cache-Control", "no-store");
  response.end(content);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    return {};
  }
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((accumulator, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) {
      return accumulator;
    }

    accumulator[key] = decodeURIComponent(rest.join("=") || "");
    return accumulator;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join("; ");
}

function buildClientPayload(store, sessionUser) {
  return {
    forum: {
      boards: store.boards,
      topics: store.topics.map((topic) => sanitizeTopic(topic, store))
    },
    currentUser: sessionUser,
    loginAudit: sessionUser?.isAdmin ? store.loginAudit : [],
    serverTime: new Date().toISOString()
  };
}

function sanitizeTopic(topic, store) {
  const topicActors = ensureTopicActors(store, topic.id);
  return {
    ...topic,
    views: topicActors.viewers.length,
    likes: topicActors.likers.length,
    posts: topic.posts.map((post) => ({
      ...post,
      likes: ensurePostActors(store, post.id).likers.length
    }))
  };
}

function normalizeStore(store) {
  return {
    boards: Array.isArray(store?.boards) ? store.boards : [],
    topics: Array.isArray(store?.topics)
      ? store.topics.map((topic) => ({
          ...topic,
          likes: Number(topic?.likes || 0),
          views: Number(topic?.views || 0),
          posts: Array.isArray(topic?.posts)
            ? topic.posts.map((post) => ({
                ...post,
                likes: Number(post?.likes || 0)
              }))
            : []
        }))
      : [],
    loginAudit: Array.isArray(store?.loginAudit) ? store.loginAudit : [],
    topicActors: normalizeActorMap(store?.topicActors),
    postActors: normalizeActorMap(store?.postActors)
  };
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

function normalizeActorMap(actorMap) {
  const entries = Object.entries(actorMap || {});
  return entries.reduce((accumulator, [key, value]) => {
    accumulator[key] = {
      viewers: Array.isArray(value?.viewers) ? value.viewers : [],
      likers: Array.isArray(value?.likers) ? value.likers : []
    };
    return accumulator;
  }, {});
}

function ensureTopicActors(store, topicId) {
  if (!store.topicActors[topicId]) {
    store.topicActors[topicId] = {
      viewers: [],
      likers: []
    };
  }

  return store.topicActors[topicId];
}

function ensurePostActors(store, postId) {
  if (!store.postActors[postId]) {
    store.postActors[postId] = {
      likers: []
    };
  }

  return store.postActors[postId];
}

async function buildLoginAuditEntry(request, login, prefix) {
  const ip = getRequestIp(request);
  const geo = await fetchGeoSnapshot(ip);

  return {
    id: createId("login"),
    login,
    prefix,
    loggedAt: new Date().toISOString(),
    ip: geo.ip,
    country: geo.country,
    city: geo.city,
    status: geo.status,
    source: geo.source
  };
}

async function fetchGeoSnapshot(ip) {
  if (!ip || ip === "127.0.0.1" || ip === "::1") {
    return {
      ip: ip || "Недоступно",
      country: "Локальный вход",
      city: "Локальный вход",
      status: "local client",
      source: "server socket"
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    if (typeof fetch !== "function") {
      throw new Error("Fetch API is unavailable in this Node runtime.");
    }

    const response = await fetch(`${GEOLOOKUP_BASE}/${encodeURIComponent(ip)}?get=ip,country,city`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      ip: cleanText(data.ip) || ip,
      country: cleanText(data.country) || "Недоступно",
      city: cleanText(data.city) || "Недоступно",
      status: "success",
      source: "ipwho.org"
    };
  } catch (error) {
    return {
      ip: ip,
      country: "Недоступно",
      city: "Недоступно",
      status: error?.name === "AbortError" ? "lookup timeout" : "lookup unavailable",
      source: "ipwho.org"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function getRequestIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || request.socket.remoteAddress || "");
  const ip = rawIp.split(",")[0].trim();
  return ip.replace(/^::ffff:/, "");
}

function buildActorKey(request, sessionUser) {
  if (sessionUser?.login) {
    return `user:${sessionUser.login}`;
  }

  const ip = getRequestIp(request) || "unknown-ip";
  const userAgent = String(request.headers["user-agent"] || "unknown-agent").slice(0, 180);
  return `guest:${ip}:${userAgent}`;
}

function resolveIdentity(sessionUser, authorInput, fallbackRole) {
  if (sessionUser) {
    return {
      author: sessionUser.login,
      role: sessionUser.roleLabel,
      prefix: sessionUser.prefix
    };
  }

  return {
    author: cleanText(authorInput) || "Вы",
    role: fallbackRole,
    prefix: ""
  };
}

function toClientUser(account) {
  return {
    login: account.login,
    prefix: account.prefix,
    role: account.role,
    roleLabel: account.roleLabel,
    isAdmin: account.isAdmin
  };
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function buildSeedStore() {
  return {
    boards: [
      {
        id: "announcements",
        icon: "A",
        name: "Анонсы",
        description: "Релизы, дорожная карта и ключевые объявления.",
        accent: "#f4a261"
      },
      {
        id: "product",
        icon: "P",
        name: "Продукт",
        description: "Идеи, UX, спорные решения и быстрый фидбек.",
        accent: "#2a9d8f"
      },
      {
        id: "dev",
        icon: "D",
        name: "Разработка",
        description: "Технические детали, качество интерфейса и архитектура.",
        accent: "#84a98c"
      },
      {
        id: "lounge",
        icon: "L",
        name: "Лаунж",
        description: "Шоукейсы, вдохновение и неформальные темы сообщества.",
        accent: "#e76f51"
      }
    ],
    topics: [],
    loginAudit: [],
    topicActors: {},
    postActors: {}
  };
}

function parseTags(input) {
  return String(input || "")
    .split(",")
    .map((tag) => cleanText(tag).replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 4);
}

function cleanText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
