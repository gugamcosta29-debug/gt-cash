// Testa, compila com o .env local e envia a pasta dist para a branch gh-pages, que o GitHub Pages serve.
import { execSync } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'

const rodar = (cmd, cwd = '.') => execSync(cmd, { cwd, stdio: 'inherit' })
const destino = execSync('git remote get-url origin').toString().trim()

if (!existsSync('.env')) throw new Error('Falta o .env com os dados do Supabase.')
rodar('npm test')
rodar('npm run build')

writeFileSync('dist/.nojekyll', '')
rmSync('dist/.git', { recursive: true, force: true })
rodar('git init -q -b gh-pages', 'dist')
rodar('git add -A', 'dist')
const autor = (campo) => execSync(`git config user.${campo}`).toString().trim()
rodar(`git -c user.name="${autor('name')}" -c user.email="${autor('email')}" commit -q -m "Publica"`, 'dist')
rodar(`git push -f ${destino} gh-pages`, 'dist')
rmSync('dist/.git', { recursive: true, force: true })
