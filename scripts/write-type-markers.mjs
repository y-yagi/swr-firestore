// The root package.json has no "type" field, so Node treats every .js file as
// CommonJS. The ESM build needs its own marker to be loaded as ESM.
import { writeFileSync } from 'node:fs'

writeFileSync(
  'lib/cjs/package.json',
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
)
writeFileSync(
  'lib/esm/package.json',
  JSON.stringify({ type: 'module' }, null, 2) + '\n',
)
