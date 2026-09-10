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
const MAX_MEDIA_BYTES = 25 * 1024 * 1024; // 25 MB

const state = {
  supabase: null,
  user: null,
  profile: null,
  conversations: [],
  activeConversation: null,
  activeFriend: null,
  realtimeChannel: null,
  profilesCache: new Map(),
  usernameCheckToken: 0
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const languageName = (code) => LANGUAGES.find(([id]) => id === code)?.[1] || code || "Unknown";
const initials = (name, email = "") => ((name || email || "?").trim().split(/\s+/).map(x => x[0]).join("").slice(0,2) || "?").toUpperCase();
const friendlyError = (err) => err?.message || err?.error_description || "Something went wrong.";
const displayHandle = (p) => p?.username ? `@${p.username}` : (p?.full_name || p?.email || "Unknown user");

function show(viewId) {
  ["auth-view", "setup-view", "chat-view"].forEach(id => $(id).classList.toggle("hidden", id !== viewId));
}

function populateLanguages() {
  $("language-select").innerHTML = LANGUAGES.map(([code, name]) => `<option value="${code}">${name}</option>`).join("");
}

async function init() {
  populateLanguages();
  if (SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")) {
    $("auth-error").textContent = "Open app.js and add your Supabase URL and publishable key first.";
    $("auth-error").classList.remove("hidden");
    return;
  }

  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await state.supabase.auth.getSession();
  if (data.session) await handleSession(data.session);
  else show("auth-view");

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) await handleSession(session);
    else {
      state.user = null; state.profile = null; show("auth-view");
    }
  });

  wireEvents();
}

async function handleSession(session) {
  state.user = session.user;
  const profile = await loadMyProfile();
  if (!profile || !profile.username) {
    const displayName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User";
    $("language-select").value = profile?.language || "en";
    $("setup-view").dataset.defaultName = displayName;
    $("username-input").value = profile?.username || "";
    await suggestUsername(displayName, session.user.email);
    show("setup-view");
    return;
  }
  state.profile = profile;
  $("my-language-label").textContent = `${languageName(profile.language)} · @${profile.username}`;
  show("chat-view");
  await loadConversations();
}

async function loadMyProfile() {
  const { data, error } = await state.supabase.from("profiles").select("id,email,username,full_name,avatar_url,language").eq("id", state.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

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
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return "Username must be 3-20 characters: letters, numbers, underscores only.";
  }
  return null;
}

async function onUsernameInput() {
  const raw = $("username-input").value;
  const username = slugifyUsername(raw);
  if (raw !== username) $("username-input").value = username;
  const status = $("username-status");
  const formatError = validateUsernameFormat(username);
  if (formatError) {
    status.textContent = formatError;
    status.className = "tiny error-text";
    return;
  }
  const token = ++state.usernameCheckToken;
  status.textContent = "Checking availability...";
  status.className = "tiny muted";
  try {
    const taken = await usernameTaken(username);
    if (token !== state.usernameCheckToken) return;
    if (taken) {
      status.textContent = "That username is already taken.";
      status.className = "tiny error-text";
    } else {
      status.textContent = "Username is available.";
      status.className = "tiny success-text";
    }
  } catch (err) {
    if (token !== state.usernameCheckToken) return;
    status.textContent = friendlyError(err);
    status.className = "tiny error-text";
  }
}

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
    const { data, error } = await state.supabase.from("profiles").upsert({
      id: state.user.id,
      email: state.user.email.toLowerCase(),
      username,
      full_name: name,
      avatar_url: state.user.user_metadata?.avatar_url || null,
      language
    }).select().single();
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

async function signIn() {
  const { error } = await state.supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.href.split("#")[0]}
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

