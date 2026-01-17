const ErrorUtils = {
  applyWithGuard: (fn, context, args) => fn.apply(context, args || []),
  applyWithGuardIfNeeded: (fn, context, args) => fn.apply(context, args || []),
  getGlobalHandler: () => () => {},
  guard: (fn) => fn,
  inGuard: () => false,
  reportError: () => {},
  reportFatalError: () => {},
  setGlobalHandler: () => {},
};

module.exports = ErrorUtils;
module.exports.default = ErrorUtils;
