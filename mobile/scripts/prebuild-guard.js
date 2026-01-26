const args = process.argv.slice(2);
const isClean = args.includes('--clean');
const allowClean = process.env.ALLOW_PREBUILD_CLEAN === '1';

if (isClean && !allowClean) {
  console.error('[prebuild] BLOCKED: "expo prebuild --clean" will remove the widget target.');
  console.error('[prebuild] If you really need a clean prebuild, re-run with:');
  console.error('  ALLOW_PREBUILD_CLEAN=1 npm run prebuild:clean');
  process.exit(1);
}

if (isClean && allowClean) {
  console.warn('[prebuild] WARNING: Clean prebuild will overwrite native iOS files.');
  console.warn('[prebuild] You must re-add the widget target afterward.');
}
