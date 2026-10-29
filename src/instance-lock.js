const fs = require("node:fs");
const path = require("node:path");
const lockfile = require("proper-lockfile");
function acquireInstanceLock(root) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true, mode: 0o700 });
  try {
    return lockfile.lockSync(root, {
      lockfilePath: path.join(root, "data/instance.lock"),
      stale: 10000,
      update: 2000,
      onCompromised() {
        console.error("数据目录锁已失效，停止服务以保护数据。");
        process.exit(1);
      },
    });
  } catch (error) {
    if (error.code === "ELOCKED")
      throw new Error(
        "此数据目录已有服务在运行，或上次异常退出的锁尚未过期。请停止旧服务，或等待 10 秒后重试。",
      );
    throw error;
  }
}
module.exports = { acquireInstanceLock };
