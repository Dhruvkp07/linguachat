/* ═══════════════════════════════════════════════════════════════════════════
   LinguaChat v2 — app.js
   All features: theming, delete, reply, profiles, read receipts,
   multi-file/audio, settings, text correction, optimistic rendering
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = "https://rimitxgeaelssuzmkdvh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SbX-JYUsjCOhA1Z2bwBUGg_EthUuWmI";

const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["es", "Spanish"], ["fr", "French"], ["de", "German"],
  ["it", "Italian"], ["pt", "Portuguese"], ["bn", "Bengali"], ["gu", "Gujarati"], ["mr", "Marathi"],
  ["ta", "Tamil"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"], ["pa", "Punjabi"],
  ["ur", "Urdu"], ["ar", "Arabic"], ["fa", "Persian"], ["ja", "Japanese"], ["ko", "Korean"],
  ["zh", "Chinese"], ["ru", "Russian"], ["tr", "Turkish"], ["nl", "Dutch"], ["pl", "Polish"]
];

const MEDIA_BUCKET = "chat-media";
const PROFILE_BUCKET = "profile-photos";
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const CORRECTION_DEBOUNCE_MS = 1000;

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇",
  "🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚",
  "😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩",
  "🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣",
  "😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬",
  "🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗",
  "🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯",
  "😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐",
  "👋","🤚","🖐️","✋","🖖","👌","🤏","✌️","🤞","🤟",
  "🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊",
  "👊","🤛","🤜","👏","🙌","👐","🤲","🙏","💪","🫶",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
  "❣️","💕","💞","💓","💗","💖","💘","💝","💟","❤️‍🔥",
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
  "🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧",
  "🍎","🍊","🍋","🍉","🍇","🍓","🍒","🍑","🥭","🍍",
  "🍌","🥝","🍅","🥑","🌽","🥕","🍔","🍕","🌭","🍟",
  "🔥","✨","⭐","🌟","💫","⚡","💯","✅","❌","❗",
  "🎉","🎊","🥳","🎆","🎇","🎁","🎈","🏆","👀","💀"
];

/* ── State ─────────────────────────────────────────────────────────────── */
const state = {
  supabase: null,
  user: null,
  profile: null,
  conversations: [],
  activeConversation: null,
  activeFriend: null,
  realtimeChannel: null,
  profilesCache: new Map(),
  usernameCheckToken: 0,
  // New v2 state
  replyingTo: null,
  selectMode: false,
  selectedMessages: new Set(),
  correctionTimer: null,
  lastCorrectionText: "",
  currentMessages: [],
  pendingSetupPhoto: null
};

/* ── Helpers ───────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const languageName = (code) => LANGUAGES.find(([id]) => id === code)?.[1] || code || "Unknown";
const initials = (name, email = "") => ((name || email || "?").trim().split(/\s+/).map(x => x[0]).join("").slice(0,2) || "?").toUpperCase();
const friendlyError = (err) => err?.message || err?.error_description || "Something went wrong.";
const displayHandle = (p) => p?.username ? `@${p.username}` : (p?.full_name || p?.email || "Unknown user");

/* ── Theme ─────────────────────────────────────────────────────────────── */
function loadTheme() {
  const theme = localStorage.getItem("lc-theme") || "light";
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = $("theme-toggle");
  if (toggle) toggle.classList.toggle("active", theme === "dark");
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("lc-theme", next);
  const toggle = $("theme-toggle");
  if (toggle) toggle.classList.toggle("active", next === "dark");
}

/* ── Avatar HTML helper ────────────────────────────────────────────────── */
function avatarHtml(profile, size = 42) {
  const photoUrl = profile?.profile_photo_url || profile?.avatar_url;
  if (photoUrl) {
    return `<img src="${escapeHtml(photoUrl)}" alt="avatar" />`;
  }
  return escapeHtml(initials(profile?.full_name, profile?.email));
}

/* ── Views ─────────────────────────────────────────────────────────────── */
function show(viewId) {
  ["auth-view", "setup-view", "chat-view"].forEach(id => $(id).classList.toggle("hidden", id !== viewId));
}

function populateLanguages(selectId = "language-select") {
  const sel = $(selectId);
  if (sel) sel.innerHTML = LANGUAGES.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
}

/* ── Init ──────────────────────────────────────────────────────────────── */
async function init() {
  loadTheme();
  populateLanguages("language-select");
  populateLanguages("settings-language");

  if (SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")) {
    $("auth-error").textContent = "Open app.js and add your Supabase URL and publishable key first.";
    $("auth-error").classList.remove("hidden");
    return;
  }

  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  try {
    const { data } = await state.supabase.auth.getSession();
    if (data.session) await handleSession(data.session);
    else show("auth-view");
  } catch (err) {
    console.error("Init session error:", err);
    show("auth-view");
  }

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    try {
      if (session) await handleSession(session);
      else { state.user = null; state.profile = null; show("auth-view"); }
    } catch (err) {
      console.error("Auth state change error:", err);
      show("auth-view");
    }
  });

  wireEvents();
}