async function findProfileByEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (normalized === state.user.email.toLowerCase()) throw new Error("You cannot start a chat with yourself.");
  const cacheKey = `e:${normalized}`;
  const cached = state.profilesCache.get(cacheKey);
  if (cached) return cached;
  const { data, error } = await state.supabase.from("profiles").select("id,email,username,full_name,avatar_url,language").eq("email", normalized).maybeSingle();
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
  const { data, error } = await state.supabase.from("profiles").select("id,email,username,full_name,avatar_url,language").ilike("username", normalized).maybeSingle();
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
  const looksLikeEmail = /\S+@\S+\.\S+/.test(value);
  return looksLikeEmail ? findProfileByEmail(value) : findProfileByUsername(value);
}

async function startChat() {
  const btn = $("start-chat");
  btn.disabled = true;
  $("friend-result").textContent = "Searching...";
  try {
    const friend = await findFriend($("friend-handle").value);
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

async function loadConversations() {
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
  const profiles = friendIds.length ? (await state.supabase.from("profiles").select("id,email,username,full_name,avatar_url,language").in("id", friendIds)).data : [];
  profiles?.forEach(p => cacheProfile(p));
  const profileById = new Map((profiles || []).map(p => [p.id, p]));

  const result = [];
  for (const c of (conversations || [])) {
    const friendMember = members.find(m => m.conversation_id === c.id && m.user_id !== state.user.id);
    const friend = friendMember ? profileById.get(friendMember.user_id) : null;
    const { data: lastMessage } = await state.supabase.from("messages").select("message_type,original_text,translated_text,media_url,created_at,sender_id").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    result.push({ ...c, friend, lastMessage });
  }
  state.conversations = result;
  renderConversationList();
}

function previewFor(lastMessage) {
  if (!lastMessage) return "No messages yet";
  const mine = lastMessage.sender_id === state.user.id;
  const caption = mine ? lastMessage.original_text : lastMessage.translated_text;
  if (lastMessage.message_type === "image") return caption ? `📷 ${caption}` : "📷 Photo";
  if (lastMessage.message_type === "video") return caption ? `🎥 ${caption}` : "🎥 Video";
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
      <div class="avatar">${escapeHtml(initials(f.full_name, f.email))}</div>
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

async function openConversation(conversation) {
  state.activeConversation = conversation;
  state.activeFriend = conversation.friend;
  $("empty-chat").classList.add("hidden");
  $("active-chat").classList.remove("hidden");
  $("chat-title").textContent = displayHandle(conversation.friend);
  $("chat-subtitle").textContent = `${languageName(conversation.friend?.language)} · you write in ${languageName(state.profile.language)}`;
  renderConversationList();
  await loadMessages();
  subscribeToMessages();
}

async function loadMessages() {
  const { data, error } = await state.supabase.from("messages").select("id,sender_id,message_type,original_text,original_language,translated_text,target_language,media_url,media_mime_type,created_at").eq("conversation_id", state.activeConversation.id).order("created_at", { ascending: true });
  if (error) throw error;
  renderMessages(data || []);
}

function renderMessages(messages) {
  const targetLanguage = state.profile.language;
  $("message-list").innerHTML = messages.map(m => {
    const mine = m.sender_id === state.user.id;
    const visibleText = mine ? m.original_text : (m.translated_text || m.original_text);
    const translated = !mine && m.translated_text && m.original_text && m.original_text !== m.translated_text;
    const note = translated ? `Translated to ${languageName(targetLanguage)}` : "";
    const mediaHtml = m.media_url
      ? (m.message_type === "video"
          ? `<video class="bubble-media" src="${escapeHtml(m.media_url)}" controls playsinline></video>`
          : `<img class="bubble-media" src="${escapeHtml(m.media_url)}" alt="Shared photo" />`)
      : "";
    const textHtml = visibleText ? `<div class="bubble-text">${escapeHtml(visibleText)}</div>` : "";
    return `<div class="message-row ${mine ? "mine" : ""}">
      <div class="bubble">
        ${mediaHtml}
        ${textHtml}
        ${note ? `<div class="translation-note">${escapeHtml(note)}</div>` : ""}
        ${translated ? `<button class="original-toggle" data-original-id="${m.id}">Show original</button><div class="original-text hidden" id="original-${m.id}">${escapeHtml(m.original_text)}</div>` : ""}
        <div class="translation-note">${new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</div>
      </div>
    </div>`;
  }).join("");
  document.querySelectorAll(".original-toggle").forEach(btn => btn.addEventListener("click", () => {
    const el = $("original-" + btn.dataset.originalId);
    el.classList.toggle("hidden");
    btn.textContent = el.classList.contains("hidden") ? "Show original" : "Hide original";
  }));
  const box = $("message-list");
  box.scrollTop = box.scrollHeight;
}

function subscribeToMessages() {
  if (state.realtimeChannel) state.supabase.removeChannel(state.realtimeChannel);
  state.realtimeChannel = state.supabase.channel(`messages-${state.activeConversation.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${state.activeConversation.id}` }, async () => {
      await loadMessages();
      await loadConversations();
    })
    .subscribe();
}

async function translate(text, targetLanguage) {
  const { data, error } = await state.supabase.functions.invoke("translate", {
    body: { text, targetLanguage, sourceLanguage: state.profile.language }
  });
  if (error) throw error;
  if (!data?.translation) throw new Error("Translation service returned no text.");
  return data.translation;
}

async function sendMessage() {
  if (!state.activeConversation || !state.activeFriend) return;
  const text = $("message-input").value.trim();
  if (!text) return;
  const btn = $("send-message");
  btn.disabled = true;
  $("send-status").textContent = "Translating...";
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
      target_language: state.activeFriend.language
    });
    if (error) throw error;
    $("message-input").value = "";
    autoResize();
    $("send-status").textContent = "";
    await loadMessages();
    await loadConversations();
  } catch (err) {
    $("send-status").textContent = friendlyError(err);
  } finally {
    btn.disabled = false;
    $("message-input").focus();
  }
}

