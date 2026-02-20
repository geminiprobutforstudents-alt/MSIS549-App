let userID = localStorage.getItem("talkalot_userID") || null;
let insideFair = false;
let currentTags = [];
let pollTimer = null;
let browserNotifsEnabled = localStorage.getItem("talkalot_browser_notifs") === "true";
let lastSeenNotifCount = 0;
let lastSeenPostCount = -1;
let activeCodewordMatchId = null;
let codewordPollTimer = null;
let dialogQueue = [];
let dialogOpen = false;

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

function showNotifDialog(opts) {
  dialogQueue.push(opts);
  if (!dialogOpen) processDialogQueue();
}

function processDialogQueue() {
  if (dialogQueue.length === 0) {
    dialogOpen = false;
    return;
  }
  dialogOpen = true;
  var opts = dialogQueue.shift();
  var overlay = document.getElementById("notif-dialog-overlay");
  var iconEl = document.getElementById("notif-dialog-icon");
  var titleEl = document.getElementById("notif-dialog-title");
  var msgEl = document.getElementById("notif-dialog-message");
  var extraEl = document.getElementById("notif-dialog-extra");
  var actionBtn = document.getElementById("notif-dialog-action");
  var dismissBtn = document.getElementById("notif-dialog-dismiss");

  iconEl.textContent = opts.icon || "Alert";
  iconEl.className = "dialog-icon" + (opts.iconClass ? " " + opts.iconClass : "");
  titleEl.textContent = opts.title || "";
  msgEl.textContent = opts.message || "";
  extraEl.innerHTML = opts.extraHtml || "";
  dismissBtn.textContent = opts.dismissText || "OK";

  if (opts.actionText && opts.onAction) {
    actionBtn.textContent = opts.actionText;
    actionBtn.classList.remove("hidden");
    actionBtn.onclick = function() {
      dismissDialog();
      opts.onAction();
    };
  } else {
    actionBtn.classList.add("hidden");
    actionBtn.onclick = null;
  }

  dismissBtn.onclick = function() {
    dismissDialog();
    if (opts.onDismiss) opts.onDismiss();
  };

  overlay.classList.remove("hidden");
}

function dismissDialog() {
  document.getElementById("notif-dialog-overlay").classList.add("hidden");
  setTimeout(processDialogQueue, 200);
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
    text.textContent = "Present at event";
    btn.textContent = "Leave";
    btn.onclick = leaveFair;
  } else {
    text.textContent = "Not at event";
    btn.textContent = "Join";
    btn.onclick = function() { showScreen("fair-screen"); };
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

function sendBrowserNotification(title, body) {
  if (!browserNotifsEnabled) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body, icon: "/static/icon.png" });
  } catch (e) {
    console.error("Browser notification failed", e);
  }
}

async function enableBrowserNotifs() {
  if (!("Notification" in window)) {
    showToast("Your browser does not support notifications. You'll see alerts on screen instead.");
    browserNotifsEnabled = false;
    localStorage.setItem("talkalot_browser_notifs", "false");
    showScreen("fair-screen");
    return;
  }
  try {
    var permission = await Notification.requestPermission();
    if (permission === "granted") {
      browserNotifsEnabled = true;
      localStorage.setItem("talkalot_browser_notifs", "true");
      showToast("Notifications enabled!");
    } else {
      browserNotifsEnabled = false;
      localStorage.setItem("talkalot_browser_notifs", "false");
      showToast("Notifications declined. You'll see alerts on screen instead.");
    }
  } catch (e) {
    browserNotifsEnabled = false;
    localStorage.setItem("talkalot_browser_notifs", "false");
    showToast("Could not enable notifications. You'll see alerts on screen instead.");
  }
  showScreen("fair-screen");
}

function skipBrowserNotifs() {
  browserNotifsEnabled = false;
  localStorage.setItem("talkalot_browser_notifs", "false");
  showScreen("fair-screen");
}

