/** Whether ESLint is enabled in JavaScript sources. True if flag NOT present. */
export const eslintEnabled = localStorage.getItem("monaco-no-eslint") === null;

/** Whether semantic diagnostics are enabled in JavaScript sources. True if flag NOT present. */
export const semanticDiagnosticsEnabled = localStorage.getItem("monaco-no-semantic") === null;

/** Whether suggestion diagnostics are enabled in JavaScript sources. True if flag NOT present. */
export const suggestionDiagnosticsEnabled = localStorage.getItem("monaco-no-suggestion") === null;

/** Whether strict diagnostics are enabled in JavaScript sources. True if flag IS present. */
export const strictDiagnosticsEnabled = localStorage.getItem("monaco-strict") !== null;