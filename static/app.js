let userID = localStorage.getItem("talkalot_userID") || null;
let insideFair = false;
let currentTags = [];
let pollTimer = null;

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function(s) { s.classList.remove("active"); });
  document.getElementById(id).classList.add("active");
}

function showToast(msg, type) {
  var existing = document.querySelector(".toast");
  if (existing) existing.remove();
  var t = document.createElement("div");
  t.className = "toast" + (type ? " " + type : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.remove(); }, 4000);
}

function updateStatus(text) {
  document.getElementById("status-bar").textContent = text;
}

function updateEventBanner() {
  var banner = document.getElementById("event-banner");
  var text = document.getElementById("event-banner-text");
  var btn = document.getElementById("btn-toggle-fair");
  banner.classList.remove("hidden");
  if (insideFair) {
    text.textContent = "You're at the event";
    btn.textContent = "Leave";
    btn.onclick = leaveFair;
  } else {
    text.textContent = "Not at the event";
    btn.textContent = "Join";
    btn.onclick = joinFair;
  }
}

async function apiCall(method, path, body) {
  var opts = { method: method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch(path, opts);
  if (!res.ok) {
    var err = await res.json().catch(function() { return { detail: "Something went wrong" }; });
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

async function register() {
  try {
    var data = await apiCall("POST", "/api/register");
    userID = data.userID;
    localStorage.setItem("talkalot_userID", userID);
    updateStatus("Registered");
    showScreen("fair-screen");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function joinFair() {
  try {
    await apiCall("POST", "/api/join-fair", { userID: userID });
    insideFair = true;
    updateStatus("At the event");
    showScreen("main-screen");
    updateEventBanner();
    loadPosts();
    startPolling();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function leaveFair() {
  try {
    await apiCall("POST", "/api/leave-fair", { userID: userID });
    insideFair = false;
    updateStatus("Browsing remotely");
    updateEventBanner();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function checkUserStatus() {
  try {
    var data = await apiCall("GET", "/api/user-status?userID=" + userID);
    insideFair = data.inside_fair;
    updateStatus(insideFair ? "At the event" : "Browsing");
    showScreen("main-screen");
    updateEventBanner();
    updateNotifBadge(data.unread_notifications || 0);
    loadPosts();
    startPolling();
  } catch (e) {
    localStorage.removeItem("talkalot_userID");
    userID = null;
    showScreen("welcome-screen");
  }
}

function addTag(tag) {
  tag = tag.trim().toLowerCase();
  if (!tag || currentTags.includes(tag)) return;
  currentTags.push(tag);
  renderTags();
}

function removeTag(tag) {
  currentTags = currentTags.filter(function(t) { return t !== tag; });
  renderTags();
}

function renderTags() {
  var container = document.getElementById("tags-container");
  container.innerHTML = currentTags.map(function(t) {
    return '<span class="tag-removable">' + escapeHtml(t) +
      '<span class="remove-tag" data-tag="' + escapeHtml(t) + '">&times;</span></span>';
  }).join("");
  container.querySelectorAll(".remove-tag").forEach(function(el) {
    el.addEventListener("click", function() { removeTag(el.dataset.tag); });
  });
}

async function submitPost() {
  var content = document.getElementById("post-content").value.trim();
  if (!content) {
    showToast("Write something about your interest first", "error");
    return;
  }
  try {
    document.getElementById("btn-post").disabled = true;
    await apiCall("POST", "/api/posts", {
      user_id: userID,
      content: content,
      tags: currentTags
    });
    document.getElementById("post-content").value = "";
    currentTags = [];
    renderTags();
    showToast("Interest posted!");
    document.querySelector('[data-tab="feed"]').click();
    loadPosts();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    document.getElementById("btn-post").disabled = false;
  }
}

function timeAgo(dateStr) {
  var now = new Date();
  var d = new Date(dateStr);
  var diffMs = now - d;
  var diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  var diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + "h ago";
  var diffDay = Math.floor(diffHr / 24);
  return diffDay + "d ago";
}

async function loadPosts() {
  try {
    var posts = await apiCall("GET", "/api/posts?userID=" + userID);
    var container = document.getElementById("posts-list");
    if (!posts.length) {
      container.innerHTML = '<p class="empty-state">No posts yet. Share your interests first!</p>';
      return;
    }
    container.innerHTML = posts.map(function(p) {
      var isMe = p.user_id === userID;
      var tagsHtml = p.tags.map(function(t) {
        return '<span class="tag">' + escapeHtml(t) + '</span>';
      }).join("");
      var likeClass = p.liked_by_me ? " liked" : "";
      var heartSymbol = p.liked_by_me ? "&#10084;" : "&#9825;";
      var likeBtn = isMe ? "" :
        '<button class="like-btn' + likeClass + '" data-post-id="' + p.id + '" data-liked="' + p.liked_by_me + '">' +
        '<span class="heart">' + heartSymbol + '</span>' +
        (p.liked_by_me ? "Liked" : "Like") +
        '</button>';
      var likeCountText = p.like_count > 0 ? '<span class="like-count">' + p.like_count + ' like' + (p.like_count !== 1 ? 's' : '') + '</span>' : '';
      return '<div class="post-card' + (isMe ? ' my-post' : '') + '">' +
        '<div class="post-meta">' +
        '<span class="post-user">' + (isMe ? "You" : "Someone nearby") + '</span>' +
        '<span class="post-time">' + timeAgo(p.created_at) + '</span>' +
        '</div>' +
        '<div class="post-body">' + escapeHtml(p.content) + '</div>' +
        (tagsHtml ? '<div class="post-tags">' + tagsHtml + '</div>' : '') +
        '<div class="post-actions">' + likeBtn + likeCountText + '</div>' +
        '</div>';
    }).join("");

    container.querySelectorAll(".like-btn").forEach(function(btn) {
      btn.addEventListener("click", function() { handleLike(btn); });
    });
  } catch (e) {
    showToast("Could not load posts", "error");
  }
}

async function handleLike(btn) {
  var postId = btn.dataset.postId;
  var isLiked = btn.dataset.liked === "true";
  try {
    if (isLiked) {
      await apiCall("POST", "/api/posts/" + postId + "/unlike", { user_id: userID });
    } else {
      var result = await apiCall("POST", "/api/posts/" + postId + "/like", { user_id: userID });
      if (result.matched) {
        showToast("Mutual interest match! You'll be notified when nearby.", "match");
      }
    }
    loadPosts();
    pollNotifications();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function loadNotifications() {
  try {
    var notifs = await apiCall("GET", "/api/notifications?userID=" + userID);
    var container = document.getElementById("notifications-list");
    if (!notifs.length) {
      container.innerHTML = '<p class="empty-state">No notifications yet.</p>';
      return;
    }
    var icons = { like: "&#128077;", match: "&#129309;", proximity: "&#128205;" };
    container.innerHTML = notifs.map(function(n) {
      var icon = icons[n.notif_type] || "&#128276;";
      return '<div class="notif-card' + (n.seen ? '' : ' unread') + '">' +
        '<div class="notif-icon">' + icon + '</div>' +
        '<div class="notif-body">' +
        '<div class="notif-message">' + escapeHtml(n.message) + '</div>' +
        '<div class="notif-time">' + timeAgo(n.created_at) + '</div>' +
        '</div>' +
        '</div>';
    }).join("");
  } catch (e) {
    console.error("Failed to load notifications", e);
  }
}

async function markNotificationsSeen() {
  try {
    await apiCall("POST", "/api/notifications/mark-seen", { userID: userID });
    updateNotifBadge(0);
    loadNotifications();
    showToast("All marked as read");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function loadMatches() {
  try {
    var matches = await apiCall("GET", "/api/matches?userID=" + userID);
    var container = document.getElementById("matches-list");
    if (!matches.length) {
      container.innerHTML = '<p class="empty-state">No matches yet. Like some posts to find mutual interests!</p>';
      return;
    }
    container.innerHTML = matches.map(function(m) {
      var statusClass = m.both_at_event ? "nearby" : "away";
      var statusText = m.both_at_event ? "Both here!" : "Not nearby";
      var tagsHtml = m.other_user_tags.map(function(t) {
        return '<span class="tag">' + escapeHtml(t) + '</span>';
      }).join("");
      return '<div class="match-card">' +
        '<div class="match-header">' +
        '<span style="font-weight:600;">Mutual Match</span>' +
        '<span class="match-status ' + statusClass + '">' + statusText + '</span>' +
        '</div>' +
        (tagsHtml ? '<div class="match-tags">' + tagsHtml + '</div>' : '<p style="color:#b2bec3;font-size:13px;">No tags shared yet</p>') +
        '<div class="match-time">Matched ' + timeAgo(m.matched_at) + '</div>' +
        '</div>';
    }).join("");
  } catch (e) {
    showToast("Could not load matches", "error");
  }
}

function updateNotifBadge(count) {
  var badge = document.getElementById("notif-badge");
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

async function pollNotifications() {
  try {
    var data = await apiCall("GET", "/api/user-status?userID=" + userID);
    updateNotifBadge(data.unread_notifications || 0);
    insideFair = data.inside_fair;
    updateEventBanner();
  } catch (e) {
    console.error("Poll failed", e);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollNotifications, 15000);
}

function escapeHtml(text) {
  var d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

document.getElementById("btn-register").addEventListener("click", register);
document.getElementById("btn-join-fair").addEventListener("click", joinFair);
document.getElementById("btn-post").addEventListener("click", submitPost);
document.getElementById("btn-refresh").addEventListener("click", loadPosts);
document.getElementById("btn-mark-seen").addEventListener("click", markNotificationsSeen);
document.getElementById("btn-refresh-matches").addEventListener("click", loadMatches);

document.querySelectorAll(".tab").forEach(function(tab) {
  tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "notifications") loadNotifications();
    if (tab.dataset.tab === "matches") loadMatches();
    if (tab.dataset.tab === "feed") loadPosts();
  });
});

document.getElementById("tag-input").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = "";
  }
});

document.querySelectorAll(".tag-suggestion").forEach(function(btn) {
  btn.addEventListener("click", function() { addTag(btn.dataset.tag); });
});

if (userID) {
  checkUserStatus();
} else {
  showScreen("welcome-screen");
}
