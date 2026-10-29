const sharp = require("sharp");
const { mergeDefaults } = require("./config");
const { problem } = require("./security");
const maxBytes = 50 * 1024 * 1024;
function makeBackup({ config, content, store }) {
  const result = {
    version: 2,
    createdAt: new Date().toISOString(),
    config: config.website(),
    posts: content.listPosts(true),
    entries: { research: content.entries("research"), knowledge: content.entries("knowledge") },
    images: store.images().map(({name,mime,data}) => ({name,mime,data:Buffer.from(data).toString("base64")})),
  };
  if (result.posts.length > 1000 || result.images.length > 200 || result.entries.research.length > 4000 || result.entries.knowledge.length > 2000 || Buffer.byteLength(JSON.stringify(result)) > maxBytes)
    problem("内容超过网页导出上限（50MB、200 张图片、1000 篇文章、4000 条科研记录、2000 条知识）。可停服后复制 data/site.sqlite 保存完整内容。",413);
  return result;
}
async function restoreBackup({ config, content, store }, b) {
  if (!b || ![1,2].includes(b.version) || !b.config || typeof b.config !== "object" || Array.isArray(b.config) || !Array.isArray(b.posts) || b.posts.length > 1000 || !b.entries || !Array.isArray(b.images) || b.images.length > 200 || Buffer.byteLength(JSON.stringify(b)) > maxBytes)
    problem("备份格式无效或超过容量上限");
  const knowledge = b.entries.knowledge;
  const importedIds = new Set();
  const research = b.version === 1
    ? ["publications","experience"].flatMap(kind => {
      if (!Array.isArray(b.entries[kind]) || b.entries[kind].length > 2000) problem("备份条目格式错误");
      const sourceIds = new Set();
      return b.entries[kind].map(item => {
        if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) || sourceIds.has(item.id)) problem("备份包含无效或重复条目");
        sourceIds.add(item.id);
        let id = item.id, suffix = 1;
        while (importedIds.has(id)) id = `${kind}-${item.id.slice(0,75)}-${suffix++}`;
        importedIds.add(id);
        return {...item,id,type:kind};
      });
    }) : b.entries.research;
  if (!Array.isArray(knowledge) || knowledge.length > 2000 || !Array.isArray(research) || research.length > 4000) problem("备份条目格式错误");
  const images = [], names = new Set();
  for (const img of b.images) {
    if (typeof img?.name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}\.(png|jpe?g|webp)$/i.test(img.name) || names.has(img.name) || typeof img.data !== "string" || !/^[a-zA-Z0-9+/]*={0,2}$/.test(img.data) || img.data.length > 8 * 1024 * 1024)
      problem("备份图片格式错误");
    names.add(img.name);
    const data = Buffer.from(img.data,"base64");
    let mime;
    try {
      const meta = await sharp(data,{limitInputPixels:20000000}).metadata();
      mime = {png:"image/png",jpeg:"image/jpeg",webp:"image/webp"}[meta.format];
      if (!mime) throw new Error("unsupported");
      await sharp(data,{limitInputPixels:20000000}).stats();
    } catch { problem("备份包含无法识别的图片"); }
    images.push({name:img.name,mime,data});
  }
  // Everything below is synchronous and rolls back together if validation fails.
  store.transaction(() => {
    const website = structuredClone(b.config);
    for (const key of ["server","ai","limits"]) delete website[key];
    config.save(mergeDefaults(config.get(),website));
    store.db.exec("DELETE FROM documents; DELETE FROM media;");
    for (const post of b.posts) content.savePost(post);
    for (const [kind,items] of [["research",research],["knowledge",knowledge]]) {
      const ids = new Set();
      for (const item of items) {
        if (!item || typeof item !== "object" || ids.has(item.id)) problem("备份包含无效或重复条目");
        ids.add(item.id);
        const {id,...value} = item;
        content.saveEntry(kind,id,value);
      }
    }
    for (const img of images) store.saveImage(img.name,img.mime,img.data);
  });
}
module.exports = {makeBackup,restoreBackup};
