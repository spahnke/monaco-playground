import { CodeEditor } from "./code-editor.js";

async function main() {
	const editor = await CodeEditor.create(document.querySelector(".editor"), "javascript");
	editor.setContent(`function x() {
	console.log('Hello world!');
}`);
}

main();