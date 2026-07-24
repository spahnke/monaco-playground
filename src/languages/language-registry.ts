import { registerLinq } from "./linq/linq.js";
import { registerWat } from "./wat/wat.js";
import { registerJavascriptLanguageExtensions } from "./javascript/javascript-extensions.js";

export function registerLanguages(): void {
	registerLinq();
	registerWat();
	registerJavascriptLanguageExtensions();
}