/* ── Session ───────────────────────────────────────────────────────────── */
async function handleSession(session) {
  state.user = session.user;
  try {
    const profile = await loadMyProfile();
    if (!profile || !profile.username) {
      const displayName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User";
      $("language-select").value = profile?.language || "en";
      $("setup-view").dataset.defaultName = displayName;
      $("username-input").value = profile?.username || "";
      updateSetupPhotoPreview(profile);
      await suggestUsername(displayName, session.user.email);
      show("setup-view");
      return;
    }
    state.profile = profile;
    $("my-language-label").textContent = `${languageName(profile.language)} · @${profile.username}`;
    show("chat-view");
    await loadConversations();
  } catch (err) {
    console.error("handleSession error:", err);
    $("auth-error").textContent = friendlyError(err);
    $("auth-error").classList.remove("hidden");
    show("auth-view");
  }
}

async function loadMyProfile() {
  const { data, error } = await state.supabase.from("profiles")
    .select("*")
    .eq("id", state.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

function updateSetupPhotoPreview(profile) {
  const el = $("setup-photo-preview");
  const photoUrl = profile?.profile_photo_url || profile?.avatar_url;
  if (photoUrl) el.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="avatar" />`;
  else el.textContent = initials(profile?.full_name, profile?.email);
}

/* ── Username ──────────────────────────────────────────────────────────── */
function slugifyUsername(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
}

async function suggestUsername(name, email) {
  let base = slugifyUsername(name) || slugifyUsername(email?.split("@")[0]) || "user";
  if (base.length < 3) base = (base + "user").slice(0, 3);
  let candidate = base;
  for (let i = 0; i < 6; i++) {
    const taken = await usernameTaken(candidate);
    if (!taken) { $("username-input").value = candidate; return; }
    candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 20);
  }
  $("username-input").value = candidate;
}

async function usernameTaken(username) {
  if (!username) return false;
  const { data, error } = await state.supabase.from("profiles").select("id").ilike("username", username).maybeSingle();
  if (error) throw error;
  return !!(data && data.id !== state.user?.id);
}

function validateUsernameFormat(username) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return "Username must be 3-20 characters: letters, numbers, underscores only.";
  return null;
}

async function onUsernameInput() {
  const raw = $("username-input").value;
  const username = slugifyUsername(raw);
  if (raw !== username) $("username-input").value = username;
  const status = $("username-status");
  const formatError = validateUsernameFormat(username);
  if (formatError) { status.textContent = formatError; status.className = "tiny error-text"; return; }
  const token = ++state.usernameCheckToken;
  status.textContent = "Checking availability...";
  status.className = "tiny muted";
  try {
    const taken = await usernameTaken(username);
    if (token !== state.usernameCheckToken) return;
    if (taken) { status.textContent = "That username is already taken."; status.className = "tiny error-text"; }
    else { status.textContent = "Username is available."; status.className = "tiny success-text"; }
  } catch (err) {
    if (token !== state.usernameCheckToken) return;
    status.textContent = friendlyError(err); status.className = "tiny error-text";
  }
}

/* ── Profile Photo Upload ──────────────────────────────────────────────── */
async function uploadProfilePhoto(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Please select an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${state.user.id}/${Date.now()}.${ext}`;
  const { error } = await state.supabase.storage.from(PROFILE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data: pub } = state.supabase.storage.from(PROFILE_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

/* ── Save Profile (setup) ──────────────────────────────────────────────── */
async function saveProfile() {
  const language = $("language-select").value;
  const username = slugifyUsername($("username-input").value);
  const name = $("setup-view").dataset.defaultName || state.user.email?.split("@")[0] || "User";
  const formatError = validateUsernameFormat(username);
  $("setup-error").classList.add("hidden");
  if (formatError) {
    $("setup-error").textContent = formatError;
    $("setup-error").classList.remove("hidden");
    return;
  }
  $("save-profile").disabled = true;
  try {
    let profilePhotoUrl = null;
    if (state.pendingSetupPhoto) {
      profilePhotoUrl = await uploadProfilePhoto(state.pendingSetupPhoto);
      state.pendingSetupPhoto = null;
    }
    const upsertData = {
      id: state.user.id,
      email: state.user.email.toLowerCase(),
      username,
      full_name: name,
      avatar_url: state.user.user_metadata?.avatar_url || null,
      language
    };
    if (profilePhotoUrl) upsertData.profile_photo_url = profilePhotoUrl;
    const { data, error } = await state.supabase.from("profiles").upsert(upsertData).select().single();
    if (error) {
      if (error.code === "23505") throw new Error("That username was just taken — try another.");
      throw error;
    }
    state.profile = data;
    await handleSession({ user: state.user });
  } catch (err) {
    $("setup-error").textContent = friendlyError(err);
    $("setup-error").classList.remove("hidden");
  } finally {
    $("save-profile").disabled = false;
  }
}

/* ── Auth ──────────────────────────────────────────────────────────────── */
async function signIn() {
  const { error } = await state.supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href.split("#")[0] }
  });
  if (error) {
    $("auth-error").textContent = friendlyError(error);
    $("auth-error").classList.remove("hidden");
  }
}

async function signOut() {
  if (state.realtimeChannel) await state.supabase.removeChannel(state.realtimeChannel);
  await state.supabase.auth.signOut();
}

/* ── Find profiles ─────────────────────────────────────────────────────── */
async function findProfileByEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (normalized === state.user.email.toLowerCase()) throw new Error("You cannot start a chat with yourself.");
  const cacheKey = `e:${normalized}`;
  const cached = state.profilesCache.get(cacheKey);
  if (cached) return cached;
  const { data, error } = await state.supabase.from("profiles").select("*").eq("email", normalized).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No LinguaChat account was found for that email.");
  cacheProfile(data);
  return data;
}

