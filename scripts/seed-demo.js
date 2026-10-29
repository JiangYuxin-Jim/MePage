const path = require("node:path");
const { createRuntime } = require("../app");
const { acquireInstanceLock } = require("../src/instance-lock");
const root = path.resolve(process.env.SITE_ROOT || path.join(__dirname,".."));
const release = acquireInstanceLock(root);
let ctx;
try {
  ctx = createRuntime(root);
  ctx.content.seedDemo();
  console.log("已重置为演示内容（包括图片），账号、密钥和调用额度保持不变。未创建备份。");
} catch (error) {
  console.error(`演示内容重置失败：${error.message}`);
  process.exitCode = 1;
} finally {
  ctx?.store.close();
  release();
}
