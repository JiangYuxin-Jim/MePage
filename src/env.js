const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { randomUUID } = require("node:crypto");
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, value, { mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function createEnv(root) {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file))
    atomicWrite(file, fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8"));
  return {
    file,
    read() {
      try {
        return parseEnv(fs.readFileSync(file, "utf8"));
      } catch {
        throw Object.assign(new Error("无法读取 .env，请检查文件格式与权限"), {
          status: 400,
        });
      }
    },

  };
}
module.exports = { createEnv, atomicWrite };
