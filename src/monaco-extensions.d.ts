declare namespace monaco {
	namespace editor {
		//#region Tokenization

		interface ITextModel {
			/** CAUTION: Internal unofficial API */
			readonly tokenization: ITokenizationTextModelPart;
		}

		/** CAUTION: Internal unofficial API */
		interface ITokenizationTextModelPart {
			/**
			 * CAUTION: Internal unofficial API
			 *
			 * Get the tokens for the line `lineNumber`.
			 * The tokens might be inaccurate. Use `forceTokenization` to ensure accurate tokens.
			 */
			getLineTokens(lineNumber: number): ILineTokens;

			/** CAUTION: Internal unofficial API */
			readonly backgroundTokenizationState: number;
		}

		/** CAUTION: Internal unofficial API */
		interface ILineTokens {
			/** CAUTION: Internal unofficial API */
			getCount(): number;
			/** CAUTION: Internal unofficial API */
			getLineContent(): string;
			/** CAUTION: Internal unofficial API */
			getStartOffset(tokenIndex: number): number;
			/** CAUTION: Internal unofficial API */
			getEndOffset(tokenIndex: number): number;
			/** CAUTION: Internal unofficial API (see IEncodedLineTokens in monaco.d.ts) */
			getStandardTokenType(tokenIndex: number): number;
		}

		//#endregion
	}
}