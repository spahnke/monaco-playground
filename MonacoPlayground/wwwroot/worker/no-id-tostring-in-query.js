var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var NoIdToStringInQuery = /** @class */ (function () {
    function NoIdToStringInQuery() {
    }
    NoIdToStringInQuery.register = function (linter) {
        linter.defineRule("no-id-tostring-in-query", new NoIdToStringInQuery());
    };
    NoIdToStringInQuery.prototype.create = function (context) {
        var _this = this;
        return {
            Literal: function (node) {
                var literal = node;
                var parent = literal.parent;
                while (parent) {
                    if (parent.type === "CallExpression" && _this.isQuery(parent)) {
                        _this.reportStringLiteral(context, literal);
                        return;
                    }
                    parent = parent.parent;
                }
            },
            Identifier: function (node) {
                var identifier = node;
                var parent = identifier.parent;
                while (parent) {
                    if (parent.type === "CallExpression" && _this.isQuery(parent)) {
                        _this.reportVariable(context, identifier);
                        return;
                    }
                    parent = parent.parent;
                }
            }
        };
    };
    NoIdToStringInQuery.prototype.isQuery = function (callExpression) {
        if (callExpression.callee.type !== "MemberExpression")
            return false;
        var memberExpression = callExpression.callee;
        if (memberExpression.object.type !== "Identifier" || memberExpression.property.type !== "Identifier")
            return false;
        var object = memberExpression.object;
        var method = memberExpression.property;
        if (object.name !== "linq" || method.name !== "execute" && method.name !== "executeWritable" || callExpression.arguments.length === 0)
            return false;
        return true;
    };
    NoIdToStringInQuery.prototype.reportStringLiteral = function (context, literal) {
        if (typeof literal.value !== "string")
            return;
        var regex = /id\.toString\(\)/gi;
        var match = regex.exec(literal.value);
        while (match !== null) {
            context.report(this.getDiagnostic(literal, this.computeLocationInsideLiteral(literal, match)));
            match = regex.exec(literal.value);
        }
    };
    NoIdToStringInQuery.prototype.reportVariable = function (context, identifier) {
        var declarator = this.getVariableDeclarator(context, identifier);
        if (!declarator || !declarator.init)
            return;
        if (declarator.init.type === "Literal")
            this.reportStringLiteral(context, declarator.init);
        else if (declarator.init.type === "Identifier")
            this.reportVariable(context, declarator.init);
    };
    NoIdToStringInQuery.prototype.computeLocationInsideLiteral = function (literal, match) {
        if (!literal.loc)
            return undefined;
        var location = {
            start: __assign({}, literal.loc.start),
            end: __assign({}, literal.loc.end),
        };
        var offset = match.index + 1; // literal starts with `"` so we need to add 1
        var columnStart = location.start.column + offset;
        location.start.column = columnStart;
        location.end.column = columnStart + match[0].length;
        return location;
    };
    NoIdToStringInQuery.prototype.getVariableDeclarator = function (context, identifier) {
        var scope = context.getScope();
        var variable = scope.set.get(identifier.name);
        if (!variable)
            return undefined;
        var definition = variable.defs[0];
        if (!definition)
            return undefined;
        var declarator = definition.node;
        if (declarator.type !== "VariableDeclarator")
            return undefined;
        return declarator;
    };
    NoIdToStringInQuery.prototype.getDiagnostic = function (node, loc) {
        return {
            message: "Possible conversion of `uniqueidentifier` to `string`. This could impact performance.",
            node: node,
            loc: loc
        };
    };
    return NoIdToStringInQuery;
}());
