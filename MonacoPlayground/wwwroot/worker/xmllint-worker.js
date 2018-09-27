importScripts("/lib/xmllint/xmllint.js");

addEventListener("message", function (e) {
	postMessage({
		id: e.data.id,
		success: true,
		data: xmllint.validateXML({ xml: e.data.code, schema: e.data.schema })
	});
});
