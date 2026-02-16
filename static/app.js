const API = "";
let userID = localStorage.getItem("talkalot_userID") || null;
let insideFair = false;
let currentTags = [];

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showToast(msg, isError) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function updateStatus(text) {
  document.getElementById("status-bar").textContent = text;
}

async function apiCall(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Something went wrong" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

async function register() {
  try {
    const data = await apiCall("POST", "/api/register");
    userID = data.userID;
    localStorage.setItem("talkalot_userID", userID);
    updateStatus("Registered");
    showScreen("fair-screen");
  } catch (e) {
    showToast(e.message, true);
  }
}

async function joinFair() {
  try {
    await apiCall("POST", "/api/join-fair", { userID });
    insideFair = true;
    updateStatus("Inside the Fair");
    showScreen("main-screen");
    loadPosts();
  } catch (e) {
    showToast(e.message, true);
  }
}

async function checkUserStatus() {
  try {
    const data = await apiCall("GET", "/api/user-status?userID=" + userID);
    insideFair = data.inside_fair;
    if (insideFair) {
      updateStatus("Inside the Fair");
      showScreen("main-screen");
      loadPosts();
    } else {
      showScreen("fair-screen");
    }
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
  currentTags = currentTags.filter((t) => t !== tag);
  renderTags();
}

function renderTags() {
  const container = document.getElementById("tags-container");
  container.innerHTML = currentTags
    .map(
      (t) =>
        '<span class="tag-removable">' +
        t +
        '<span class="remove-tag" data-tag="' +
        t +
        '">&times;</span></span>'
    )
    .join("");
  container.querySelectorAll(".remove-tag").forEach((el) => {
    el.addEventListener("click", () => removeTag(el.dataset.tag));
  });
}

async function submitPost() {
  const content = document.getElementById("post-content").value.trim();
  if (!content) {
    showToast("Please write something first", true);
    return;
  }
  try {
    document.getElementById("btn-post").disabled = true;
    await apiCall("POST", "/api/posts", {
      user_id: userID,
      content,
      tags: currentTags,
    });
    document.getElementById("post-content").value = "";
    currentTags = [];
    renderTags();
    showToast("Post published!");
    document.querySelector('[data-tab="feed"]').click();
    loadPosts();
  } catch (e) {
    showToast(e.message, true);
  } finally {
    document.getElementById("btn-post").disabled = false;
  }
}

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + "h ago";
  const diffDay = Math.floor(diffHr / 24);
  return diffDay + "d ago";
}

async function loadPosts() {
  if (!insideFair) return;
  try {
    const posts = await apiCall("GET", "/api/posts?userID=" + userID);
    const container = document.getElementById("posts-list");
    if (!posts.length) {
      container.innerHTML =
        '<p class="empty-state">No posts yet. Be the first to share something!</p>';
      return;
    }
    container.innerHTML = posts
      .map((p) => {
        const isMe = p.user_id === userID;
        const tagsHtml = p.tags
          .map((t) => '<span class="tag">' + t + "</span>")
          .join("");
        return (
          '<div class="post-card' +
          (isMe ? " my-post" : "") +
          '">' +
          '<div class="post-meta">' +
          '<span class="post-user">' +
          (isMe ? "You" : "Fair attendee") +
          "</span>" +
          '<span class="post-time">' +
          timeAgo(p.created_at) +
          "</span>" +
          "</div>" +
          '<div class="post-body">' +
          escapeHtml(p.content) +
          "</div>" +
          (tagsHtml ? '<div class="post-tags">' + tagsHtml + "</div>" : "") +
          "</div>"
        );
      })
      .join("");
  } catch (e) {
    showToast("Could not load posts", true);
  }
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

document.getElementById("btn-register").addEventListener("click", register);
document.getElementById("btn-join-fair").addEventListener("click", joinFair);
document.getElementById("btn-post").addEventListener("click", submitPost);
document.getElementById("btn-refresh").addEventListener("click", loadPosts);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

document.getElementById("tag-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addTag(e.target.value);
    e.target.value = "";
  }
});

document.querySelectorAll(".tag-suggestion").forEach((btn) => {
  btn.addEventListener("click", () => addTag(btn.dataset.tag));
});

if (userID) {
  checkUserStatus();
} else {
  showScreen("welcome-screen");
}