async function findProfileByUsername(username) {
  const normalized = username.replace(/^@/, "").trim().toLowerCase();
  if (normalized === state.profile.username?.toLowerCase()) throw new Error("You cannot start a chat with yourself.");
  const cacheKey = `u:${normalized}`;
  const cached = state.profilesCache.get(cacheKey);
  if (cached) return cached;
  const { data, error } = await state.supabase.from("profiles").select("*").ilike("username", normalized).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No LinguaChat account was found for that username.");
  cacheProfile(data);
  return data;
}

function cacheProfile(p) {
  state.profilesCache.set(`e:${p.email.toLowerCase()}`, p);
  if (p.username) state.profilesCache.set(`u:${p.username.toLowerCase()}`, p);
}

async function findFriend(rawHandle) {
  const value = rawHandle.trim();
  if (!value) throw new Error("Enter a username or email to start chatting.");
  return /\S+@\S+\.\S+/.test(value) ? findProfileByEmail(value) : findProfileByUsername(value);
}

/* ── Start chat ────────────────────────────────────────────────────────── */
async function startChat() {
  const btn = $("start-chat");
  btn.disabled = true;
  $("friend-result").textContent = "Searching...";
  try {
    const friend = await findFriend($("friend-handle").value);

    // Check if a conversation with this friend already exists
    const existing = state.conversations.find(c => c.friend?.id === friend.id);
    if (existing) {
      $("friend-handle").value = "";
      $("friend-result").textContent = `Opened existing chat with ${displayHandle(friend)}`;
      await openConversation(existing);
      return;
    }

    const { data: conversation, error: convError } = await state.supabase.from("conversations").insert({ created_by: state.user.id }).select().single();
    if (convError) {
      if (convError.code === "23505") throw new Error("A chat with this person may already exist. Refresh the conversation list.");
      throw convError;
    }
    const { error: memberError } = await state.supabase.from("conversation_members").insert([
      { conversation_id: conversation.id, user_id: state.user.id },
      { conversation_id: conversation.id, user_id: friend.id }
    ]);
    if (memberError) throw memberError;
    $("friend-handle").value = "";
    $("friend-result").textContent = `${displayHandle(friend)} · ${languageName(friend.language)}`;
    await loadConversations();
    const created = state.conversations.find(c => c.id === conversation.id);
    if (created) await openConversation(created);
  } catch (err) {
    $("friend-result").textContent = friendlyError(err);
  } finally {
    btn.disabled = false;
  }
}

/* ── Conversations ─────────────────────────────────────────────────────── */
async function loadConversations() {
  try {
    const { data: memberships, error: memError } = await state.supabase.from("conversation_members").select("conversation_id").eq("user_id", state.user.id);
    if (memError) throw memError;
    const ids = memberships.map(x => x.conversation_id);
    if (!ids.length) {
      state.conversations = [];
      renderConversationList();
      return;
    }
    const { data: conversations, error: convError } = await state.supabase.from("conversations").select("id,created_at,updated_at").in("id", ids).order("updated_at", { ascending: false });
    if (convError) throw convError;
    const { data: members, error: membersError } = await state.supabase.from("conversation_members").select("conversation_id,user_id").in("conversation_id", ids);
    if (membersError) throw membersError;
    const friendIds = [...new Set(members.map(x => x.user_id).filter(id => id !== state.user.id))];
    const profiles = friendIds.length ? (await state.supabase.from("profiles").select("*").in("id", friendIds)).data : [];
    profiles?.forEach(p => cacheProfile(p));
    const profileById = new Map((profiles || []).map(p => [p.id, p]));

    // Batch-fetch last messages for all conversations at once
    const lastMsgPromises = (conversations || []).map(c =>
      state.supabase.from("messages")
        .select("message_type,original_text,translated_text,media_url,created_at,sender_id,conversation_id")
        .eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    );
    const lastMsgResults = await Promise.all(lastMsgPromises);
    const lastMsgByConv = new Map();
    lastMsgResults.forEach(r => {
      if (r.data) lastMsgByConv.set(r.data.conversation_id, r.data);
    });

    const result = [];
    for (const c of (conversations || [])) {
      const friendMember = members.find(m => m.conversation_id === c.id && m.user_id !== state.user.id);
      const friend = friendMember ? profileById.get(friendMember.user_id) : null;
      const lastMessage = lastMsgByConv.get(c.id) || null;
      result.push({ ...c, friend, lastMessage });
    }
    state.conversations = result;
    renderConversationList();
  } catch (err) {
    console.error("Failed to load conversations:", err);
  }
}

