// Desenha os ícones PNG do app sem dependências: fundo verde com a letra G arredondada.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const tabela = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b) => {
  let c = 0xffffffff
  for (const x of b) c = tabela[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo)
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(dados.length)
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(Buffer.concat([t, dados])))
  return Buffer.concat([tam, t, dados, c])
}
const distSeg = (x, y, a, b, c, d) => {
  const dx = c - a, dy = d - b
  const t = Math.max(0, Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - a - t * dx, y - b - t * dy)
}
function png(n) {
  const linhas = Buffer.alloc((n * 4 + 1) * n)
  const s = n / 32
  for (let y = 0; y < n; y++) {
    const o = y * (n * 4 + 1)
    for (let x = 0; x < n; x++) {
      const px = (x + 0.5) / s, py = (y + 0.5) / s
      const d = Math.min(distSeg(px, py, 23, 9, 9, 9), distSeg(px, py, 9, 9, 9, 23), distSeg(px, py, 9, 23, 23, 23), distSeg(px, py, 23, 23, 23, 16), distSeg(px, py, 23, 16, 17, 16))
      const branco = Math.max(0, Math.min(1, (1.7 - d) * s + 0.5))
      const i = o + 1 + x * 4
      linhas[i] = Math.round(11 + (255 - 11) * branco)
      linhas[i + 1] = Math.round(110 + (255 - 110) * branco)
      linhas[i + 2] = Math.round(87 + (255 - 87) * branco)
      linhas[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(n, 0)
  ihdr.writeUInt32BE(n, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', ihdr), bloco('IDAT', deflateSync(linhas)), bloco('IEND', Buffer.alloc(0)),
  ])
}
for (const n of [180, 192, 512]) writeFileSync(`public/icone-${n}.png`, png(n))