async function register() {
  try {
    var data = await apiCall("POST", "/api/register");
    userID = data.userID;
    localStorage.setItem("talkalot_userID", userID);
    updateStatus("");
    showScreen("notif-pref-screen");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function joinFair() {
  try {
    await apiCall("POST", "/api/join-fair", { userID: userID });
    insideFair = true;
    updateStatus("");
    showScreen("main-screen");
    updateEventBanner();
    loadPosts();
    startPolling();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function joinWithLocation() {
  if (!navigator.geolocation) {
    showToast("Location is not supported by your browser. Use the manual option instead.", "error");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function(position) {
      joinFair();
    },
    function(error) {
      showToast("Could not get your location. You can use the manual option instead.", "error");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function skipJoin() {
  insideFair = false;
  updateStatus("");
  showScreen("main-screen");
  updateEventBanner();
  loadPosts();
  startPolling();
}

async function leaveFair() {
  try {
    await apiCall("POST", "/api/leave-fair", { userID: userID });
    insideFair = false;
    updateStatus("");
    updateEventBanner();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function checkUserStatus() {
  try {
    var data = await apiCall("GET", "/api/user-status?userID=" + userID);
    insideFair = data.inside_fair;
    updateStatus("");
    showScreen("main-screen");
    updateEventBanner();
    updateNotifBadge(data.unread_notifications || 0);
    loadPosts();
    loadRecommendedTags();
    startPolling();
  } catch (e) {
    localStorage.removeItem("talkalot_userID");
    userID = null;
    showScreen("welcome-screen");
  }
}

function toggleTag(tag) {
  tag = tag.trim().toLowerCase();
  if (!tag) return;
  if (currentTags.includes(tag)) {
    currentTags = currentTags.filter(function(t) { return t !== tag; });
  } else {
    currentTags.push(tag);
  }
  renderTags();
  updateTagButtons();
}

function renderTags() {
  var container = document.getElementById("tags-container");
  container.innerHTML = currentTags.map(function(t) {
    return '<span class="tag-removable">' + escapeHtml(t) +
      '<span class="remove-tag" data-tag="' + escapeHtml(t) + '">&times;</span></span>';
  }).join("");
  container.querySelectorAll(".remove-tag").forEach(function(el) {
    el.addEventListener("click", function() { toggleTag(el.dataset.tag); });
  });
}

function updateTagButtons() {
  document.querySelectorAll(".tag-suggestion").forEach(function(btn) {
    if (currentTags.includes(btn.dataset.tag)) {
      btn.classList.add("selected");
    } else {
      btn.classList.remove("selected");
    }
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
    updateTagButtons();
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

async function loadRecommendedTags() {
  try {
    var data = await apiCall("GET", "/api/recommended-tags?userID=" + userID);
    var section = document.getElementById("recommended-tags-section");
    var list = document.getElementById("recommended-tags-list");
    if (data.tags && data.tags.length > 0) {
      list.innerHTML = data.tags.map(function(t) {
        return '<span class="recommended-tag" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>';
      }).join("");
      section.classList.remove("hidden");
      list.querySelectorAll(".recommended-tag").forEach(function(el) {
        el.addEventListener("click", function() {
          filterFeedByTag(el.dataset.tag);
        });
      });
    } else {
      section.classList.add("hidden");
    }
  } catch (e) {
    console.error("Failed to load recommended tags", e);
  }
}

var activeFeedFilter = null;

function filterFeedByTag(tag) {
  if (activeFeedFilter === tag) {
    activeFeedFilter = null;
  } else {
    activeFeedFilter = tag;
  }
  document.querySelectorAll(".recommended-tag").forEach(function(el) {
    if (el.dataset.tag === activeFeedFilter) {
      el.style.background = "#6c5ce7";
      el.style.color = "#fff";
      el.style.borderColor = "#6c5ce7";
    } else {
      el.style.background = "";
      el.style.color = "";
      el.style.borderColor = "";
    }
  });
  loadPosts();
}

async function loadPosts() {
  try {
    var posts = await apiCall("GET", "/api/posts?userID=" + userID);
    var container = document.getElementById("posts-list");
    if (activeFeedFilter) {
      posts = posts.filter(function(p) {
        return p.tags && p.tags.indexOf(activeFeedFilter) !== -1;
      });
    }
    if (!posts.length) {
      container.innerHTML = '<p class="empty-state">' + (activeFeedFilter ? 'No posts with this tag yet.' : 'No posts yet. Share your interests first!') + '</p>';
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
        (tagsHtml ? '<span class="post-tags-inline">' + tagsHtml + '</span>' : '<span class="post-user">' + (isMe ? "You" : "") + '</span>') +
        '<span class="post-time">' + timeAgo(p.created_at) + '</span>' +
        '</div>' +
        '<div class="post-body">' + escapeHtml(p.content) + '</div>' +
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
        showNotifDialog({
          icon: "Match",
          iconClass: "icon-match",
          title: "New Match!",
          message: "You have a mutual interest match! You'll be notified when you're both at the event.",
          dismissText: "Got it"
        });
        sendBrowserNotification("Talkalot - New Match", "You have a new mutual interest match!");
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
    var labels = { like: "Like", match: "Match", proximity: "Nearby", codeword: "Go!" };
    container.innerHTML = notifs.map(function(n) {
      var icon = labels[n.notif_type] || "Alert";
      var extra = "";
      if (n.notif_type === "proximity" && n.extra_data) {
        if (n.extra_data.content) {
          extra += '<div class="notif-post-preview">' + escapeHtml(n.extra_data.content) + '</div>';
        }
        if (n.extra_data.tags && n.extra_data.tags.length) {
          extra += '<div class="notif-post-tags">' + n.extra_data.tags.map(function(t) {
            return '<span class="tag">' + escapeHtml(t) + '</span>';
          }).join("") + '</div>';
        }
        if (n.related_match_id) {
          extra += '<button class="btn-confirm-talk" data-match-id="' + n.related_match_id + '">I want to talk!</button>';
        }
      }
      if (n.notif_type === "codeword" && n.related_match_id) {
        extra += '<button class="btn-view-codeword" data-match-id="' + n.related_match_id + '">View Codeword</button>';
      }
      return '<div class="notif-card' + (n.seen ? '' : ' unread') + '">' +
        '<div class="notif-icon">' + icon + '</div>' +
        '<div class="notif-body">' +
        '<div class="notif-message">' + escapeHtml(n.message) + '</div>' +
        extra +
        '<div class="notif-time">' + timeAgo(n.created_at) + '</div>' +
        '</div>' +
        '</div>';
    }).join("");
    container.querySelectorAll(".btn-confirm-talk").forEach(function(btn) {
      btn.addEventListener("click", function() { confirmTalk(btn.dataset.matchId, btn); });
    });
    container.querySelectorAll(".btn-view-codeword").forEach(function(btn) {
      btn.addEventListener("click", function() { showCodewordForMatch(btn.dataset.matchId); });
    });
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
      var confirmArea = "";
      if (m.codeword) {
        confirmArea = '<div class="match-confirm-area">' +
          '<button class="btn-view-codeword" data-match-id="' + m.match_id + '">View Codeword</button>' +
          '</div>';
      } else if (m.both_at_event) {
        if (m.i_confirmed && !m.other_confirmed) {
          confirmArea = '<div class="match-confirm-area">' +
            '<button class="btn-confirm-talk waiting" disabled>Waiting for them...</button>' +
            '<div class="confirm-status">You confirmed! Waiting for the other person.</div>' +
            '</div>';
        } else if (!m.i_confirmed) {
          confirmArea = '<div class="match-confirm-area">' +
            '<button class="btn-confirm-talk" data-match-id="' + m.match_id + '">I want to talk!</button>' +
            '</div>';
        }
      }
      return '<div class="match-card">' +
        '<div class="match-header">' +
        '<span style="font-weight:600;">Mutual Match</span>' +
        '<span class="match-status ' + statusClass + '">' + statusText + '</span>' +
        '</div>' +
        (tagsHtml ? '<div class="match-tags">' + tagsHtml + '</div>' : '<p style="color:#b2bec3;font-size:13px;">No tags shared yet</p>') +
        '<div class="match-time">Matched ' + timeAgo(m.matched_at) + '</div>' +
        confirmArea +
        '</div>';
    }).join("");
    container.querySelectorAll(".btn-confirm-talk").forEach(function(btn) {
      btn.addEventListener("click", function() { confirmTalk(btn.dataset.matchId, btn); });
    });
    container.querySelectorAll(".btn-view-codeword").forEach(function(btn) {
      btn.addEventListener("click", function() { showCodewordForMatch(btn.dataset.matchId); });
    });
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
    var newCount = data.unread_notifications || 0;
    if (newCount > lastSeenNotifCount && lastSeenNotifCount >= 0) {
      var notifs = await apiCall("GET", "/api/notifications?userID=" + userID);
      var unseenNotifs = notifs.filter(function(n) { return !n.seen; });
      var newOnes = unseenNotifs.slice(0, newCount - lastSeenNotifCount);
      for (var i = 0; i < newOnes.length; i++) {
        var n = newOnes[i];
        if (n.notif_type === "match") {
          showNotifDialog({
            icon: "Match",
            iconClass: "icon-match",
            title: "New Match!",
            message: n.message,
            dismissText: "Got it"
          });
          sendBrowserNotification("Talkalot - New Match", n.message);
        } else if (n.notif_type === "proximity") {
          var extraHtml = "";
          if (n.extra_data) {
            if (n.extra_data.content) {
              extraHtml += '<div class="notif-post-preview">' + escapeHtml(n.extra_data.content) + '</div>';
            }
            if (n.extra_data.tags && n.extra_data.tags.length) {
              extraHtml += '<div class="notif-post-tags">' + n.extra_data.tags.map(function(t) {
                return '<span class="tag">' + escapeHtml(t) + '</span>';
              }).join("") + '</div>';
            }
          }
          var matchIdForDialog = n.related_match_id;
          showNotifDialog({
            icon: "Nearby",
            iconClass: "icon-proximity",
            title: "Someone's Nearby!",
            message: n.message,
            extraHtml: extraHtml,
            actionText: matchIdForDialog ? "I want to talk!" : null,
            onAction: matchIdForDialog ? (function(mid) { return function() { confirmTalk(mid, null); }; })(matchIdForDialog) : null,
            dismissText: "Not now"
          });
          sendBrowserNotification("Talkalot - Nearby", n.message);
        } else if (n.notif_type === "codeword") {
          if (n.extra_data && n.extra_data.codeword && n.related_match_id) {
            showCodewordScreen(n.extra_data.codeword, n.related_match_id);
          }
          sendBrowserNotification("Talkalot - Go!", n.message);
        } else if (n.notif_type === "like") {
        }
      }
    }
    lastSeenNotifCount = newCount;
    updateNotifBadge(newCount);
    insideFair = data.inside_fair;
    updateEventBanner();
    var postCount = data.total_posts || 0;
    if (lastSeenPostCount >= 0 && postCount !== lastSeenPostCount) {
      var feedTab = document.querySelector('[data-tab="feed"]');
      if (feedTab && feedTab.classList.contains("active")) {
        loadPosts();
        loadRecommendedTags();
      }
    }
    lastSeenPostCount = postCount;
  } catch (e) {
    console.error("Poll failed", e);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(pollNotifications, 15000);
}

async function confirmTalk(matchId, btn) {
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Confirming...";
    }
    var result = await apiCall("POST", "/api/matches/" + matchId + "/confirm", { user_id: userID });
    if (result.both_confirmed && result.codeword) {
      showCodewordScreen(result.codeword, matchId);
    } else {
      showToast("Confirmed! Waiting for them to confirm too.");
      if (btn) {
        btn.textContent = "Waiting for them...";
        btn.classList.add("waiting");
      }
      startCodewordPoll(matchId);
    }
  } catch (e) {
    showToast(e.message, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "I want to talk!";
    }
  }
}

async function showCodewordForMatch(matchId) {
  try {
    var status = await apiCall("GET", "/api/matches/" + matchId + "/status?userID=" + userID);
    if (status.both_confirmed && status.codeword) {
      showCodewordScreen(status.codeword, matchId);
    } else if (!status.i_confirmed) {
      confirmTalk(matchId, null);
    } else {
      showToast("Waiting for the other person to confirm.");
      startCodewordPoll(matchId);
    }
  } catch (e) {
    showToast(e.message, "error");
  }
}

function showCodewordScreen(codeword, matchId) {
  activeCodewordMatchId = matchId;
  document.getElementById("codeword-text").textContent = codeword;
  showScreen("codeword-screen");
}

function exitCodewordScreen() {
  activeCodewordMatchId = null;
  if (codewordPollTimer) {
    clearInterval(codewordPollTimer);
    codewordPollTimer = null;
  }
  showScreen("main-screen");
  loadMatches();
}

function startCodewordPoll(matchId) {
  if (codewordPollTimer) clearInterval(codewordPollTimer);
  codewordPollTimer = setInterval(async function() {
    try {
      var status = await apiCall("GET", "/api/matches/" + matchId + "/status?userID=" + userID);
      if (status.both_confirmed && status.codeword) {
        clearInterval(codewordPollTimer);
        codewordPollTimer = null;
        showCodewordScreen(status.codeword, matchId);
      }
    } catch (e) {
      console.error("Codeword poll failed", e);
    }
  }, 5000);
}

function escapeHtml(text) {
  var d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

document.getElementById("btn-register").addEventListener("click", register);
document.getElementById("btn-enable-notifs").addEventListener("click", enableBrowserNotifs);
document.getElementById("btn-skip-notifs").addEventListener("click", skipBrowserNotifs);
document.getElementById("btn-join-location").addEventListener("click", joinWithLocation);
document.getElementById("btn-join-manual").addEventListener("click", joinFair);
document.getElementById("btn-skip-join").addEventListener("click", skipJoin);
document.getElementById("btn-post").addEventListener("click", submitPost);
document.getElementById("btn-refresh").addEventListener("click", loadPosts);
document.getElementById("btn-mark-seen").addEventListener("click", markNotificationsSeen);
document.getElementById("btn-refresh-matches").addEventListener("click", loadMatches);
document.getElementById("btn-exit-codeword").addEventListener("click", exitCodewordScreen);

document.querySelectorAll(".tab").forEach(function(tab) {
  tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
    document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "notifications") loadNotifications();
    if (tab.dataset.tab === "matches") loadMatches();
    if (tab.dataset.tab === "feed") { loadPosts(); loadRecommendedTags(); }
  });
});

document.querySelectorAll(".tag-suggestion").forEach(function(btn) {
  btn.addEventListener("click", function() { toggleTag(btn.dataset.tag); });
});

if (userID) {
  checkUserStatus();
} else {
  showScreen("welcome-screen");
}
