const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createEnv, atomicWrite } = require("./env");
const defaults = {
  server: {
    port: 18731,
    adminPort: 18732,
    host: "0.0.0.0",
    adminHost: "127.0.0.1",
    publicUrl: "http://localhost:18731",
    adminUrl: "http://localhost:18732",
    trustProxy: false,
    trustedProxies: ["loopback", "172.30.81.1"],
  },
  site: require("./demo-content").site,
  about: require("./demo-content").about,
  categories: require("./demo-content").categories,
  navigation: {
    blog: { visible: true, zh: "博客", en: "Blog" },
    publications: { visible: true, zh: "发表与获奖", en: "Publications" },
    experience: { visible: true, zh: "经历", en: "Experience" },
  },
  theme: { accent: "#1a56db" },
  pet: {
    enabled: true,
    type: "cat",
    name: "小伴",
    greeting: "你好，我是这里的小伙伴。想了解我的主人吗？",
    tone: "亲切、简短，用第三人称介绍主人",
    suggestions: ["介绍一下你的主人", "主人擅长什么", "主人有哪些兴趣"],
  },
  ai: {
    enabled: false,
    apiKey: "",
    model: "deepseek-flash",
    timeoutSeconds: 20,
    maxOutputTokens: 400,
  },
  limits: {
    visitorDaily: 10,
    ipDaily: 30,
    siteDaily: 100,
    perMinute: 5,
    concurrent: 2,
    questionLength: 500,
    timezone: "Asia/Shanghai",
  },
};
function validate(c) {
  const fail = (msg) => {
    throw Object.assign(new Error(msg), { status: 400 });
  };
  function shape(value, sample, key = "配置") {
    if (Array.isArray(sample)) {
      if (!Array.isArray(value) || value.length > 100)
        fail(`${key}格式错误或条目过多`);
      return;
    }
    if (sample && typeof sample === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        fail(`${key}格式错误`);
      if (Object.keys(value).some((k) => !Object.hasOwn(sample, k)))
        fail(`${key}含有未知设置`);
      for (const k of Object.keys(sample))
        shape(value[k], sample[k], `${key}.${k}`);
    } else if (
      typeof value !== typeof sample ||
      (typeof value === "string" &&
        value.length >
          (key.endsWith("zh") || key.endsWith("en") ? 40000 : 4000))
    )
      fail(`${key}格式或长度错误`);
  }
  shape(c, defaults);
  for (const key of Object.keys(defaults.navigation))
    if (
      c.navigation[key].zh !== defaults.navigation[key].zh ||
      c.navigation[key].en !== defaults.navigation[key].en
    )
      fail("导航名称固定，请仅设置是否显示。");
  if (
    c.categories.some(
      (value) =>
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > 100 ||
        /[\r\n\0]/.test(value),
    )
  )
    fail("分类名称需要 1–100 个字符，不能包含换行");
  c.categories = [
    ...new Map(
      c.categories.map((value) => [
        value.trim().normalize("NFKC").toLowerCase(),
        value.trim(),
      ]),
    ).values(),
  ];

  for (const k of ["port", "adminPort"])
    if (
      !Number.isInteger(c.server[k]) ||
      c.server[k] < 1024 ||
      c.server[k] > 65535
    )
      fail("端口应为 1024–65535 的整数");
  if (c.server.port === c.server.adminPort) fail("前台与后台端口不能相同");
  for (const k of ["publicUrl", "adminUrl"]) {
    try {
      const u = new URL(c.server[k]);
      if (
        !["http:", "https:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        u.search ||
        u.hash
      )
        fail("入口地址只能包含协议、主机和端口");
    } catch {
      fail("请填写完整的 http 或 https 入口地址");
    }
  }
  for (const k of ["host", "adminHost"])
    if (!/^[a-zA-Z0-9.:_-]{1,253}$/.test(c.server[k])) fail("监听地址格式错误");
  if (
    c.server.trustedProxies.length > 10 ||
    c.server.trustedProxies.some((v) => typeof v !== "string" || v.length > 100)
  )
    fail("可信代理地址格式错误");
  try {
    require("proxy-addr").compile(c.server.trustedProxies);
  } catch {
    fail("可信代理地址或网段无效");
  }
  if (!/^#[0-9a-f]{6}$/i.test(c.theme.accent)) fail("主题色格式错误");
  if (!["cat", "dog"].includes(c.pet.type)) fail("请选择猫或狗");
  if (!["deepseek-flash", "deepseek-v4-pro"].includes(c.ai.model))
    fail("请选择支持的 DeepSeek 模型");
  if (
    !Number.isInteger(c.ai.maxOutputTokens) ||
    c.ai.maxOutputTokens < 64 ||
    c.ai.maxOutputTokens > 2000
  )
    fail("回答上限为 64–2000 tokens");
  if (
    !Number.isInteger(c.ai.timeoutSeconds) ||
    c.ai.timeoutSeconds < 5 ||
    c.ai.timeoutSeconds > 60
  )
    fail("超时为 5–60 秒");
  for (const [k, max] of Object.entries({
    visitorDaily: 1000,
    ipDaily: 5000,
    siteDaily: 100000,
    perMinute: 60,
    concurrent: 10,
    questionLength: 2000,
  }))
    if (!Number.isInteger(c.limits[k]) || c.limits[k] < 1 || c.limits[k] > max)
      fail(`${k}超出允许范围 1–${max}`);
  try {
    new Intl.DateTimeFormat("en", { timeZone: c.limits.timezone }).format();
  } catch {
    fail("时区无效");
  }
  for (const list of [c.categories, c.pet.suggestions])
    if (list.some((v) => typeof v !== "string" || !v.trim() || v.length > 100))
      fail("分类或推荐问题格式错误");
  if (
    c.site.researchInterests.some(
      (v) =>
        !v ||
        typeof v.zh !== "string" ||
        typeof v.en !== "string" ||
        v.zh.length > 500 ||
        v.en.length > 500,
    )
  )
    fail("研究方向格式错误");
  if (c.site.avatar && !/^\/images\/[a-zA-Z0-9_.-]+$/.test(c.site.avatar))
    fail("请使用上传的头像图片");
  if (c.site.github && !/^[a-zA-Z0-9-]{1,39}$/.test(c.site.github))
    fail("GitHub 用户名格式错误");
  if (c.site.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.site.email))
    fail("邮箱格式错误");
  return c;
}
function mergeDefaults(a, b) {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) {
    if (!Object.hasOwn(a, k))
      throw Object.assign(new Error("设置含有未知字段"), { status: 400 });
    out[k] =
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      a[k] &&
      typeof a[k] === "object" &&
      !Array.isArray(a[k])
        ? mergeDefaults(a[k], v)
        : v;
  }
  return out;
}
function createConfig(root, store) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true, mode: 0o700 });
  const db = store?.db || new DatabaseSync(path.join(root, "data/site.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)",
  );
  const file = path.join(root, "config.json");
  const env = createEnv(root);
  function runtimeSettings(value) {
    const ai = { ...value.ai };
    delete ai.apiKey;
    return {
      server: structuredClone(value.server),
      ai,
      limits: structuredClone(value.limits),
    };
  }
  if (!fs.existsSync(file))
    atomicWrite(file, JSON.stringify(runtimeSettings(defaults), null, 2) + "\n");
  function readRuntime() {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some(
        (key) => !["server", "ai", "limits"].includes(key),
      )
    )
      throw Object.assign(
        new Error("config.json 只保存 server、ai、limits；网站内容在网页管理"),
        { status: 400 },
      );
    if (value.ai && Object.hasOwn(value.ai, "apiKey"))
      throw Object.assign(
        new Error("API Key 请放在 .env 的 DEEPSEEK_API_KEY 中"),
        { status: 400 },
      );
    return value;
  }
  function persisted(value) {
    const clean = structuredClone(value);
    delete clean.server;
    delete clean.ai;
    delete clean.limits;
    for (const key of Object.keys(clean.navigation)) {
      delete clean.navigation[key].zh;
      delete clean.navigation[key].en;
    }
    return clean;
  }
  function writeSettings(value) {
    db.prepare(
      "INSERT INTO settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
    ).run(JSON.stringify(persisted(value)));
  }
  function get() {
    const row = db.prepare("SELECT value FROM settings WHERE id=1").get(),
      value = mergeDefaults(defaults, row ? JSON.parse(row.value) : {}),
      runtime = readRuntime();
    value.server = mergeDefaults(defaults.server, runtime.server || {});
    value.ai = mergeDefaults(defaults.ai, {
      ...runtime.ai,
      apiKey: env.read().DEEPSEEK_API_KEY || "",
    });
    value.limits = mergeDefaults(defaults.limits, runtime.limits || {});
    for (const [key, field] of [
      ["PORT", "port"],
      ["ADMIN_PORT", "adminPort"],
      ["HOST", "host"],
      ["ADMIN_HOST", "adminHost"],
    ])
      if (process.env[key])
        value.server[field] = ["port", "adminPort"].includes(field)
          ? Number(process.env[key])
          : process.env[key];
    if (value.server.publicUrl === defaults.server.publicUrl)
      value.server.publicUrl = `http://localhost:${value.server.port}`;
    if (value.server.adminUrl === defaults.server.adminUrl)
      value.server.adminUrl = `http://localhost:${value.server.adminPort}`;
    for (const key of Object.keys(defaults.navigation)) {
      value.navigation[key].zh = defaults.navigation[key].zh;
      value.navigation[key].en = defaults.navigation[key].en;
    }
    return validate(value);
  }
  writeSettings(get());
  return {
    env,
    file,
    db,
    get,
    deployment() {
      return {
        overrides: Object.fromEntries(
          ["PORT", "ADMIN_PORT", "HOST", "ADMIN_HOST"]
            .filter((key) => process.env[key])
            .map((key) => [key, process.env[key]]),
        ),
        saved: readRuntime().server,
      };
    },
    save(value) {
      validate(value);
      const before = get();
      if (JSON.stringify(runtimeSettings(value)) !== JSON.stringify(runtimeSettings(before)) || value.ai.apiKey !== before.ai.apiKey)
        throw Object.assign(new Error("部署参数请在 config.json 中修改，密钥请在 .env 中修改"), {status:400});
      writeSettings(value);
      return this.safe();
    },
    safe() {
      const v = get();
      v.ai.apiKey = "";
      v.ai.hasKey = Boolean(this.key());
      return v;
    },
    key: () => env.read().DEEPSEEK_API_KEY || "",
    website: () => persisted(get()),
    close() {
      if (!store) db.close();
    },
  };
}
module.exports = { createConfig, defaults, validate, mergeDefaults, atomicWrite };
