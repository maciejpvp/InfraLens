import { execFileSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const publicDir = join(root, 'site/.cache/public')
const viewer = join(root, 'internal/render/frontend')
const assets = join(publicDir, 'assets')

mkdirSync(assets, { recursive: true })
cpSync(join(root, 'site/showcase'), join(publicDir, 'showcase'), { recursive: true })
cpSync(join(viewer, 'src/assets/brand'), join(assets, 'brand'), { recursive: true })

for (const file of ['AGENT_GUIDE.md', 'docs/images/demo-flow.png', 'docs/images/demo-flow-light.png', 'site/sitemap.xml']) {
  copyFileSync(join(root, file), join(publicDir, file.split('/').at(-1)))
}
copyFileSync(join(viewer, 'dist/viewer.css'), join(assets, 'viewer.css'))
copyFileSync(join(viewer, 'dist/licenses.md'), join(assets, 'viewer-licenses.md'))

const demo = execFileSync('go', ['run', './site/render', 'site/demo.graph.json'], {
  cwd: root,
  maxBuffer: 16 * 1024 * 1024,
})
writeFileSync(join(publicDir, 'demo.html'), demo)
