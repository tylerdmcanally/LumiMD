const path = require('path');

const reactNativeRoot = path.dirname(require.resolve('react-native/package.json'));
const reactNativeJestRoot = path.join(reactNativeRoot, 'jest');

function resolveRef(ref) {
  const modulePath = String(ref).substring(2);
  return path.resolve(reactNativeJestRoot, modulePath);
}

module.exports = function mock(moduleRef, factoryRef) {
  if (factoryRef === undefined) {
    jest.mock(resolveRef(moduleRef));
  } else {
    const mockFactory = resolveRef(factoryRef);
    jest.mock(resolveRef(moduleRef), () => jest.requireActual(mockFactory));
  }
};
