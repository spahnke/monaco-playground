import { registerLinq } from "./linq/linq.js";
import { registerJavascriptLanguageExtensions } from "./javascript/javascript-extensions.js";

export function registerLanguages(): void {
	registerLinq();
	registerJavascriptLanguageExtensions();
}