var jsCode = [
	'"use strict";',
	'function Person(age) {',
	'	if (age) {',
	'		this.age = age;',
	'	}',
	'}',
	'Person.prototype.getAge = function () {',
	'	return this.age;',
	'};'
].join('\n');

var editor = monaco.editor.create(document.getElementById("container"), {
	value: jsCode,
	language: "javascript",
	glyphMargin: true
});

var decorations = editor.deltaDecorations([], [
	{
		range: new monaco.Range(2, 1, 2, 1),
		options: {
			glyphMarginClassName: 'codicon codicon-debug-breakpoint breakpoint breakpoint-hint',
		}
	},
	{
		range: new monaco.Range(3, 1, 3, 1),
		options: {
			glyphMarginClassName: 'codicon codicon-debug-breakpoint breakpoint',
		}
	},
	{
		range: new monaco.Range(4, 1, 4, 1),
		options: {
			isWholeLine: true,
			className: 'line',
			glyphMarginClassName: 'codicon codicon-debug-stackframe breakpoint-current',
		}
	},
	{
		range: new monaco.Range(8, 1, 8, 1),
		options: {
			isWholeLine: true,
			className: 'line',
			glyphMarginClassName: 'codicon codicon-debug-stackframe current',
		}
	},
]);