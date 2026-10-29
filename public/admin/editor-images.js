(function (root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  else root.siteEditorImages = helpers;
})(typeof window !== "undefined" ? window : this, function () {
  function continueAfterImage(editor) {
    // Both editor modes support inserting paragraph breaks without replacing the document.
    // Never reset the complete Markdown: that loses cursor/undo state and can discard pending edits.
    editor.insertText(editor.isMarkdownMode() ? "\n\n" : "\n");
    editor.focus();
  }
  function insertImageAndContinue(editor, url, alt = "图片", insertImage) {
    editor.focus();
    // Images inserted from Markdown mode must begin a new block, including after
    // a blank WYSIWYG paragraph serialized as raw HTML.
    if (editor.isMarkdownMode()) editor.insertText("\n\n");
    if (insertImage) insertImage(url, alt);
    else editor.exec("addImage", { imageUrl: url, altText: alt });
    continueAfterImage(editor);
  }
  return { continueAfterImage, insertImageAndContinue };
});
