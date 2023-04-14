import { patchKeybindings, registerPromiseCanceledErrorHandler } from "./common/monaco-utils.js";
import { registerLanguages } from "./languages/language-registry.js";

declare const require: IRequire;

interface IRequire {
	(dependencies: string[], callback: (...resolvedDependecies: any[]) => void): void;
	config(value: IRequireConfig): void;
}

interface IRequireConfig {
	paths?: Record<string, string>;
	"vs/nls"?: {
		availableLanguages: Record<string, string>;
	};
}

type MonacoLocale = "en" | "de" | "es" | "fr" | "it" | "ja" | "ko" | "ru" | "zh-cn" | "zh-tw";

let monacoLoaded: Promise<void> | undefined;

/**
 * Asynchronously loads the Monaco editor sources. Call this once at app start-up and wait for it to complete before doing
 * any Monaco specific operations.
 */
export function loadMonaco(locale: MonacoLocale = "en"): Promise<void> {
	if (monacoLoaded === undefined) {
		const monacoLocale = locale === "en" ? "" : locale; // en is default and must not be explicitly specified (but it makes the API nicer to include it as value)
		monacoLoaded = new Promise<void>(resolve => {
			require.config({ paths: { vs: "lib/monaco-editor/dev/vs" } });
			require.config({
				"vs/nls": {
					availableLanguages: {
						"*": monacoLocale,
					}
				}
			});
			require(["vs/editor/editor.main"], () => {
				registerLanguages();
				registerPromiseCanceledErrorHandler();
				patchKeybindings();
				resolve();
			});
		});
	}
	return monacoLoaded;
}