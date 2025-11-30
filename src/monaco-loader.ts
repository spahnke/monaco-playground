import { patchKeybindings, registerPromiseCanceledErrorHandler } from "./common/monaco-utils.js";
import { registerLanguages } from "./languages/language-registry.js";

type MonacoLocale = "en" | "cs" | "de" | "es" | "fr" | "it" | "ja" | "ko" | "pl" | "pt-br" | "ru" | "tr" | "zh-cn" | "zh-tw";

/**
 * Asynchronously loads the Monaco editor sources. Call this once at app start-up and wait for it to complete before doing
 * any Monaco specific operations.
 */
export async function loadMonaco(locale: MonacoLocale = "en"): Promise<void> {
	if (locale !== "en") {
		await import(`/lib/monaco-editor/nls.messages.${locale}.js`);
	}
	// NOTE Using a variable a) avoid TS errors because this module only exists at runtime and b) to prevent any bundler
	// from trying to inline import the file here.
	const monacoScript = "/lib/monaco-editor/index.js";
	await import(monacoScript);
	registerLanguages();
	registerPromiseCanceledErrorHandler();
	patchKeybindings();
}