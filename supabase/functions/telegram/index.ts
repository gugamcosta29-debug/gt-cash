// Publicada no Supabase como função "telegram", com a verificação de JWT desligada:
// quem chama é o Telegram, autenticado pelo segredo do webhook. Gerar o arquivo único: npm run bot.
import { tratar } from './bot'

declare const Deno: { env: { get(nome: string): string | undefined }; serve(f: (r: Request) => Promise<Response>): void }

const supabaseUrl = Deno.env.get('SUPABASE_URL')!

Deno.serve((req) => tratar(req, {
  supabaseUrl,
  chaveServico: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  tokenBot: Deno.env.get('TELEGRAM_BOT_TOKEN')!,
  urlFuncao: `${supabaseUrl}/functions/v1/telegram`,
}))
