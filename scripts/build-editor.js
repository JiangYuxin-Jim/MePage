const path = require("node:path");
require("esbuild").buildSync({
  entryPoints: [path.join(__dirname, "editor-entry.mjs")],
  bundle: true,
  format: "iife",
  minify: true,
  legalComments: "eof",
  outfile: path.join(__dirname, "../public/admin/editor.js"),
});
