import { Linter, Rule } from "./node_modules/@types/eslint/index";
import { CallExpression, Identifier, Literal, MemberExpression, Node } from "./node_modules/@types/estree/index";

class NoIdToStringInQuery implements Rule.RuleModule {
	static register(linter: Linter) {
		linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
	}

	create(context: Rule.RuleContext): Rule.RuleListener {
		return {
			CallExpression: (node: Node) => {
				const callExpression = node as CallExpression;
				if (!this.isQuery(callExpression))
					return;

				const argument = callExpression.arguments[0];
				if (argument.type === "Literal")
					this.handleQueryLiteral(context, argument as Literal);
			}
		};
	}

	private isQuery(callExpression: CallExpression): boolean {
		if (callExpression.callee.type !== "MemberExpression" || callExpression.arguments.length === 0)
			return false;

		const memberExpression = callExpression.callee as MemberExpression;
		if (memberExpression.object.type !== "Identifier" || memberExpression.property.type !== "Identifier")
			return false;

		const object = memberExpression.object as Identifier;
		const property = memberExpression.property as Identifier;
		if (object.name !== "linq" || property.name !== "execute" && property.name !== "executeWritable")
			return false;

		return true;
	}

	private handleQueryLiteral(context: Rule.RuleContext, literal: Literal) {
		if (typeof literal.value !== "string")
			return;

		if (!/id\.toString\(\)/i.test(literal.value))
			return;

		context.report(this.getDiagnostic(literal));
	}

	private getDiagnostic(node: Node): Rule.ReportDescriptor {
		return {
			message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
			node
		};
	}
}
