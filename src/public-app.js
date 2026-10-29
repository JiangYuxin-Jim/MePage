const express = require("express");
const path = require("node:path");
const { renderMarkdown } = require("./content");
const { themePalette } = require("./theme");
const { safeHeaders, errors } = require("./security");
const project = path.join(__dirname, "..");
function createPublicApp({ config, store, content, chat }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("view engine", "ejs");
  app.set("views", path.join(project, "views"));
  if (config.get().server.trustProxy)
    app.set("trust proxy", config.get().server.trustedProxies);
  app.use(safeHeaders);
  app.get("/css/code.css",(req,res)=>res.sendFile(path.join(project,"node_modules/highlight.js/styles/github-dark.css")));
  app.use("/css", express.static(path.join(project, "public/css")));
  app.use("/js", express.static(path.join(project, "public/js")));
  app.use("/pet", express.static(path.join(project, "public/pet")));
  app.get("/images/:name", (req, res, next) => {
    const image = store.image(req.params.name);
    if (!image) return next();
    res.type(image.mime).set("Cache-Control","public, max-age=3600").send(Buffer.from(image.data));
  });
  app.use((req, res, next) => {
    const cfg = config.get();
    res.locals.site = cfg.site;
    res.locals.demoContent=cfg.site.email.endsWith("@example.com")&&cfg.site.email!=="your.email@example.com";
    res.locals.navigation = cfg.navigation;
    res.locals.theme = themePalette(cfg.theme.accent);
    res.locals.getCategoryList = () => cfg.categories;
    next();
  });
  app.get("/", (req, res) => {
    const cfg = config.get();
    res.render("index", {
      title: cfg.site.name,
      currentPage: "home",
      aboutZhHtml: renderMarkdown(cfg.about.zh),
      aboutEnHtml: renderMarkdown(cfg.about.en),
    });
  });
  const notFound = (req, res) =>
    res.status(404).render("404", { title: "未找到", currentPage: "home" });
  app.get("/research", (req, res) => {
    const nav = config.get().navigation;
    if (!nav.publications.visible && !nav.experience.visible)
      return notFound(req, res);
    const items = content.entries("research").filter(item => nav[item.type].visible)
      .map(item => ({...item,kind:item.type})).sort((a,b) => {
        const year = value => Math.max(0,...(String(value || "").match(/\d{4}/g) || []));
        return year(b.year) - year(a.year) || (a.order || 0) - (b.order || 0);
      });
    res.render("research", {title:"科研与经历",currentPage:"research",items});
  });
  for (const kind of ["experience", "publications"])
    app.get("/" + kind, (req, res) => {
      if (!config.get().navigation[kind].visible) return notFound(req, res);
      res.redirect(301, "/research#" + kind);
    });
  app.get("/blog", (req, res) => {
    if (!config.get().navigation.blog.visible) return notFound(req, res);
    res.render("blog-list", {
      title: "博客",
      currentPage: "blog",
      posts: content.listPosts().map(content.renderPost),
      activeCategory:
        typeof req.query.category === "string" ? req.query.category : null,
    });
  });
  app.get("/blog/:slug", (req, res) => {
    if (!config.get().navigation.blog.visible) return notFound(req, res);
    const posts = content.listPosts().map(content.renderPost),
      index = posts.findIndex((p) => p.slug === req.params.slug);
    if (index < 0) return notFound(req, res);
    const post = posts[index];
    res.render("blog-post", {
      title: post.title,
      currentPage: "blog",
      post,
      bodyHtml: renderMarkdown(post.content),
      prevPost: posts[index + 1] || null,
      nextPost: posts[index - 1] || null,
    });
  });
  if (chat) {
    app.get("/api/pet", chat.settings);
    app.post("/api/chat", express.json({ limit: "8kb" }), chat.handle);
  }
  app.use(notFound);
  app.use(errors);
  return app;
}
module.exports = { createPublicApp };
