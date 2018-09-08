importScripts("/lib/eslint.js");
var linter = new eslint();

function lint(code, config) {
    return linter.verify(code, config);
}

addEventListener("message", function(e) {
    postMessage({
        id: e.data.id,
        result: lint(e.data.code, e.data.config)
    });
});