function previewFor(lastMessage) {
  if (!lastMessage) return "No messages yet";
  const mine = lastMessage.sender_id === state.user.id;
  const caption = mine ? lastMessage.original_text : lastMessage.translated_text;
  if (lastMessage.message_type === "image") return caption ? `📷 ${caption}` : "📷 Photo";
  if (lastMessage.message_type === "video") return caption ? `🎥 ${caption}` : "🎥 Video";
  if (lastMessage.message_type === "audio") return "🎵 Audio";
  return caption || "";
}

function renderConversationList() {
  if (!state.conversations.length) {
    $("conversation-list").innerHTML = `<div class="tiny muted" style="padding:14px 16px">No conversations yet.</div>`;
    return;
  }
  $("conversation-list").innerHTML = state.conversations.map(c => {
    const f = c.friend || { full_name: "Unknown user", email: "", language: "en" };
    return `<button class="conversation-item ${state.activeConversation?.id === c.id ? "active" : ""}" data-conversation-id="${c.id}">
      <div class="avatar">${avatarHtml(f)}</div>
      <div class="conversation-main">
        <strong>${escapeHtml(displayHandle(f))}</strong>
        <div class="preview tiny muted">${escapeHtml(previewFor(c.lastMessage))}</div>
      </div>
    </button>`;
  }).join("");
  document.querySelectorAll(".conversation-item").forEach(btn => btn.addEventListener("click", () => {
    const c = state.conversations.find(x => x.id === btn.dataset.conversationId);
    if (c) openConversation(c);
  }));
}

/* ── Open conversation ─────────────────────────────────────────────────── */
async function openConversation(conversation) {
  state.activeConversation = conversation;
  state.activeFriend = conversation.friend;
  exitSelectMode();
  cancelReply();
  $("empty-chat").classList.add("hidden");
  $("active-chat").classList.remove("hidden");
  $("chat-title").textContent = displayHandle(conversation.friend);
  $("chat-subtitle").textContent = `${languageName(conversation.friend?.language)} · you write in ${languageName(state.profile.language)}`;
  // Avatar in chat head
  const headAvatar = $("chat-head-avatar");
  headAvatar.innerHTML = avatarHtml(conversation.friend, 36);
  renderConversationList();
  try {
    await loadMessages();
    subscribeToMessages();
    await markMessagesAsRead();
  } catch (err) {
    console.error("openConversation error:", err);
    $("send-status").textContent = friendlyError(err);
  }
}

