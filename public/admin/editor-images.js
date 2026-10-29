(function (root, factory) {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  else root.siteEditorImages = helpers;
})(typeof window !== "undefined" ? window : this, function () {
  function continueAfterImage(editor) {
    // Both editor modes support inserting paragraph breaks without replacing the document.
    // Never reset the complete Markdown: that loses cursor/undo state and can discard pending edits.
    editor.insertText("\n\n");
    editor.focus();
  }
  function insertImageAndContinue(editor, url, alt = "图片") {
    editor.focus();
    editor.exec("addImage", { imageUrl: url, altText: alt });
    continueAfterImage(editor);
  }
  return { continueAfterImage, insertImageAndContinue };
});
