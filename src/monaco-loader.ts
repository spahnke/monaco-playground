import { patchKeybindings, registerPromiseCanceledErrorHandler } from "./common/monaco-utils.js";
import { registerLanguages } from "./languages/language-registry.js";

type MonacoLocale = "en" | "cs" | "de" | "es" | "fr" | "it" | "ja" | "ko" | "pl" | "pt-br" | "ru" | "tr" | "zh-cn" | "zh-tw";

/**
 * Asynchronously loads the Monaco editor sources. Call this once at app start-up and wait for it to complete before doing
 * any Monaco specific operations.
 */
export async function loadMonaco(locale: MonacoLocale = "en"): Promise<void> {
	const monacoLocale = locale === "en" ? "" : locale; // en is default and must not be explicitly specified (but it makes the API nicer to include it as value)
	const monacoScript = "/lib/monaco-editor/index.js";
	if (monacoLocale !== "") {
		await import(`/lib/monaco-editor/nls.messages.${monacoLocale}.js`);
	}
	// NOTE Using a variable to avoid TS errors because this module only exists at runtime and using interpolation to
	// prevent any bundler from trying to inline import the file here.
	await import(`${monacoScript}`);
	registerLanguages();
	registerPromiseCanceledErrorHandler();
	patchKeybindings();
}