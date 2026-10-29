const express = require("express");
const path = require("node:path");
const multer = require("multer");
const sharp = require("sharp");
const { randomUUID } = require("node:crypto");
const {
  token,
  digest,
  hmac,
  equal,
  cookies,
  allowedOrigin,
  secureRequest,
  safeHeaders,
  errors,
  problem,
} = require("./security");
const { siteDay } = require("./store");
const { createCredentials } = require("./credentials");
const { renderMarkdown } = require("./content");
const project = path.join(__dirname, "..");
function createAdminApp(ctx) {
  const { config, store, content } = ctx;
  const credentials = ctx.credentials || createCredentials(config);
  const app = express();
  app.disable("x-powered-by");
  if (config.get().server.trustProxy)
    app.set("trust proxy", config.get().server.trustedProxies);
  app.set("views", path.join(project, "views"));
  app.set("view engine", "ejs");
  app.use(safeHeaders);
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  app.use("/admin-assets", express.static(path.join(project, "public/admin")));
  const editor = path.join(project, "node_modules/@toast-ui/editor/dist");
  for (const f of ["toastui-editor.css"])
    app.get(`/editor/${f}`, (req, res) => res.sendFile(path.join(editor, f)));

  app.get("/", (req, res) => res.render("admin/index"));
  const ip = (req) => hmac(store.meta("secret") || "admin-login", req.ip || "");
  function session(req, res, create = false) {
    let id = cookies(req).hp_admin;
    let value = id && store.getSession(digest(id));
    if(value?.auth&&value.envRevision!==credentials.revision()){store.deleteSession(digest(id));value=null;}
    if (!value && create) {
      if (!store.rate(`bootstrap:${ip(req)}`, 30, 60000))
        problem("访问过于频繁，请稍后重试", 429);
      id = token();
      value = { auth: false, csrf: token() };
      store.session(digest(id), value, Date.now() + 1800000);
      res.cookie("hp_admin", id, {
        httpOnly: true,
        sameSite: "strict",
        secure: secureRequest(req),
        path: "/",
        maxAge: 1800000,
      });
    }
    return { id, value };
  }
  function rotate(req, res) {
    const old = cookies(req).hp_admin;
    if (old) store.deleteSession(digest(old));
    const id = token(),
      value = { auth: true, csrf: token(),envRevision:credentials.revision() };
    store.session(digest(id), value, Date.now() + 12 * 3600000);
    res.cookie("hp_admin", id, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureRequest(req),
      path: "/",
      maxAge: 12 * 3600000,
    });
    return value;
  }
  app.use("/api", async (req, res, next) => {
    await credentials.sync();
    next();
  });
  app.get("/api/bootstrap", (req, res) => {
    const s = session(req, res, true);
    res.json({
      authenticated: s.value.auth,
      csrf: s.value.csrf,
    });
  });
  app.use("/api", (req, res, next) => {
    req.adminSession = session(req, res);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!allowedOrigin(req)) problem("请求来源不允许", 403);
      if (
        !req.adminSession.value ||
        !equal(req.get("X-CSRF-Token"), req.adminSession.value.csrf)
      )
        problem("页面已过期，请刷新后重试", 403);
    }
    next();
  });
  const normalJson = express.json({ limit: "2mb" }),
    restoreJson = express.json({ limit: "50mb" });
  app.use((req, res, next) =>
    (req.path === "/api/restore" ? restoreJson : normalJson)(req, res, next),
  );
  app.post("/api/login", async (req, res) => {
    if (!store.rate(`login:${ip(req)}`, 10, 900000))
      problem("登录尝试过多，请 15 分钟后再试", 429);
    if (
      typeof req.body?.username !== "string" ||
      !(await credentials.verify(req.body?.password, req.body.username))
    )
      problem("账号或密码不正确", 401);
    res.json({ ok: true, ...rotate(req, res) });
  });
  app.use("/api", (req, res, next) => {
    if (!req.adminSession.value?.auth) problem("请先登录管理后台", 401);
    next();
  });
  app.post("/api/logout", (req, res) => {
    store.deleteSession(digest(req.adminSession.id));
    res.clearCookie("hp_admin", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/state", (req, res) => {
    const day = siteDay(config.get().limits.timezone);
    res.json({
      apiVersion: 2,
      config: config.safe(),
      deployment: config.deployment(),
      posts: content.listPosts(true).map(({ content, ...p }) => p),
      knowledge: content.entries("knowledge"),
      experience: content.entries("experience"),
      publications: content.entries("publications"),
      usage: { ...store.usage(day), day },
      username: credentials.username(),
    });
  });
  app.put("/api/config", (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      problem("设置格式不完整，请刷新重试");
    const value = structuredClone(req.body),
      current = config.get();
    if (Object.hasOwn(value, "ai")) {
      if (!value.ai || typeof value.ai !== "object" || Array.isArray(value.ai))
        problem("模型设置格式错误");
      delete value.ai.hasKey;
      if (value.ai.apiKey && value.ai.apiKey !== config.key())
        problem("API Key 请只在 .env 中修改");
      value.ai.apiKey = config.key();
      if (JSON.stringify(value.ai) !== JSON.stringify(current.ai))
        problem("模型参数请在 config.json 中修改");
    }
    if (
      Object.hasOwn(value, "limits") &&
      JSON.stringify(value.limits) !== JSON.stringify(current.limits)
    )
      problem("调用限额请在 config.json 中修改");
    value.ai = current.ai;
    value.limits = current.limits;
    if (
      Object.hasOwn(value, "server") &&
      JSON.stringify(value.server) !== JSON.stringify(current.server)
    )
      problem("访问地址与端口请在 config.json 中修改");
    value.server = current.server;
    const before = config.get().server;
    const saved = config.save(value);
    res.json({
      ok: true,
      config: saved,
      deployment: config.deployment(),
      restartRequired: JSON.stringify(before) !== JSON.stringify(value.server),
    });
  });
  app.post("/api/categories", (req, res) => {
    const raw = req.body?.name;
    if (
      typeof raw !== "string" ||
      !raw.trim() ||
      raw.trim().length > 100 ||
      /[\r\n\0]/.test(raw)
    )
      problem("请输入一个分类名称，最多 100 个字符，不能换行");
    const name = raw.trim(),
      value = config.get();
    if (
      value.categories.some(
        (v) =>
          v.normalize("NFKC").toLowerCase() ===
          name.normalize("NFKC").toLowerCase(),
      )
    )
      problem("分类已经存在", 409);
    if (value.categories.length >= 100) problem("最多创建 100 个分类");
    value.categories.push(name);
    res.json({ config: config.save(value) });
  });
  app.delete("/api/categories/:name", (req, res) => {
    const affected = content.removeCategory(req.params.name);
    res.json({ config: config.safe(), affected });
  });
  app.get("/api/posts/:slug", (req, res) => {
    const p = content.getPost(req.params.slug, true);
    if (!p) problem("文章不存在", 404);
    res.json(p);
  });
  app.post("/api/posts", (req, res) => res.json(content.savePost(req.body)));
  app.put("/api/posts/:slug", (req, res) =>
    res.json(content.savePost(req.body, req.params.slug)),
  );
  app.delete("/api/posts/:slug", (req, res) => {
    content.removePost(req.params.slug);
    res.json({ ok: true });
  });
  app.post("/api/preview", (req, res) => {
    if (
      typeof req.body.content !== "string" ||
      req.body.content.length > 200000
    )
      problem("正文格式错误");
    res.json({ html: renderMarkdown(req.body.content) });
  });
  app.post("/api/entries/:kind", (req, res) =>
    res.json(content.saveEntry(req.params.kind, randomUUID(), req.body)),
  );
  app.put("/api/entries/:kind/:id", (req, res) =>
    res.json(content.saveEntry(req.params.kind, req.params.id, req.body)),
  );
  app.delete("/api/entries/:kind/:id", (req, res) => {
    content.removeEntry(req.params.kind, req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/knowledge/import", (req, res) => {
    const cfg = config.get();
    for (const [key, title, body] of [
      [
        "profile",
        "个人简介",
        `${cfg.site.name} ${cfg.site.title} ${cfg.site.school}\n${cfg.about.zh}\n${cfg.about.en}`,
      ],
      [
        "skills",
        "研究方向",
        cfg.site.researchInterests.map((v) => `${v.zh} ${v.en}`).join("\n"),
      ],
    ]) {
      if (body.trim())
        content.saveEntry("knowledge", `import-${key}`, {
          title,
          body,
          keywords: "介绍 主人 研究 擅长 skills about research",
          published: false,
          order: 0,
        });
    }
    res.json({ ok: true, message: "已导入为未发布条目，请检查并启用。" });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post("/api/upload", upload.single("image"), async (req, res) => {
    if (
      !req.file ||
      !["image/png", "image/jpeg", "image/webp"].includes(req.file.mimetype)
    )
      problem("请选择 PNG、JPEG 或 WebP 图片，最大 5MB");
    let image;
    try {
      const input = sharp(req.file.buffer, { limitInputPixels: 20000000 });
      const meta = await input.metadata();
      if (!["png", "jpeg", "webp"].includes(meta.format))
        problem("图片实际格式不受支持");
      image = await input
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      problem("图片无法读取或尺寸过大，请换一张图片");
    }
    const name = `${randomUUID()}.webp`;
    store.saveImage(name, "image/webp", image);
    res.json({ url: `/images/${name}` });
  });
  app.get("/images/:name", (req, res) => {
    const image = store.image(req.params.name);
    if (!image) problem("图片不存在",404);
    res.type(image.mime).send(Buffer.from(image.data));
  });
  app.get("/api/backup", (req, res) => {
    const { makeBackup } = require("./backup");
    res
      .attachment(`mepage-${new Date().toISOString().slice(0, 10)}.json`)
      .json(makeBackup(ctx));
  });
  app.post(
    "/api/restore",
    express.json({ limit: "50mb" }),
    async (req, res) => {
      const { restoreBackup } = require("./backup");
      await restoreBackup(ctx, req.body);
      res.json({
        ok: true,
        message: "内容已恢复，API 密钥和管理员账号保持不变。",
      });
    },
  );
  app.use((req, res) => res.status(404).json({ error: "页面不存在" }));
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) err.status = 400;
    next(err);
  });
  app.use(errors);
  return app;
}
module.exports = { createAdminApp };
