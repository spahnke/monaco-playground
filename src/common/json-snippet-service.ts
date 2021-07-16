import { ISnippetService, Snippet } from "./snippet-completion-provider.js";

interface JsonSerializedSnippet {
	body: string | string[];
	description: string;
	prefix: string;
	sortText?: string;
}

export class JsonSnippetService implements ISnippetService {
	private snippets: Snippet[] | undefined;

	constructor(private readonly snippetsPath: string) {
	}

	async getSnippets(): Promise<Snippet[]> {
		if (this.snippets)
			return this.snippets;

		this.snippets = [];
		const jsonSnippetObject = await fetch(this.snippetsPath).then(x => x.json()) as Record<string, JsonSerializedSnippet>;
		for (const name in jsonSnippetObject)
			this.snippets.push(this.parseSnippet(name, jsonSnippetObject[name]));
		return this.snippets;
	}

	private parseSnippet(name: string, serializedSnippet: JsonSerializedSnippet): Snippet {
		const { body, description, prefix, sortText } = serializedSnippet;
		return new Snippet(name, prefix, body, description, undefined, undefined, sortText);
	}
}