/* ── Messages ──────────────────────────────────────────────────────────── */
async function loadMessages() {
  if (!state.activeConversation) return;
  const { data, error } = await state.supabase.from("messages")
    .select("*")
    .eq("conversation_id", state.activeConversation.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  state.currentMessages = data || [];
  renderMessages(state.currentMessages);
}

function renderMessages(messages) {
  const msgMap = new Map(messages.map(m => [m.id, m]));
  $("message-list").innerHTML = messages.map(m => {
    const mine = m.sender_id === state.user.id;
    const visibleText = mine ? m.original_text : (m.translated_text || m.original_text);
    const translated = !mine && m.translated_text && m.original_text && m.original_text !== m.translated_text;
    const note = translated ? `Translated to ${languageName(state.profile.language)}` : "";

    // Media
    let mediaHtml = "";
    if (m.media_url) {
      if (m.message_type === "video") mediaHtml = `<video class="bubble-media" src="${escapeHtml(m.media_url)}" controls playsinline></video>`;
      else if (m.message_type === "audio") mediaHtml = `<audio class="bubble-audio" src="${escapeHtml(m.media_url)}" controls></audio>`;
      else mediaHtml = `<img class="bubble-media" src="${escapeHtml(m.media_url)}" alt="Shared photo" loading="lazy" />`;
    }

    // Reply quote
    let replyHtml = "";
    if (m.reply_to_id) {
      const parent = msgMap.get(m.reply_to_id);
      if (parent) {
        const parentText = mine ? (parent.original_text || parent.translated_text) : (parent.translated_text || parent.original_text);
        const snippet = (parentText || "Media").slice(0, 80);
        replyHtml = `<div class="reply-quote" data-jump-to="${m.reply_to_id}">${escapeHtml(snippet)}</div>`;
      }
    }

    const textHtml = visibleText ? `<div class="bubble-text">${escapeHtml(visibleText)}</div>` : "";
    const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Seen
    const seenHtml = (mine && m.read_at) ? `<div class="seen-label">Seen</div>` : "";
    // Optimistic
    const sendingHtml = m._optimistic ? `<div class="sending-label">Sending...</div>` : "";

    // Select mode
    const selectableClass = state.selectMode ? "selectable" : "";
    const selectedClass = state.selectedMessages.has(m.id) ? "selected" : "";
    const checkHtml = state.selectMode ? `<div class="select-check">${state.selectedMessages.has(m.id) ? "✓" : ""}</div>` : "";

    // Action buttons (only when not in select mode)
    const actionsHtml = !state.selectMode ? `<div class="bubble-actions">
      <button class="bubble-action-btn reply-action" data-msg-id="${m.id}" title="Reply">↩</button>
      ${mine ? `<button class="bubble-action-btn delete-action" data-msg-id="${m.id}" title="Delete">🗑</button>` : ""}
    </div>` : "";

    return `<div class="message-row ${mine ? "mine" : ""} ${selectableClass} ${selectedClass}" data-msg-id="${m.id}">
      ${checkHtml}
      <div class="bubble">
        ${actionsHtml}
        ${replyHtml}
        ${mediaHtml}
        ${textHtml}
        ${note ? `<div class="translation-note">${escapeHtml(note)}</div>` : ""}
        ${translated ? `<button class="original-toggle" data-original-id="${m.id}">Show original</button><div class="original-text hidden" id="original-${m.id}">${escapeHtml(m.original_text)}</div>` : ""}
        <div class="translation-note">${time}</div>
        ${seenHtml}
        ${sendingHtml}
      </div>
    </div>`;
  }).join("");

  // Wire events
  document.querySelectorAll(".original-toggle").forEach(btn => btn.addEventListener("click", () => {
    const el = $("original-" + btn.dataset.originalId);
    el.classList.toggle("hidden");
    btn.textContent = el.classList.contains("hidden") ? "Show original" : "Hide original";
  }));

  document.querySelectorAll(".reply-action").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const msg = messages.find(m => m.id === btn.dataset.msgId);
    if (msg) startReply(msg);
  }));

  document.querySelectorAll(".delete-action").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteMessages([btn.dataset.msgId]);
  }));

  document.querySelectorAll(".reply-quote[data-jump-to]").forEach(el => el.addEventListener("click", () => {
    const target = document.querySelector(`.message-row[data-msg-id="${el.dataset.jumpTo}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }));

  // Select mode click
  if (state.selectMode) {
    document.querySelectorAll(".message-row.selectable").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.msgId;
        const msg = messages.find(m => m.id === id);
        if (msg && msg.sender_id !== state.user.id) return; // Can only select own messages
        if (state.selectedMessages.has(id)) state.selectedMessages.delete(id);
        else state.selectedMessages.add(id);
        renderMessages(messages);
        updateSelectCount();
      });
    });
  }

  // Context menu on right-click
  document.querySelectorAll(".message-row").forEach(row => {
    row.addEventListener("contextmenu", (e) => {
      if (state.selectMode) return;
      e.preventDefault();
      const id = row.dataset.msgId;
      const msg = messages.find(m => m.id === id);
      if (!msg) return;
      showContextMenu(e.clientX, e.clientY, msg);
    });
  });

  // Smooth scroll to bottom
  const box = $("message-list");
  box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
}

/* ── Context Menu ──────────────────────────────────────────────────────── */
let contextMenuMsg = null;
function showContextMenu(x, y, msg) {
  contextMenuMsg = msg;
  const menu = $("context-menu");
  const mine = msg.sender_id === state.user.id;
  $("ctx-delete").classList.toggle("hidden", !mine);
  menu.classList.remove("hidden");
  menu.style.left = Math.min(x, window.innerWidth - 170) + "px";
  menu.style.top = Math.min(y, window.innerHeight - 100) + "px";
}

function hideContextMenu() {
  $("context-menu").classList.add("hidden");
  contextMenuMsg = null;
}

/* ── Reply ─────────────────────────────────────────────────────────────── */
function startReply(msg) {
  state.replyingTo = msg;
  const mine = msg.sender_id === state.user.id;
  const text = mine ? msg.original_text : (msg.translated_text || msg.original_text);
  $("reply-preview-text").textContent = text || (msg.media_url ? "Media" : "Message");
  $("reply-preview-bar").classList.remove("hidden");
  $("message-input").focus();
}

function cancelReply() {
  state.replyingTo = null;
  $("reply-preview-bar").classList.add("hidden");
}

/* ── Multi-select ──────────────────────────────────────────────────────── */
function enterSelectMode() {
  state.selectMode = true;
  state.selectedMessages.clear();
  $("select-toolbar").classList.remove("hidden");
  updateSelectCount();
  renderMessages(state.currentMessages);
}

function exitSelectMode() {
  state.selectMode = false;
  state.selectedMessages.clear();
  $("select-toolbar").classList.add("hidden");
  if (state.currentMessages.length) renderMessages(state.currentMessages);
}

function updateSelectCount() {
  $("select-count").textContent = `${state.selectedMessages.size} selected`;
}

/* ── Delete Messages ───────────────────────────────────────────────────── */
async function deleteMessages(ids) {
  if (!ids.length) return;
  try {
    const { error } = await state.supabase.from("messages").delete().in("id", ids);
    if (error) throw error;
    // Remove from local state immediately
    state.currentMessages = state.currentMessages.filter(m => !ids.includes(m.id));
    renderMessages(state.currentMessages);
    await loadConversations();
  } catch (err) {
    $("send-status").textContent = friendlyError(err);
  }
}

async function deleteSelectedMessages() {
  const ids = [...state.selectedMessages];
  exitSelectMode();
  await deleteMessages(ids);
}

/* ── Read Receipts ─────────────────────────────────────────────────────── */
async function markMessagesAsRead() {
  if (!state.activeConversation) return;
  try {
    await state.supabase.from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", state.activeConversation.id)
      .neq("sender_id", state.user.id)
      .is("read_at", null);
  } catch (err) {
    console.error("Failed to mark messages as read:", err);
  }
}

/* ── Realtime ──────────────────────────────────────────────────────────── */
let _realtimeDebounce = null;
function subscribeToMessages() {
  if (state.realtimeChannel) {
    state.supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
  const convId = state.activeConversation.id;
  state.realtimeChannel = state.supabase.channel(`messages-${convId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, (payload) => {
      // Debounce rapid-fire events (e.g. send + realtime overlap)
      clearTimeout(_realtimeDebounce);
      _realtimeDebounce = setTimeout(async () => {
        try {
          if (!state.activeConversation || state.activeConversation.id !== convId) return;
          if (payload.eventType === "INSERT" || payload.eventType === "DELETE") {
            await loadMessages();
            await loadConversations();
            if (payload.eventType === "INSERT" && payload.new?.sender_id !== state.user.id) {
              await markMessagesAsRead();
            }
          }
          if (payload.eventType === "UPDATE") {
            await loadMessages();
          }
        } catch (err) {
          console.error("Realtime handler error:", err);
        }
      }, 300);
    })
    .subscribe();
}

/* ── Translate ─────────────────────────────────────────────────────────── */
async function translate(text, targetLanguage) {
  const { data, error } = await state.supabase.functions.invoke("translate", {
    body: { text, targetLanguage, sourceLanguage: state.profile.language }
  });
  if (error) throw error;
  if (!data?.translation) throw new Error("Translation service returned no text.");
  return data.translation;
}

/* ── Text Correction ───────────────────────────────────────────────────── */
async function requestCorrection(text) {
  try {
    const { data, error } = await state.supabase.functions.invoke("translate", {
      body: { text, sourceLanguage: state.profile.language, targetLanguage: state.profile.language, mode: "correct" }
    });
    if (error) throw error;
    if (data?.corrected && data.changed) {
      $("correction-text").textContent = data.corrected;
      $("correction-bar").classList.remove("hidden");
    }
  } catch (err) {
    console.error("Correction failed:", err);
  }
}

function onMessageInputForCorrection() {
  clearTimeout(state.correctionTimer);
  $("correction-bar").classList.add("hidden");
  const text = $("message-input").value.trim();
  if (!text || text.length < 5) return;
  if (text === state.lastCorrectionText) return;
  state.correctionTimer = setTimeout(() => {
    state.lastCorrectionText = text;
    requestCorrection(text);
  }, CORRECTION_DEBOUNCE_MS);
}

function acceptCorrection() {
  const corrected = $("correction-text").textContent;
  if (corrected) {
    $("message-input").value = corrected;
    autoResize();
  }
  $("correction-bar").classList.add("hidden");
}

function dismissCorrection() {
  $("correction-bar").classList.add("hidden");
}

/* ── Send Message (optimistic) ─────────────────────────────────────────── */
async function sendMessage() {
  if (!state.activeConversation || !state.activeFriend) return;
  const text = $("message-input").value.trim();
  if (!text) return;
  const btn = $("send-message");
  btn.disabled = true;
  $("send-status").textContent = "";
  clearTimeout(state.correctionTimer);
  $("correction-bar").classList.add("hidden");

  // Optimistic render
  const optimisticId = `optimistic-${Date.now()}`;
  const optimisticMsg = {
    id: optimisticId,
    sender_id: state.user.id,
    message_type: "text",
    original_text: text,
    translated_text: text,
    created_at: new Date().toISOString(),
    reply_to_id: state.replyingTo?.id || null,
    read_at: null,
    _optimistic: true
  };
  state.currentMessages.push(optimisticMsg);
  renderMessages(state.currentMessages);
  $("message-input").value = "";
  autoResize();

  const replyToId = state.replyingTo?.id || null;
  cancelReply();

  try {
    let translatedText = text;
    if (state.profile.language !== state.activeFriend.language) {
      translatedText = await translate(text, state.activeFriend.language);
    }
    const { error } = await state.supabase.from("messages").insert({
      conversation_id: state.activeConversation.id,
      sender_id: state.user.id,
      message_type: "text",
      original_text: text,
      original_language: state.profile.language,
      translated_text: translatedText,
      target_language: state.activeFriend.language,
      reply_to_id: replyToId
    });
    if (error) throw error;
    // Remove optimistic — realtime subscription will load the real message
    state.currentMessages = state.currentMessages.filter(m => m.id !== optimisticId);
    // Still load once to avoid delay if realtime is slow
    await loadMessages();
    loadConversations(); // Fire-and-forget for sidebar update
  } catch (err) {
    // Remove optimistic on failure
    state.currentMessages = state.currentMessages.filter(m => m.id !== optimisticId);
    renderMessages(state.currentMessages);
    $("send-status").textContent = friendlyError(err);
  } finally {
    btn.disabled = false;
    $("message-input").focus();
  }
}

/* ── Send Media ────────────────────────────────────────────────────────── */
async function sendMedia(file) {
  if (!state.activeConversation || !state.activeFriend || !file) return;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  $("send-status").textContent = "";
  if (!isImage && !isVideo && !isAudio) {
    $("send-status").textContent = "Only image, video, or audio files can be shared.";
    return;
  }
  if (file.size > MAX_MEDIA_BYTES) {
    $("send-status").textContent = "That file is larger than 25 MB.";
    return;
  }
  const attachBtn = $("attach-btn");
  attachBtn.disabled = true;
  $("send-message").disabled = true;
  $("send-status").textContent = `Uploading ${file.name}...`;
  try {
    const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : isAudio ? "mp3" : "jpg")).toLowerCase();
    const path = `${state.activeConversation.id}/${state.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadError } = await state.supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: pub } = state.supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);

    const caption = $("message-input").value.trim();
    let translatedCaption = caption || null;
    if (caption && state.profile.language !== state.activeFriend.language) {
      $("send-status").textContent = "Translating caption...";
      translatedCaption = await translate(caption, state.activeFriend.language);
    }

    const msgType = isVideo ? "video" : isAudio ? "audio" : "image";
    const { error } = await state.supabase.from("messages").insert({
      conversation_id: state.activeConversation.id,
      sender_id: state.user.id,
      message_type: msgType,
      original_text: caption || null,
      original_language: state.profile.language,
      translated_text: translatedCaption,
      target_language: state.activeFriend.language,
      media_url: pub.publicUrl,
      media_mime_type: file.type,
      reply_to_id: state.replyingTo?.id || null
    });
    if (error) throw error;

    $("message-input").value = "";
    autoResize();
    $("send-status").textContent = "";
    cancelReply();
    await loadMessages();
    await loadConversations();
  } catch (err) {
    $("send-status").textContent = friendlyError(err);
  } finally {
    attachBtn.disabled = false;
    $("send-message").disabled = false;
    $("media-input").value = "";
  }
}

async function sendMultipleMedia(files) {
  for (const file of files) {
    await sendMedia(file);
  }
}

/* ── Settings ──────────────────────────────────────────────────────────── */
function openSettings() {
  if (!state.profile) return;
  $("settings-name").value = state.profile.full_name || "";
  $("settings-username").value = state.profile.username || "";
  $("settings-language").value = state.profile.language || "en";
  $("settings-error").classList.add("hidden");
  $("settings-success").classList.add("hidden");

  const photoUrl = state.profile.profile_photo_url || state.profile.avatar_url;
  const preview = $("settings-photo-preview");
  if (photoUrl) preview.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="avatar" />`;
  else preview.textContent = initials(state.profile.full_name, state.profile.email);

  const theme = document.documentElement.getAttribute("data-theme") || "light";
  $("theme-toggle").classList.toggle("active", theme === "dark");

  $("settings-modal").classList.remove("hidden");
}

function closeSettings() {
  $("settings-modal").classList.add("hidden");
}

async function saveSettings() {
  $("settings-error").classList.add("hidden");
  $("settings-success").classList.add("hidden");
  $("settings-save").disabled = true;
  try {
    const username = slugifyUsername($("settings-username").value);
    const formatError = validateUsernameFormat(username);
    if (formatError) throw new Error(formatError);

    const updateData = {
      full_name: $("settings-name").value.trim() || state.profile.full_name,
      username,
      language: $("settings-language").value
    };

    // Check if photo was changed
    const photoInput = $("settings-photo-input");
    if (photoInput.files?.[0]) {
      const photoUrl = await uploadProfilePhoto(photoInput.files[0]);
      updateData.profile_photo_url = photoUrl;
    }

    const { data, error } = await state.supabase.from("profiles")
      .update(updateData).eq("id", state.user.id).select().single();
    if (error) {
      if (error.code === "23505") throw new Error("That username is already taken.");
      throw error;
    }
    state.profile = data;
    $("my-language-label").textContent = `${languageName(data.language)} · @${data.username}`;
    $("settings-success").textContent = "Settings saved!";
    $("settings-success").classList.remove("hidden");

    // Update photo preview
    const photoUrl = data.profile_photo_url || data.avatar_url;
    const preview = $("settings-photo-preview");
    if (photoUrl) preview.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="avatar" />`;

    // Refresh conversation list to show updated name/photo
    await loadConversations();
    if (state.activeConversation) {
      $("chat-title").textContent = displayHandle(state.activeFriend);
    }

    setTimeout(() => closeSettings(), 1200);
  } catch (err) {
    $("settings-error").textContent = friendlyError(err);
    $("settings-error").classList.remove("hidden");
  } finally {
    $("settings-save").disabled = false;
  }
}

/* ── Emoji Picker ──────────────────────────────────────────────────────── */
function renderEmojiPicker() {
  const picker = $("emoji-picker");
  picker.innerHTML = EMOJIS.map(emoji => `<button type="button" class="emoji-item">${emoji}</button>`).join("");
  picker.querySelectorAll(".emoji-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = $("message-input");
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.slice(0, start) + btn.textContent + input.value.slice(end);
      input.focus();
      const newPosition = start + btn.textContent.length;
      input.setSelectionRange(newPosition, newPosition);
      autoResize();
    });
  });
}

function toggleEmojiPicker() {
  $("emoji-picker").classList.toggle("hidden");
}

/* ── Auto resize ───────────────────────────────────────────────────────── */
function autoResize() {
  const el = $("message-input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

/* ── Wire Events ───────────────────────────────────────────────────────── */
function wireEvents() {
  // Auth
  $("google-sign-in").addEventListener("click", signIn);
  $("save-profile").addEventListener("click", saveProfile);
  $("setup-sign-out").addEventListener("click", signOut);
  $("username-input").addEventListener("input", onUsernameInput);
  $("sign-out").addEventListener("click", signOut);

  // Setup photo
  $("setup-upload-photo-btn").addEventListener("click", () => $("setup-photo-input").click());
  $("setup-photo-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      state.pendingSetupPhoto = file;
      const url = URL.createObjectURL(file);
      $("setup-photo-preview").innerHTML = `<img src="${url}" alt="avatar" />`;
    }
  });

  // Chat
  $("start-chat").addEventListener("click", startChat);
  $("friend-handle").addEventListener("keydown", e => { if (e.key === "Enter") startChat(); });
  $("send-message").addEventListener("click", sendMessage);
  $("attach-btn").addEventListener("click", () => $("media-input").click());
  renderEmojiPicker();

  $("emoji-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleEmojiPicker(); });
  document.addEventListener("click", (e) => {
    const wrapper = document.querySelector(".emoji-wrapper");
    if (wrapper && !wrapper.contains(e.target)) $("emoji-picker").classList.add("hidden");
    hideContextMenu();
  });

  // Multi-file upload
  $("media-input").addEventListener("change", (e) => {
    const files = e.target.files;
    if (files?.length) sendMultipleMedia([...files]);
  });

  $("refresh-chat").addEventListener("click", async () => {
    try { await loadConversations(); if (state.activeConversation) await loadMessages(); }
    catch (err) { console.error("Refresh error:", err); }
  });
  $("message-input").addEventListener("input", () => { autoResize(); onMessageInputForCorrection(); });
  $("message-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // Reply
  $("reply-preview-close").addEventListener("click", cancelReply);

  // Correction
  $("accept-correction").addEventListener("click", acceptCorrection);
  $("dismiss-correction").addEventListener("click", dismissCorrection);

  // Multi-select
  $("select-mode-btn").addEventListener("click", () => {
    if (state.selectMode) exitSelectMode();
    else enterSelectMode();
  });
  $("cancel-select").addEventListener("click", exitSelectMode);
  $("delete-selected").addEventListener("click", deleteSelectedMessages);

  // Context menu actions
  $("ctx-reply").addEventListener("click", () => {
    if (contextMenuMsg) startReply(contextMenuMsg);
    hideContextMenu();
  });
  $("ctx-delete").addEventListener("click", () => {
    if (contextMenuMsg) deleteMessages([contextMenuMsg.id]);
    hideContextMenu();
  });

  // Settings
  $("settings-btn").addEventListener("click", openSettings);
  $("settings-close").addEventListener("click", closeSettings);
  $("settings-save").addEventListener("click", saveSettings);
  $("settings-modal").addEventListener("click", (e) => { if (e.target === $("settings-modal")) closeSettings(); });
  $("theme-toggle").addEventListener("click", toggleTheme);
  $("settings-upload-photo-btn").addEventListener("click", () => $("settings-photo-input").click());
  $("settings-photo-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      $("settings-photo-preview").innerHTML = `<img src="${url}" alt="avatar" />`;
    }
  });
}

/* ── Bootstrap ─────────────────────────────────────────────────────────── */
init().catch(err => {
  console.error(err);
  $("auth-error").textContent = friendlyError(err);
  $("auth-error").classList.remove("hidden");
});