async function sendMedia(file) {
  if (!state.activeConversation || !state.activeFriend || !file) return;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  $("send-status").textContent = "";
  if (!isImage && !isVideo) {
    $("send-status").textContent = "Only image or video files can be shared.";
    return;
  }
  if (file.size > MAX_MEDIA_BYTES) {
    $("send-status").textContent = "That file is larger than 25 MB.";
    return;
  }
  const attachBtn = $("attach-btn");
  attachBtn.disabled = true;
  $("send-message").disabled = true;
  $("send-status").textContent = "Uploading...";
  try {
    const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
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

    const { error } = await state.supabase.from("messages").insert({
      conversation_id: state.activeConversation.id,
      sender_id: state.user.id,
      message_type: isVideo ? "video" : "image",
      original_text: caption || null,
      original_language: state.profile.language,
      translated_text: translatedCaption,
      target_language: state.activeFriend.language,
      media_url: pub.publicUrl,
      media_mime_type: file.type
    });
    if (error) throw error;

    $("message-input").value = "";
    autoResize();
    $("send-status").textContent = "";
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

function autoResize() {
  const el = $("message-input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

function wireEvents() {
  $("google-sign-in").addEventListener("click", signIn);
  $("save-profile").addEventListener("click", saveProfile);
  $("setup-sign-out").addEventListener("click", signOut);
  $("username-input").addEventListener("input", onUsernameInput);
  $("sign-out").addEventListener("click", signOut);
  $("start-chat").addEventListener("click", startChat);
  $("friend-handle").addEventListener("keydown", e => { if (e.key === "Enter") startChat(); });
  $("send-message").addEventListener("click", sendMessage);
  $("attach-btn").addEventListener("click", () => $("media-input").click());
  $("media-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) sendMedia(file);
  });
  $("refresh-chat").addEventListener("click", async () => { await loadConversations(); if (state.activeConversation) await loadMessages(); });
  $("message-input").addEventListener("input", autoResize);
  $("message-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

init().catch(err => {
  console.error(err);
  $("auth-error").textContent = friendlyError(err);
  $("auth-error").classList.remove("hidden");
});
