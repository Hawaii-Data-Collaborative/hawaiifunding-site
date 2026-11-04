// Copies the site's data files, built by State-Budget's build_site_data.py, into public/data/,
// where Vite serves them at /data (DATA_URL in src/constants.ts) and copies them into a build.
//
//   npm run copy-data
//
// Reads from SITE_DATA_DIR, or else from "State Budget/Processed Data/site" beside this repo's
// folder (C:\Users\amand\State Budget next to C:\Users\amand\hawaiifunding-site).
import { cpSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(process.env.SITE_DATA_DIR ?? join(root, '..', 'State Budget', 'Processed Data', 'site'))
const target = join(root, 'public', 'data')

if (!existsSync(join(source, 'program', 'list.json'))) {
  console.error(`No site data in ${source}.`)
  console.error('Run python build_site_data.py in State-Budget, or set SITE_DATA_DIR to the folder it wrote.')
  process.exit(1)
}
rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
const built = existsSync(join(source, 'built.txt')) ? readFileSync(join(source, 'built.txt'), 'utf8').trim() : 'unknown date'
console.log(`Copied ${source} -> ${target} (built ${built})`)
