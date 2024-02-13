import { RuleTester } from "eslint";
import rule from "../../src/rules/no-id-tostring-in-query.js";

rule.create = rule.create.bind(rule);

const ruleTester = new RuleTester({
	// TODO remove this once we can adopt ESLint 9 top-level in the repo
	parserOptions: { ecmaVersion: 2015 },
});
ruleTester.run("no-id-tostring-in-query", rule, {
	valid: [
		{
			code: `linq.execute("asdf");`,
		},
		{
			code: "linq.execute(`asdf`);",
		},
		{
			code: `linq.execute('a x.foo.toString() === "asdf"');`,
		},
		{
			code: 'linq.execute(`a x.foo.toString() === "asdf"`);',
		},
	],
	invalid: [
		// single quotes
		{
			code: `linq.execute('a x.id.toString() === "asdf"');`,
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.id === new Guid("asdf")');`, messageId: "convertToGuid" }] }],
		},
		{
			code: `linq.execute('a x.Id.toString() === "asdf"');`,
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.Id === new Guid("asdf")');`, messageId: "convertToGuid" }] }],
		},
		{
			code: `linq.execute('a x.iD.toString() === "asdf"');`,
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.iD === new Guid("asdf")');`, messageId: "convertToGuid" }] }],
		},
		{
			code: `linq.execute('a x.ID.toString() === "asdf"');`,
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.ID === new Guid("asdf")');`, messageId: "convertToGuid" }] }],
		},
		{
			code: `linq.execute('a x.fooId.toString() === "asdf"');`,
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 46, type: "Literal", suggestions: [{ output: `linq.execute('a x.fooId === new Guid("asdf")');`, messageId: "convertToGuid" }] }],
		},
		{
			code: `linq.execute('a x.id.toString() === "asdf" asdf x.id.toString() === "qwer"');`,
			errors: [
				{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "Literal", suggestions: [{ output: `linq.execute('a x.id === new Guid("asdf") asdf x.id.toString() === "qwer"');`, messageId: "convertToGuid" }] },
				{ messageId: "possibleConversion", column: 51, endColumn: 75, type: "Literal", suggestions: [{ output: `linq.execute('a x.id.toString() === "asdf" asdf x.id === new Guid("qwer")');`, messageId: "convertToGuid" }] },
			],
		},
		// template strings
		{
			code: 'linq.execute(`a x.id.toString() === "asdf" asdf`);',
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 43, type: "TemplateLiteral", suggestions: [{ output: 'linq.execute(`a x.id === new Guid("asdf") asdf`);', messageId: "convertToGuid" }] }],
		},
		{
			code: 'linq.execute(`a x.id.toString() === "${text}" asdf`);',
			errors: [{ messageId: "possibleConversion", column: 19, endColumn: 46, type: "TemplateLiteral", suggestions: [{ output: 'linq.execute(`a x.id === new Guid("${text}") asdf`);', messageId: "convertToGuid" }] }],
		},
		// concatenated string
		{
			code: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id.toString() !== "\${text}" asdf \` + foo);`,
			errors: [
				{ messageId: "possibleConversion", column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{ messageId: "possibleConversion", column: 71, endColumn: 98, type: "TemplateLiteral", suggestions: [{ output: `linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + \`a x.id !== new Guid("\${text}") asdf \` + foo);`, messageId: "convertToGuid" }] },
			],
		},
		// intermediate variable
		{
			code: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
linq.execute(query);
`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 1, column: 26, endColumn: 45, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 1, column: 60, endColumn: 87, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
linq.execute(query);
`.trim()
						}
					]
				},
			],
		},
		{
			code: `
var query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
linq.execute(query);
`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 1, column: 24, endColumn: 43, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 1, column: 58, endColumn: 85, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
var query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
linq.execute(query);
`.trim()
						}
					]
				},
			],
		},
		{
			code: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
const query2 = query;
linq.execute(query2);
`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 1, column: 26, endColumn: 45, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 1, column: 60, endColumn: 87, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
const query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
const query2 = query;
linq.execute(query2);
`.trim()
						}
					]
				},
			],
		},
		{
			code: `
/* let/const in block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	linq.execute(query);
}`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
/* let/const in block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	linq.execute(query);
}`.trim()
						}
					]
				},
			],
		},
		{
			code: `
/* let/const in nested block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
/* let/const in nested block */
{
	let query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim()
						}
					]
				},
			],
		},
		{
			code: `
/* var in block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	linq.execute(query);
}`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
/* var in block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	linq.execute(query);
}`.trim()
						}
					]
				},
			],
		},
		{
			code: `
/* var in nested block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id.toString() !== "\${text}" asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim(),
			errors: [
				{ messageId: "possibleConversion", line: 3, column: 25, endColumn: 44, type: "Literal", suggestions: [] },
				{
					messageId: "possibleConversion", line: 3, column: 59, endColumn: 86, type: "TemplateLiteral",
					suggestions: [
						{
							messageId: "convertToGuid",
							output: `
/* var in nested block */
{
	var query = foo + 'a x.id.toString() === "' + foo + \`a x.id !== new Guid("\${text}") asdf\` + foo;
	{
		linq.execute(query);
	}
}`.trim()
						}
					]
				},
			],
		},
	]
});
