//@ts-nocheck
importScripts("/lib/eslint/eslint.js");
importScripts("/worker/no-id-tostring-in-query.js");

var linter = new eslint.Linter();
NoIdToStringInQuery.register(linter);

addEventListener("message", function (e) {
	postMessage({
		id: e.data.id,
		success: true,
		data: linter.verify(e.data.code, e.data.config)
	});
});
