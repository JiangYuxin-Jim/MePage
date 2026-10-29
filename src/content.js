const fs = require("node:fs");
const path = require("node:path");
const { Marked } = require("marked");
const { markedHighlight } = require("marked-highlight");
const hljs = require("highlight.js");
const sanitize = require("sanitize-html");
const { problem } = require("./security");
const demo = require("./demo-content");
const markdown = new Marked(markedHighlight({
  langPrefix: "hljs language-",
  highlight: (code, lang) => lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value,
}));
const anchor = s => s.toLowerCase().replace(/[^\w一-鿿]+/g, "-").replace(/^-|-$/g, "");
function normalizeEditorMarkdown(text) {
  // Empty WYSIWYG paragraphs can serialize as standalone <br> lines. CommonMark
  // treats the following lines as raw HTML until a blank line, hiding Markdown images.
  // Work on HTML tokens only so fenced/indented code and HTML containers stay intact.
  return markdown.lexer(text || "").map(token => {
    if (token.type === "html") {
      const breaks = token.raw.match(/^(?:[ \t]{0,3}(?:<br[ \t]*\/?>[ \t]*)+(?:\r?\n|$))+/i);
      if (breaks) {
        const rest = token.raw.slice(breaks[0].length);
        if (rest.trim()) return breaks[0] + "\n" + normalizeEditorMarkdown(rest);
      }
    }
    return token.raw;
  }).join("");
}
function renderMarkdown(text) {
  return sanitize(markdown.parse(normalizeEditorMarkdown(text)), {
    allowedTags: sanitize.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: { ...sanitize.defaults.allowedAttributes, "*": ["class"], img: ["src", "alt", "title", "width", "height"] },
    allowedSchemes: ["http", "https", "mailto"], allowProtocolRelative: false,
  }).replace(/<h([1-6])>(.*?)<\/h\1>/g, (all, n, s) => `<h${n} id="${anchor(s.replace(/<[^>]*>/g, ""))}">${s}</h${n}>`);
}
function safeSlug(s) {
  if (typeof s !== "string" || !/^[a-zA-Z0-9\u4e00-\u9fff][a-zA-Z0-9\u4e00-\u9fff_-]{0,99}$/.test(s))
    problem("文章地址只能使用文字、数字、下划线和短横线，最长 100 字");
  return s;
}
function createContent(root, store, config) {
  const aliases = ["publications", "experience"];
  const storageKind = kind => {
    if (!["research", "knowledge", ...aliases].includes(kind)) problem("未知内容类型");
    return aliases.includes(kind) ? "research" : kind;
  };
  const c = {
    listPosts(includeDrafts = false) {
      return store.list("posts").map(({id, ...post}) => ({...post,slug:id}))
        .filter(p => includeDrafts || p.status === "published").sort((a,b) => b.date.localeCompare(a.date));
    },
    getPost(slug, includeDrafts = false) {
      const p = store.get("posts", safeSlug(slug));
      if (!p || (!includeDrafts && p.status !== "published")) return null;
      const {id, ...post} = p;
      return {...post,slug:id,content:normalizeEditorMarkdown(post.content)};
    },
    savePost(input, oldSlug) {
      if (!input || typeof input !== "object" || Array.isArray(input)) problem("文章格式错误");
      const slug = safeSlug(input.slug);
      if (oldSlug) safeSlug(oldSlug);
      if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 300 || typeof input.content !== "string" || input.content.length > 200000)
        problem("请填写标题与正文，正文最多 20 万字符");
      if (!["draft", "published"].includes(input.status) || typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date)
        problem("文章状态或日期无效");
      if (!Array.isArray(input.tags) || input.tags.length > 30 || input.tags.some(t => typeof t !== "string" || t.length > 100 || /[\r\n\0]/.test(t)))
        problem("文章标签格式错误");
      if (typeof input.category !== "string" || (input.category && !config.get().categories.includes(input.category))) problem("请选择已创建的分类");
      return store.transaction(() => {
        const collision = c.listPosts(true).find(p => p.slug.toLowerCase() === slug.toLowerCase());
        if (collision && collision.slug !== oldSlug) problem("文章地址已存在（不区分大小写），请换一个地址",409);
        if (oldSlug && !c.getPost(oldSlug,true)) problem("原文章不存在",404);
        const value = {
          title: input.title.trim(), date: input.date, category: input.category,
          tags: [...new Map(input.tags.map(t => t.trim()).filter(Boolean).map(t => [t.normalize("NFKC").toLowerCase(),t])).values()],
          content: normalizeEditorMarkdown(input.content), status: input.status,
        };
        if (oldSlug && oldSlug !== slug) store.remove("posts",oldSlug);
        store.put("posts",slug,value);
        return c.getPost(slug,true);
      });
    },
    removePost(slug) { store.remove("posts",safeSlug(slug)); },
    removeCategory(name) {
      return store.transaction(() => {
        const cfg = config.get();
        if (!cfg.categories.includes(name)) problem("分类不存在",404);
        const posts = c.listPosts(true).filter(p => p.category === name);
        for (const post of posts) c.savePost({...post,category:""},post.slug);
        cfg.categories = cfg.categories.filter(v => v !== name);
        config.save(cfg);
        return posts.length;
      });
    },
    entries(kind) {
      return store.list(storageKind(kind)).filter(item => !aliases.includes(kind) || item.type === kind)
        .sort((a,b) => (a.order || 0) - (b.order || 0));
    },
    saveEntry(kind, id, value) {
      const target = storageKind(kind);
      if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) problem("条目地址无效");
      if (!value || typeof value !== "object" || Array.isArray(value)) problem("条目格式错误");
      const type = aliases.includes(kind) ? kind : value.type;
      if (target === "research" && !aliases.includes(type)) problem("科研条目类型错误");
      const existing = store.get(target,id);
      if (existing && aliases.includes(kind) && existing.type !== kind) problem("条目地址已被其他内容使用",409);
      const allowed = kind === "knowledge"
        ? ["title","body","keywords","published","order"]
        : ["year","title","title_zh","title_en","venue","venue_zh","venue_en","doi","link","summary_zh","summary_en","desc_zh","desc_en","order"];
      const clean = target === "research" ? {type} : {};
      for (const [key,v] of Object.entries(value)) {
        if (!allowed.includes(key)) continue;
        if (key === "order") { if (!Number.isFinite(v)) problem("排序必须为数字"); }
        else if (key === "published") { if (typeof v !== "boolean") problem("发布状态错误"); }
        else if (typeof v !== "string" || v.length > (key === "body" ? 12000 : 4000)) problem("条目文字过长或格式错误");
        clean[key] = v;
      }
      if (kind === "knowledge" && (!clean.title?.trim() || !clean.body?.trim())) problem("知识条目需要标题和正文");
      if (clean.link && !/^https?:\/\//i.test(clean.link)) problem("链接必须使用 http 或 https");
      store.put(target,id,clean);
      return store.get(target,id);
    },
    removeEntry(kind,id) {
      const target=storageKind(kind), value=store.get(target,id);
      if (!value || (aliases.includes(kind) && value.type !== kind)) problem("条目不存在",404);
      store.remove(target,id);
    },
    renderPost(p) {
      const headings = [...p.content.matchAll(/^##\s+(.+)$/gm)].map(m => ({title:m[1],anchor:anchor(m[1])}));
      const plain = sanitize(renderMarkdown(p.content), {allowedTags:[],allowedAttributes:{}}).replace(/\s+/g," ").trim();
      return {...p,date:new Date(p.date),category:p.category || "未分类",excerpt:plain.slice(0,150),readTime:Math.max(1,Math.ceil(p.content.length/500)),headings};
    },
    seedDemo() {
      store.transaction(() => {
        store.db.exec("DELETE FROM documents; DELETE FROM media;");
        const cfg = config.get();
        for (const key of ["site","about","categories"]) cfg[key] = structuredClone(demo[key]);
        for (const nav of Object.values(cfg.navigation)) nav.visible = true;
        cfg.pet.greeting = "你好，我是小伴。想了解予安的研究、项目或博客吗？";
        cfg.pet.suggestions = ["主人在研究什么？","主人做过哪些项目？","主人平时写什么？"];
        config.save(cfg);
        for (const post of demo.posts) c.savePost(post);
        for (const kind of ["research","knowledge"])
          for (const {id,...value} of demo[kind]) c.saveEntry(kind,id,value);
        for (const name of ["reading-evidence.webp","bounded-assistant.webp","experiment-notes.webp"])
          store.saveImage(name,"image/webp",fs.readFileSync(path.join(__dirname,"../assets/demo",name)));
        store.meta("contentSeeded","1");
      });
    },
  };
  if (!store.meta("contentSeeded")) c.seedDemo();
  return c;
}
module.exports = {createContent,renderMarkdown,normalizeEditorMarkdown,safeSlug};
