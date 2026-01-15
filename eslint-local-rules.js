export const noCookieSetOutsideRoutes = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow cookie mutation outside Next.js route handlers",
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const isRouteHandler =
      /[/\\]app[/\\](api|auth)[/\\].*[/\\]route\.(t|j)sx?$/.test(filename);

    if (isRouteHandler) {
      return {};
    }

    const cookieStores = new Set();

    return {
      VariableDeclarator(node) {
        const init = node.init;
        if (
          init &&
          (init.type === "AwaitExpression" || init.type === "CallExpression") &&
          init.callee &&
          init.callee.type === "Identifier" &&
          init.callee.name === "cookies" &&
          node.id.type === "Identifier"
        ) {
          cookieStores.add(node.id.name);
        }
      },
      MemberExpression(node) {
        if (
          node.object &&
          node.object.type === "Identifier" &&
          cookieStores.has(node.object.name) &&
          node.property &&
          node.property.type === "Identifier" &&
          (node.property.name === "set" || node.property.name === "delete")
        ) {
          context.report({
            node,
            message:
              "Do not mutate cookies with cookieStore.{{method}} outside route handlers.",
            data: { method: node.property.name },
          });
        }
      },
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === "MemberExpression" &&
          node.callee.object &&
          node.callee.object.type === "CallExpression" &&
          node.callee.object.callee &&
          node.callee.object.callee.type === "Identifier" &&
          node.callee.object.callee.name === "cookies" &&
          node.callee.property &&
          node.callee.property.type === "Identifier" &&
          (node.callee.property.name === "set" ||
            node.callee.property.name === "delete")
        ) {
          context.report({
            node,
            message:
              "Do not mutate cookies with cookies().{{method}} outside route handlers.",
            data: { method: node.callee.property.name },
          });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-cookie-set-outside-routes": noCookieSetOutsideRoutes,
  },
};
