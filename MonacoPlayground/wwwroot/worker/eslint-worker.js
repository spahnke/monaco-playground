//@ts-nocheck
importScripts("/lib/eslint/eslint.js");
var linter = new eslint();

addEventListener("message", function (e) {
	postMessage({
		id: e.data.id,
		success: true,
		data: linter.verify(e.data.code, e.data.config)
	});
});
