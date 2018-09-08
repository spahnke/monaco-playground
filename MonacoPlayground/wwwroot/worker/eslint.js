importScripts("/lib/eslint/eslint.js");
var linter = new eslint();

addEventListener("message", function(e) {
    postMessage({
        id: e.data.id,
        messages: linter.verify(e.data.code, e.data.config)
    });
});
