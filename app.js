const fs = require("node:fs");
const path = require("node:path");
const { createConfig } = require("./src/config");
const { createStore } = require("./src/store");
const { createContent } = require("./src/content");
const { createChat } = require("./src/chat");
const { createPublicApp } = require("./src/public-app");
const { createAdminApp } = require("./src/admin-app");
const { token } = require("./src/security");
const { acquireInstanceLock } = require("./src/instance-lock");
const { createCredentials } = require("./src/credentials");
function createRuntime(
  root = path.resolve(process.env.SITE_ROOT || __dirname),
) {
  fs.mkdirSync(root, { recursive: true });
  const store = createStore(path.join(root, "data")),
    config = createConfig(root, store);
  if (!store.meta("secret")) store.meta("secret", token());
  const content = createContent(root, store, config);
  const ctx = { root, config, store, content };
  ctx.credentials = createCredentials(config);
  ctx.chat = createChat(ctx);
  ctx.publicApp = createPublicApp(ctx);
  ctx.adminApp = createAdminApp(ctx);
  return ctx;
}
async function start() {
  const root = path.resolve(process.env.SITE_ROOT || __dirname);
  fs.mkdirSync(path.join(root, "data"), { recursive: true, mode: 0o700 });
  const releaseLock = acquireInstanceLock(root);
  let ctx;
  const servers = [];
  let timer;
  const cleanup = () => {
    clearInterval(timer);
    for (const s of servers) s.close();
    ctx?.store.close();
    releaseLock();
  };
  try {
    ctx = createRuntime(root);
    await ctx.credentials.sync();
    const cfg = ctx.config.get();
    const overrides = Object.keys(ctx.config.deployment().overrides);
    if (overrides.length)
      console.log(`启动参数正在覆盖 config.json：${overrides.join("、")}`);
    const port = Number(process.env.PORT || cfg.server.port),
      adminPort = Number(process.env.ADMIN_PORT || cfg.server.adminPort);
    if (
      ![port, adminPort].every(
        (p) => Number.isInteger(p) && p >= 1024 && p <= 65535,
      ) ||
      port === adminPort
    )
      throw new Error("前后台端口需为不同的 1024–65535 整数。");
    for (const [app, p, host, label] of [
      [ctx.publicApp, port, process.env.HOST || cfg.server.host, "前台"],
      [
        ctx.adminApp,
        adminPort,
        process.env.ADMIN_HOST || cfg.server.adminHost,
        "管理端",
      ],
    ])
      await new Promise((resolve, reject) => {
        const s = app.listen(p, host, (error) => {
          if (error) return reject(error);
          console.log(
            `${label}已启动：http://${host === "0.0.0.0" ? "localhost" : host}:${p}`,
          );
          resolve();
        });
        servers.push(s);
        s.once("error", reject);
      });
    timer = setInterval(() => ctx.store.cleanup(), 3600000);
    timer.unref();
    ctx.store.cleanup();
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        cleanup();
        process.exit(0);
      });
  } catch (e) {
    cleanup();
    if (e.code === "EADDRINUSE")
      throw new Error(
        "端口被占用，请修改 config.json 中的 server.port / server.adminPort 后重试。",
      );
    throw e;
  }
}
if (require.main === module)
  start().catch((e) => {
    console.error(`启动失败：${e.message}`);
    process.exitCode = 1;
  });
module.exports = { createRuntime, start };
