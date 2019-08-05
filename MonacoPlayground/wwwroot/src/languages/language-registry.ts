import { registerLinq } from "./linq/linq.js";
import { registerJavascriptLanguageExtensions } from "./javascript/javascript-extensions.js";

export async function registerLanguages() {
	registerLinq();
	await registerJavascriptLanguageExtensions();
}