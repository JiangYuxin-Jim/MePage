const fs = require("node:fs");
const { digest, equal, problem } = require("./security");
function createCredentials(config) {
  function read() {
    const env = config.env.read();
    return { username: env.ADMIN_USERNAME ?? "", password: env.ADMIN_PASSWORD ?? "" };
  }
  return {
    sync() {
      const value = read();
      if (!value.username.trim() || !value.password.trim())
        problem("请在 .env 中填写 ADMIN_USERNAME 和非空 ADMIN_PASSWORD");
      if (value.username.length > 128 || value.password.length > 1024)
        problem("账号或密码过长");
    },
    username: () => read().username,
    revision() {
      const stat = fs.statSync(config.env.file);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    },
    async verify(password, username) {
      const expected = read();
      return Boolean(typeof username === "string" && typeof password === "string"
        && username.trim() && password.trim() && expected.username.trim() && expected.password.trim()
        && username.length <= 128 && password.length <= 1024
        && equal(digest(username), digest(expected.username))
        && equal(digest(password), digest(expected.password)));
    },
  };
}
module.exports = { createCredentials };
