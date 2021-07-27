import { RuleTester } from "eslint";
import rule from "../../src/rules/no-id-tostring-in-query.js";

rule.create = rule.create.bind(rule);

const ruleTester = new RuleTester();
ruleTester.run("no-id-tostring-in-query", rule, {
	valid: [
		{
			code: `linq.execute("asdf");`
		}
	],
	invalid: [
		{
			code: `linq.execute('asdf.id.toString() === "asdf"');`,
			errors: 1
		}
	]
});

// const query = foo + 'a x.id.toString() === "' + foo + `a x.id.toString() !== "${text}" asdf` + foo;
// const query2 = query;
// linq.execute('a x.id.toString() === "asdf" asdf x.id.toString() === "qwer"');
// linq.execute(`a x.id.toString() === "asdf" asdf`);
// linq.execute(`a x.id.toString() === "${text}" asdf`);
// linq.execute(foo + 'a x.id.toString() === "' + foo + '" asdf ' + `a x.id.toString() !== "${text}" asdf ` + foo);
// linq.execute(query);
// linq.execute(query2);