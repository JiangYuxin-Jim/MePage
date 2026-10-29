/* All administrator changes go through authenticated, CSRF-protected endpoints. */
let state,
  csrf,
  editor,
  aboutEditors = [],
  editingSlug = null;
const disposedEditors = new WeakSet();
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pages = [
  ["overview", "⌂", "概览"],
  ["profile", "☺", "关于我"],
  ["posts", "✎", "博客"],
  ["research", "▤", "科研与经历"],
  ["pet", "♧", "宠物助手"],
  ["settings", "☷", "网站设置"],
  ["backup", "⇩", "备份与恢复"],
];
async function api(url, method = "GET", body) {
  const options = { method, headers: { "X-CSRF-Token": csrf || "" } };
  if (body instanceof FormData) options.body = body;
  else if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && state) {
      state = null;
      await boot();
    }
    throw new Error(data.error || "操作未完成");
  }
  return data;
}
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 5000);
}
function fail(e) {
  toast(e.message || "操作未完成，请重试");
}
function field(label, key, value, type = "text", hint = "") {
  return `<label>${esc(label)}<input data-key="${key}" type="${type}" value="${esc(value)}">${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
}
function area(label, key, value, hint = "") {
  return `<label>${esc(label)}<textarea data-key="${key}" rows="4">${esc(value)}</textarea>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
}
function toggle(label, key, value) {
  return `<label><input data-key="${key}" type="checkbox" ${value ? "checked" : ""}>${esc(label)}</label>`;
}
function heading(title, description, action = "") {
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${action}</div>`;
}
const savebar = () =>
  '<div class="savebar"><small>修改后点击保存，即可更新网站。</small><button class="primary" id="save-settings">保存修改</button></div>';
function setKey(object, key, value) {
  const p = key.split(".");
  let t = object;
  for (const k of p.slice(0, -1)) t = t[k];
  t[p.at(-1)] = value;
}
function collectConfig() {
  const cfg = structuredClone(state.config);
  delete cfg.ai.hasKey;
  delete cfg.ai.environmentKey;
  $("#main")
    .querySelectorAll("[data-key]")
    .forEach((el) =>
      setKey(
        cfg,
        el.dataset.key,
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value,
      ),
    );
  if (state.apiVersion >= 2) {
    delete cfg.ai;
    delete cfg.limits;
    delete cfg.server;
  }
  return cfg;
}
async function saveConfig(cfg) {
  const result = await api("/api/config", "PUT", cfg);
  state.config = result.config;
  if (result.deployment) state.deployment = result.deployment;
  toast(
    result.restartRequired
      ? Object.keys(result.deployment?.overrides || {}).length
        ? "已写入 .env，但启动环境变量仍在覆盖端口；请同步修改启动参数后重启。"
        : "已保存。入口地址或端口的变更将在重启后生效。"
      : "已保存，网站内容已更新。",
  );
  return result;
}
function bindSave(extra) {
  const b = $("#save-settings");
  if (b)
    b.onclick = async () => {
      b.disabled = true;
      try {
        let cfg = collectConfig();
        if (extra) cfg = extra(cfg);
        await saveConfig(cfg);
      } catch (e) {
        fail(e);
      } finally {
        b.disabled = false;
      }
    };
}
async function refresh() {
  state = await api("/api/state");
  $("#owner").textContent = state.username;
  $("#visit-site").href = state.config.server.publicUrl;
}
async function boot() {
  try {
    const b = await api("/api/bootstrap");
    csrf = b.csrf;
    if (!b.authenticated) {
      $("#auth").hidden = false;
      $("#workspace").hidden = true;
      $('#auth-title').textContent='欢迎回来';
      $('#auth-help').textContent='请输入 .env 中配置的账号与密码。';
      $('#auth-submit').textContent='登录管理端';
      return;
    }
    await refresh();
    $("#auth").hidden = true;
    $("#workspace").hidden = false;
    $("#nav").innerHTML = pages
      .map(
        ([id, icon, name]) =>
          `<a href="#${id}"><span class="nav-symbol" aria-hidden="true">${icon}</span>${name}</a>`,
      )
      .join("");
    await route();
  } catch (e) {
    fail(e);
  }
}
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault();
  const b = $("#auth-submit");
  b.disabled = true;
  $("#auth-error").textContent = "";
  try {
    const v = Object.fromEntries(new FormData(e.target));
    const r = await api("/api/login", "POST", v);
    csrf = r.csrf;
    e.target.reset();
    await boot();
  } catch (err) {
    $("#auth-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
$("#logout").onclick = async () => {
  try {
    await api("/api/logout", "POST", {});
    state = null;
    await boot();
  } catch (e) {
    fail(e);
  }
};
$("#mobile-menu").onclick = () => $("#workspace").classList.toggle("menu-open");
$("#close-modal").onclick = () => $("#modal").close();
function modal(title, body) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = body;
  $("#modal").showModal();
}
function destroyEditors() {
  if (editor) {
    disposedEditors.add(editor);
    editor.destroy();
    editor = null;
  }
  for (const e of aboutEditors) {
    disposedEditors.add(e);
    e.destroy();
  }
  aboutEditors = [];
}
async function route() {
  if (!state) return;
  destroyEditors();
  const id = location.hash.slice(1) || "overview";
  $("#workspace").classList.remove("menu-open");
  document
    .querySelectorAll("#nav a")
    .forEach((a) =>
      a.classList.toggle(
        "active",
        a.hash ===
          `#${["knowledge"].includes(id) ? "pet" : id === "about" ? "profile" : ["publications", "experience"].includes(id) ? "research" : id}`,
      ),
    );
  $("#breadcrumb").textContent =
    pages.find(
      (p) =>
        p[0] ===
        (["knowledge"].includes(id)
          ? "pet"
          : id === "about"
            ? "profile"
            : ["publications", "experience"].includes(id)
              ? "research"
              : id),
    )?.[2] || "概览";
  try {
    await refresh();
    await screens[id]?.();
  } catch (e) {
    fail(e);
  }
}
window.addEventListener("hashchange", route);
const screens = {};
screens.overview = () => {
  const c = state.config;
  $("#main").innerHTML =
    heading("欢迎回到你的小天地", "从内容到小伙伴，都可以在这里照顾好。") +
    `<div class="welcome"><div><h2>${esc(c.site.name)} 的网站</h2><p>更新一段介绍，记录一个新项目，或者教你的小伙伴认识你。</p><a href="#profile"><button class="primary">完善个人资料</button></a></div><div class="pet-emoji" aria-hidden="true">${c.pet.type === "dog" ? "🐕" : "🐈"}</div></div><div class="stats"><div class="stat"><small>已发布文章</small><strong>${state.posts.filter((p) => p.status === "published").length}</strong><small>${state.posts.filter((p) => p.status === "draft").length} 篇草稿</small></div><div class="stat"><small>今日 AI 调用</small><strong>${state.usage.site}</strong><small>上限 ${c.limits.siteDaily} 次</small></div><div class="stat"><small>宠物已发布知识</small><strong>${state.knowledge.filter((k) => k.published).length}</strong><small>今日 ${state.usage.tokens} tokens</small></div></div><section class="sheet"><h2>第一次使用，从这里开始</h2><ul class="checklist">${[
      ["profile", "填写个人资料", "姓名、头像和联系方式"],
      ["about", "写下自我介绍", "使用可视化编辑器，无需写代码"],
      ["knowledge", "教小伙伴认识你", "只添加你愿意公开的资料"],
    ]
      .map(
        ([id, t, d]) =>
          `<li><div><a href="#${id}">${t}</a><small>${d}</small></div><a href="#${id}">去设置</a></li>`,
      )
      .join("")}</ul></section>`;
};
screens.profile = () => {
  const c = state.config,
    s = c.site;
  $("#main").innerHTML =
    heading("个人资料", "让访客认识你。中英文内容可以分别填写。") +
    `<section class="sheet"><h2>头像</h2>${s.avatar ? `<img class="avatar-preview" src="${esc(s.avatar)}" alt="当前头像">` : ""}<input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="hint">选择图片后自动上传，点击下方保存修改即可更新头像。</p></section><section class="sheet"><h2>基本信息</h2><div class="grid">${field("中文姓名", "site.name", s.name)}${field("英文姓名", "site.nameEn", s.nameEn)}${field("职位 / 头衔", "site.title", s.title)}${field("英文职位", "site.titleEn", s.titleEn)}${field("学校 / 单位", "site.school", s.school)}${field("英文学校 / 单位", "site.schoolEn", s.schoolEn)}${field("公开邮箱", "site.email", s.email, "email")}${field("GitHub 用户名", "site.github", s.github)}${field("头像占位字母", "site.initial", s.initial)}</div></section><section class="sheet"><h2>研究方向 / 能力</h2><div id="interests"></div><button id="add-interest">添加方向</button></section>${savebar()}`;
  let avatar = s.avatar;
  function add(v = { zh: "", en: "" }) {
    const row = document.createElement("div");
    row.className = "interest-row";
    row.innerHTML = `<input aria-label="中文方向" placeholder="中文方向" value="${esc(v.zh)}"><input aria-label="英文方向" placeholder="英文方向" value="${esc(v.en)}"><button aria-label="删除方向">×</button>`;
    row.querySelector("button").onclick = () => row.remove();
    $("#interests").append(row);
  }
  s.researchInterests.forEach(add);
  $("#add-interest").onclick = () => add();
  $("#avatar-file").onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f) return;
      const data = new FormData();
      data.append("image", f);
      avatar = (await api("/api/upload", "POST", data)).url;
      toast("头像已上传，请保存修改。");
    } catch (err) {
      fail(err);
    }
  };
  bindSave((cfg) => {
    cfg.site.avatar = avatar;
    cfg.site.researchInterests = [
      ...document.querySelectorAll(".interest-row"),
    ].map((row) => {
      const i = row.querySelectorAll("input");
      return { zh: i[0].value, en: i[1].value };
    });
    return cfg;
  });
};
function makeEditor(el, value, height = "430px", editType = "wysiwyg") {
  const instance = new toastui.Editor({
    el,
    height,
    initialEditType: editType,
    previewStyle: "vertical",
    initialValue: value,
    language: "zh-CN",
    usageStatistics: false,
    autofocus: false,
    hooks: {
      addImageBlobHook: async (blob, callback) => {
        try {
          const form = new FormData();
          form.append("image", blob, "image.png");
          const r = await api("/api/upload", "POST", form);
          if (disposedEditors.has(instance) || !el.isConnected) return;
          siteEditorImages.insertImageAndContinue(instance, r.url, "图片", callback);
        } catch (e) {
          fail(e);
        }
      },
    },
  });
  return instance;
}
screens.about = () => {
  $("#main").innerHTML =
    heading("自我介绍", "像写文档一样编辑介绍，也可以切换到 Markdown。") +
    '<section class="sheet"><h2>中文介绍</h2><div id="about-zh"></div></section><section class="sheet"><h2>英文介绍</h2><div id="about-en"></div></section>' +
    savebar();
  aboutEditors = [
    makeEditor($("#about-zh"), state.config.about.zh, "350px"),
    makeEditor($("#about-en"), state.config.about.en, "350px"),
  ];
  bindSave((cfg) => {
    cfg.about = {
      zh: aboutEditors[0].getMarkdown(),
      en: aboutEditors[1].getMarkdown(),
    };
    return cfg;
  });
};
function blogCategoryMarkup() {
  return `<section class="sheet"><h2>博客分类</h2><p class="hint">一次添加一个分类，点击添加即保存。删除分类会让相关文章变为未分类，文章会保留。</p><div class="category-input"><label class="sr-label" for="category-name">分类名称</label><input id="category-name" maxlength="100" placeholder="输入一个分类名称" autocomplete="off"><button id="add-category" type="button">添加分类</button></div><p id="category-feedback" class="hint" role="status"></p><div id="category-list" class="category-list"></div></section>`;
}
function bindBlogCategories() {
  function renderCategories() {
    const list = $("#category-list");
    list.innerHTML = state.config.categories.length
      ? state.config.categories
          .map((name) => {
            const count = state.posts.filter((p) => p.category === name).length;
            return `<span class="category-chip"><span>${esc(name)}</span><small>${count} 篇</small><button type="button" data-remove-category="${esc(name)}" aria-label="删除分类 ${esc(name)}">×</button></span>`;
          })
          .join("")
      : '<p class="hint">尚未创建分类，文章仍可保存为未分类。</p>';
    list.querySelectorAll("[data-remove-category]").forEach(
      (button) =>
        (button.onclick = async () => {
          if (!confirm("删除这个分类？相关文章会变为未分类，文章内容保留。"))
            return;
          button.disabled = true;
          try {
            const r = await api(
              "/api/categories/" +
                encodeURIComponent(button.dataset.removeCategory),
              "DELETE",
            );
            await refresh();
            screens.posts();
            toast(`分类已删除，${r.affected} 篇文章已改为未分类。`);
          } catch (error) {
            fail(error);
            button.disabled = false;
          }
        }),
    );
  }
  const add = async () => {
    const input = $("#category-name"),
      name = input.value.trim();
    if (!name) {
      $("#category-feedback").textContent = "请先输入一个分类名称。";
      input.focus();
      return;
    }
    $("#add-category").disabled = true;
    try {
      const r = await api("/api/categories", "POST", { name });
      state.config = r.config;
      input.value = "";
      renderCategories();
      $("#category-feedback").textContent = "分类已添加并保存到数据库。";
      input.focus();
    } catch (error) {
      $("#category-feedback").textContent = error.message;
    } finally {
      $("#add-category").disabled = false;
    }
  };
  $("#add-category").onclick = add;
  $("#category-name").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  renderCategories();
}
screens.posts = () => {
  $("#main").innerHTML =
    heading(
      "博客",
      "先保存草稿，准备好后再发布。",
      '<button class="primary" id="new-post">写一篇文章</button>',
    ) +
    blogCategoryMarkup() +
    `<section class="sheet">${state.posts.length ? `<div class="table-wrap"><table><thead><tr><th>文章</th><th>状态</th><th>日期</th><th>操作</th></tr></thead><tbody>${state.posts.map((p) => `<tr><td>${esc(p.title)}<br><small>分类：${esc(p.category || "未分类")}</small><br><small>标签：${p.tags?.length ? esc(p.tags.map((tag) => "#" + tag).join("、")) : "无"}</small></td><td><span class="badge ${p.status === "draft" ? "draft" : ""}">${p.status === "draft" ? "草稿" : "已发布"}</span></td><td>${esc(p.date)}</td><td><button data-edit="${esc(p.slug)}">编辑</button>${p.status === "draft" ? `<button class="primary" data-publish="${esc(p.slug)}">发布</button>` : `<a class="article-view" href="${esc(new URL("/blog/" + encodeURIComponent(p.slug), state.config.server.publicUrl).href)}" target="_blank" rel="noopener">查看</a>`}<button class="danger" data-delete="${esc(p.slug)}">删除</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><h2>写下第一篇文章</h2><p>项目记录、研究笔记，或是最近的一个想法。</p></div>'}</section>`;
  bindBlogCategories();
  $("#new-post").onclick = () => editPost();
  document.querySelectorAll("[data-edit]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          editPost(
            await api(`/api/posts/${encodeURIComponent(b.dataset.edit)}`),
          );
        } catch (e) {
          fail(e);
        }
      }),
  );
  document.querySelectorAll("[data-publish]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          const post = await api(
            "/api/posts/" + encodeURIComponent(button.dataset.publish),
          );
          post.status = "published";
          await api("/api/posts/" + encodeURIComponent(post.slug), "PUT", post);
          await refresh();
          screens.posts();
          toast("文章已发布，访客现在可以阅读。");
        } catch (error) {
          fail(error);
          button.disabled = false;
        }
      }),
  );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("确定删除这篇文章？建议先导出备份。")) return;
        try {
          await api(
            `/api/posts/${encodeURIComponent(b.dataset.delete)}`,
            "DELETE",
          );
          await refresh();
          screens.posts();
          toast("文章已删除");
        } catch (e) {
          fail(e);
        }
      }),
  );
};
function editPost(p = {}) {
  editingSlug = p.slug || null;
  $("#main").innerHTML =
    heading(
      p.slug ? "编辑文章" : "写一篇文章",
      "正文、图片、标题和标签都可以直接编辑。",
      '<button id="back-posts">返回文章列表</button>',
    ) +
    `<section class="sheet"><div class="grid">${field("文章标题", "title", p.title || "")}${field("文章地址", "slug", p.slug || `post-${Date.now().toString(36)}`, "text", "用于链接；默认自动生成，也可以使用英文短横线。")}${field("日期", "date", p.date || new Date().toISOString().slice(0, 10), "date")}<label>分类（单选）<select id="post-category"><option value="">未分类</option>${[...new Set([...state.config.categories, p.category].filter(Boolean))].map((v) => `<option ${v === p.category ? "selected" : ""}>${esc(v)}</option>`).join("")}</select><span class="hint">选择一个主栏目，用于博客分类筛选。</span><button type="button" id="add-blog-category" class="quiet">新增分类</button></label><div class="article-tag-editor"><label for="post-tag-name">标签（可多个）</label><div class="category-input"><input id="post-tag-name" maxlength="100" placeholder="如 Python、科研、教程"><button id="add-post-tag" type="button">添加标签</button></div><p class="hint">标签可自由填写，用逗号或回车分隔，不需要预先创建。</p><div id="post-tags" class="category-list"></div></div><div><label>当前状态</label><span id="post-status-label" class="badge ${p.status === "published" ? "" : "draft"}">${p.status === "published" ? "已发布，所有人可见" : "草稿，仅自己可见"}</span></div></div><h2>正文</h2><div class="editor-guide"><p class="hint">像文档一样编辑，图片直接显示在正文中。上传地址自动生成，也可切换 Markdown 模式。</p><div class="actions"><button id="insert-blog-image" type="button">插入图片</button><button id="continue-blog-text" type="button">在文末继续写</button></div><input id="blog-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><div id="post-editor"></div></section><div class="savebar"><div class="actions"><button id="preview-post">预览效果</button><a id="published-view" target="_blank" rel="noopener" ${p.status === "published" ? `href="${esc(new URL("/blog/" + encodeURIComponent(p.slug), state.config.server.publicUrl).href)}"` : "hidden"}>查看已发布文章</a></div><div class="actions"><button id="save-draft" type="button">保存草稿</button><button class="primary" id="publish-post" type="button">${p.status === "published" ? "更新发布" : "发布文章"}</button></div></div>`;
  editor = makeEditor($("#post-editor"), p.content || "", "560px", "wysiwyg");
  $("#insert-blog-image").onclick = () => $("#blog-image-file").click();
  $("#continue-blog-text").onclick = () => {
    editor.moveCursorToEnd(true);
    siteEditorImages.continueAfterImage(editor);
  };
  $("#blog-image-file").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const button = $("#insert-blog-image");
    const targetEditor = editor,
      targetHost = $("#post-editor");
    button.disabled = true;
    try {
      const data = new FormData();
      data.append("image", file);
      const result = await api("/api/upload", "POST", data);
      if (
        editor !== targetEditor ||
        disposedEditors.has(targetEditor) ||
        !targetHost.isConnected
      )
        return;
      siteEditorImages.insertImageAndContinue(targetEditor, result.url);
      toast("图片已插入，可以直接在下方继续输入文字。");
    } catch (error) {
      fail(error);
    } finally {
      button.disabled = false;
      event.target.value = "";
    }
  };

  $("#add-blog-category").onclick = () => {
    modal(
      "新增博客分类",
      '<form id="new-category-form"><label>分类名称<input id="new-category-name" maxlength="100" required></label><p id="new-category-error" class="error" role="alert"></p><button class="primary" type="submit">添加并选用</button></form>',
    );
    $("#new-category-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api("/api/categories", "POST", {
          name: $("#new-category-name").value,
        });
        state.config = r.config;
        const select = $("#post-category"),
          option = document.createElement("option");
        option.value = r.config.categories.at(-1);
        option.textContent = option.value;
        select.append(option);
        select.value = option.value;
        $("#modal").close();
        toast("分类已添加，正文保留。");
      } catch (error) {
        $("#new-category-error").textContent = error.message;
      }
    };
  };

  $("#back-posts").onclick = () => {
    destroyEditors();
    screens.posts();
  };
  $("#preview-post").onclick = async () => {
    try {
      const r = await api("/api/preview", "POST", {
        content: editor.getMarkdown(),
      });
      modal("文章预览", r.html);
    } catch (e) {
      fail(e);
    }
  };
  let articleTags = [
    ...new Set(
      (p.tags || [])
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  function renderArticleTags() {
    const container = $("#post-tags");
    container.innerHTML =
      articleTags
        .map(
          (tag, index) =>
            `<span class="category-chip"><span>#${esc(tag)}</span><button type="button" data-remove-tag="${index}" aria-label="删除标签 ${esc(tag)}">×</button></span>`,
        )
        .join("") || '<small class="hint">无标签</small>';
    container.querySelectorAll("[data-remove-tag]").forEach(
      (button) =>
        (button.onclick = () => {
          articleTags.splice(Number(button.dataset.removeTag), 1);
          renderArticleTags();
        }),
    );
  }
  function commitArticleTags() {
    const input = $("#post-tag-name"),
      added = input.value
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
    if (added.some((tag) => tag.length > 100)) {
      toast("每个标签最多 100 个字符");
      return false;
    }
    const next = [
      ...new Map(
        [...articleTags, ...added].map((tag) => [
          tag.normalize("NFKC").toLowerCase(),
          tag,
        ]),
      ).values(),
    ];
    if (next.length > 30) {
      toast("每篇文章最多 30 个标签");
      return false;
    }
    articleTags = next;
    input.value = "";
    renderArticleTags();
    return true;
  }
  $("#add-post-tag").onclick = () => commitArticleTags();
  $("#post-tag-name").onkeydown = (event) => {
    if (event.key === "Enter" || event.key === "," || event.key === "，") {
      event.preventDefault();
      commitArticleTags();
    }
  };
  renderArticleTags();
  let currentStatus = p.status || "draft",
    saving = false;
  async function savePostAs(status) {
    if (saving) return;
    if (!commitArticleTags()) return;
    if (
      status === "draft" &&
      currentStatus === "published" &&
      !confirm("保存为草稿会撤下当前已发布文章，访客将暂时看不到。是否继续？")
    )
      return;
    saving = true;
    $("#save-draft").disabled = true;
    $("#publish-post").disabled = true;
    try {
      const value = {};
      $("#main")
        .querySelectorAll("[data-key]")
        .forEach((el) => (value[el.dataset.key] = el.value));
      value.tags = [...articleTags];
      value.excerpt = "";
      value.status = status;
      value.category = $("#post-category").value;
      value.content = editor
        .getMarkdown()
        .replaceAll(`${location.origin}/images/`, "/images/");
      const r = await api(
        editingSlug
          ? "/api/posts/" + encodeURIComponent(editingSlug)
          : "/api/posts",
        editingSlug ? "PUT" : "POST",
        value,
      );
      editingSlug = r.slug;
      currentStatus = r.status;
      await refresh();
      $("#post-status-label").textContent =
        currentStatus === "published"
          ? "已发布，所有人可见"
          : "草稿，仅自己可见";
      $("#post-status-label").className =
        "badge" + (currentStatus === "draft" ? " draft" : "");
      $("#publish-post").textContent =
        currentStatus === "published" ? "更新发布" : "发布文章";
      $("#published-view").hidden = currentStatus !== "published";
      if (currentStatus === "published")
        $("#published-view").href = new URL(
          "/blog/" + encodeURIComponent(r.slug),
          state.config.server.publicUrl,
        ).href;
      toast(
        currentStatus === "published"
          ? "文章已发布，访客现在可以阅读。"
          : "草稿已保存，仅自己可见。",
      );
    } catch (error) {
      fail(error);
    } finally {
      saving = false;
      $("#save-draft").disabled = false;
      $("#publish-post").disabled = false;
    }
  }
  $("#save-draft").onclick = () => savePostAs("draft");
  $("#publish-post").onclick = () => savePostAs("published");
}
const entryFields = {
  experience: [
    ["年份", "year"],
    ["中文标题", "title_zh"],
    ["英文标题", "title_en"],
    ["中文描述", "desc_zh"],
    ["英文描述", "desc_en"],
  ],
  publications: [
    ["年份", "year"],
    ["原文标题（可选）", "title"],
    ["中文标题", "title_zh"],
    ["英文标题", "title_en"],
    ["期刊 / 会议", "venue"],
    ["中文期刊名", "venue_zh"],
    ["英文期刊名", "venue_en"],
    ["DOI", "doi"],
    ["论文链接", "link"],
    ["中文获奖说明", "summary_zh"],
    ["英文获奖说明", "summary_en"],
  ],
};
for (const kind of ["experience", "publications", "knowledge"])
  screens[kind] = () => {
    const knowledge = kind === "knowledge",
      name = knowledge
        ? "宠物知识库"
        : kind === "experience"
          ? "教育与经历"
          : "发表与获奖";
    $("#main").innerHTML =
      heading(
        name,
        knowledge
          ? "只添加愿意公开的资料。未发布的知识不会发送给 AI。"
          : "用表单维护条目，无需编辑文件。数字越小越靠前。",
        `<button class="primary" id="new-entry">添加${knowledge ? "知识" : "条目"}</button>`,
      ) +
      (knowledge
        ? '<div class="notice">AI 可以使用的知识应当视为公开资料。请勿填写身份证号、私人住址、密钥或其他秘密。</div><button id="import-knowledge">从网站简介导入为草稿</button><br><br>'
        : "") +
      `<section class="sheet">${state[kind].length ? `<div class="table-wrap"><table><thead><tr><th>${knowledge ? "知识" : "标题"}</th><th>${knowledge ? "状态" : "年份"}</th><th>排序</th><th>操作</th></tr></thead><tbody>${state[kind].map((v) => `<tr><td>${esc(v.title || v.title_zh || v.title_en || "未命名")}</td><td>${knowledge ? `<span class="badge ${v.published ? "" : "draft"}">${v.published ? "允许 AI 使用" : "未发布"}</span>` : esc(v.year)}</td><td>${v.order || 0}</td><td><button data-entry="${esc(v.id)}">编辑</button><button class="danger" data-remove="${esc(v.id)}">删除</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><h2>这里还没有内容</h2><p>点击上方按钮，添加第一条。</p></div>'}</section>`;
    $("#new-entry").onclick = () => entryModal(kind);
    document.querySelectorAll("[data-entry]").forEach(
      (b) =>
        (b.onclick = () =>
          entryModal(
            kind,
            state[kind].find((v) => v.id === b.dataset.entry),
          )),
    );
    document.querySelectorAll("[data-remove]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("确定删除这条内容？")) return;
          try {
            await api(`/api/entries/${kind}/${b.dataset.remove}`, "DELETE");
            await refresh();
            screens[kind]();
          } catch (e) {
            fail(e);
          }
        }),
    );
    if (knowledge)
      $("#import-knowledge").onclick = async () => {
        try {
          const r = await api("/api/knowledge/import", "POST", {});
          await refresh();
          screens.knowledge();
          toast(r.message);
        } catch (e) {
          fail(e);
        }
      };
  };
function entryModal(kind, v = {}) {
  const knowledge = kind === "knowledge";
  const fields = knowledge
    ? [
        ["知识标题", "title"],
        ["关联问法 / 关键词", "keywords"],
      ]
    : entryFields[kind];
  modal(
    v.id ? "编辑条目" : "添加条目",
    `<form id="entry-form"><div class="grid">${fields.map(([label, k]) => field(label, k, v[k] || "")).join("")}<div class="full">${knowledge ? area("知识正文", "body", v.body || "", "只填写可公开、有事实依据的信息。AI 会结合对话生成回答，无需填写预设答案。") + toggle("发布，并允许宠物使用", "published", v.published) : ""}</div>${field("显示顺序", "order", v.order || 0, "number")}</div><button class="primary" type="submit">保存条目</button></form>`,
  );
  $("#entry-form").onsubmit = async (e) => {
    e.preventDefault();
    const value = {};
    $("#entry-form")
      .querySelectorAll("[data-key]")
      .forEach(
        (el) =>
          (value[el.dataset.key] =
            el.type === "checkbox"
              ? el.checked
              : el.type === "number"
                ? Number(el.value)
                : el.value),
      );
    try {
      await api(
        `/api/entries/${kind}${v.id ? "/" + v.id : ""}`,
        v.id ? "PUT" : "POST",
        value,
      );
      $("#modal").close();
      await refresh();
      screens[kind]();
      toast("条目已保存");
    } catch (err) {
      fail(err);
    }
  };
}
screens.pet = () => {
  const p = state.config.pet;
  $("#main").innerHTML =
    heading("我的小伙伴", "选择陪伴访客的小猫或小狗，给它一个名字。") +
    `<section class="sheet">${toggle("在网站显示小伙伴", "pet.enabled", p.enabled)}<div class="pet-selector"><label class="pet-choice"><span aria-hidden="true">🐈</span><input type="radio" name="pet-type" value="cat" ${p.type === "cat" ? "checked" : ""}>小猫</label><label class="pet-choice"><span aria-hidden="true">🐕</span><input type="radio" name="pet-type" value="dog" ${p.type === "dog" ? "checked" : ""}>小狗</label></div>${field("小伙伴名字", "pet.name", p.name)}${area("欢迎语", "pet.greeting", p.greeting)}${area("说话风格", "pet.tone", p.tone, "例如：亲切、简短，用第三人称介绍主人。回答事实仍由知识库决定。")}<label>推荐问题<textarea id="suggestions">${esc(p.suggestions.join("\n"))}</textarea><span class="hint">每行一个问题，访客可以点击提问。</span></label></section>${savebar()}`;
  bindSave((cfg) => {
    cfg.pet.type = $("input[name=pet-type]:checked").value;
    cfg.pet.suggestions = $("#suggestions")
      .value.split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
    return cfg;
  });
};
screens.settings = () => {
  const c = state.config;
  $("#main").innerHTML =
    heading(
      "网站设置",
      "网站资料和外观在网页维护，运行参数由本地配置文件管理。",
    ) +
    `<section class="sheet"><h2>栏目与外观</h2><p>前台固定为「关于我」「博客」「科研与经历」。分类请到博客页面管理；标签在文章中自由填写。</p>${field("网站搜索摘要", "site.metaDescription", c.site.metaDescription)}${field("主题色", "theme.accent", c.theme.accent, "color")}${toggle("显示博客", "navigation.blog.visible", c.navigation.blog.visible)}${toggle("科研与经历：显示发表与获奖", "navigation.publications.visible", c.navigation.publications.visible)}${toggle("科研与经历：显示教育与经历", "navigation.experience.visible", c.navigation.experience.visible)}</section>${savebar()}`;
  bindSave();
};
screens.backup = () => {
  $("#main").innerHTML =
    heading("备份与恢复", "定期备份网站内容，妥善保存到自己的设备。") +
    '<section class="sheet"><h2>内容备份</h2><p>备份包含网站设置、文章、图片和知识库，不包含 API 密钥、管理员密码与访客会话。恢复后保留当前账号和调用额度。</p><div class="actions"><button class="primary" id="download-backup">下载内容备份</button><button id="restore-backup">从备份恢复</button><input class="backup-input" id="backup-file" type="file" accept="application/json"></div><p class="hint">恢复会替换当前网站内容，请先下载需要保留的内容。</p></section>';
  $("#download-backup").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const response = await fetch("/api/backup");
      if (!response.ok)
        throw new Error((await response.json()).error || "备份未完成");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `homepage-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("备份已下载，请妥善保存。");
    } catch (error) {
      fail(error);
    } finally {
      e.target.disabled = false;
    }
  };
  $("#restore-backup").onclick = () => $("#backup-file").click();
  $("#backup-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm("恢复将替换网站内容。是否继续？")) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("备份最大为 50MB");
      const r = await api(
        "/api/restore",
        "POST",
        JSON.parse(await file.text()),
      );
      await refresh();
      toast(r.message);
    } catch (err) {
      fail(err);
    }
  };
};
for (const group of [
  {
    names: ["profile", "about"],
    tabs: [
      ["profile", "个人资料"],
      ["about", "自我介绍"],
    ],
  },
  {
    names: ["publications", "experience"],
    tabs: [
      ["research", "发表与获奖"],
      ["experience", "教育与经历"],
    ],
  },
  {
    names: ["pet", "knowledge"],
    tabs: [
      ["pet", "外观与欢迎语"],
      ["knowledge", "知识库"],
    ],
  },
])
  for (const name of group.names) {
    const render = screens[name];
    screens[name] = async (...args) => {
      await render(...args);
      const tabs = document.createElement("nav");
      tabs.className = "pet-admin-tabs";
      tabs.setAttribute("aria-label", "管理分组");
      for (const [hash, label] of group.tabs) {
        const link = document.createElement("a");
        link.href = "#" + hash;
        link.textContent = label;
        if (hash === (name === "publications" ? "research" : name)) {
          link.className = "active";
          link.setAttribute("aria-current", "page");
        }
        tabs.append(link);
      }
      $("#main").prepend(tabs);
    };
  }
screens.research = (...args) => screens.publications(...args);

boot();
