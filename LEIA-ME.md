# G&T Cash

Mostra quanto dá para gastar, o que vence e para onde vai o que sobra. Cada pessoa tem sua conta, e a visão **Nós** soma as duas.

## Ver funcionando agora

Sem configurar nada, o app abre em modo de exemplo, com dados fictícios salvos só no navegador:

```
npm install
npm run dev
```

## Colocar no ar com contas de verdade

1. Crie uma conta gratuita em supabase.com e um projeto novo. Guarde a senha do banco num lugar seguro.
2. No projeto, abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings > API**, copie a **Project URL** e a chave pública (**anon** ou **publishable**). Nunca use a `service_role`.
4. Copie `.env.example` para `.env` e preencha os dois valores. Rode `npm run dev` e crie sua conta.
5. Para publicar, crie o repositório, ative **Settings > Pages > Source: Deploy from a branch** (branch `gh-pages`) e rode `npm run publicar`. O código fica público no plano gratuito do GitHub, mas não contém dados nem senhas.
6. Em **Authentication > URL Configuration** no Supabase, informe o endereço publicado.

No celular, abra o endereço e use **Adicionar à tela inicial**.

## Vincular com a outra pessoa

Em **Ajustes > Conta conjunta**, um gera o código e o outro digita. Os dois passam a ver tudo um do outro, mas cada um só altera o que é seu. O vínculo pode ser desfeito a qualquer momento.

## Comandos de conferência

- `npm test`: cálculos, importação e permissões do banco (Postgres local com o `schema.sql`).
- `npm run build`, depois `npx vite preview --port 4199`, depois `npm run conferir-tela`: usa o app no Chrome e salva capturas em `.impeccable/review`.

## Como os números são calculados

- **Dá para gastar** = renda (a maior entre prevista e recebida) − gastos à vista − fatura que vence no mês − contas fixas por pagar − guardado no mês.
- **Compra no cartão** conta no mês de vencimento da fatura. Compra feita no dia do fechamento ou depois entra na fatura seguinte.
- **Reserva** = meses escolhidos × gasto médio dos últimos 3 meses. Conta o que estiver marcado como reserva em Investimentos.
- **Investimentos** são estimativas: CDI atual aplicado a todo o período, com IR regressivo. Cripto usa a cotação da CoinGecko. Não substituem o saldo do banco.
- **Patrimônio** = contas + metas + investimentos − cartão em aberto. O gráfico histórico usa o valor aplicado dos investimentos.

## Limitações

- O Supabase gratuito pausa após cerca de 7 dias sem uso. Reative no painel e baixe o backup em **Ajustes** de vez em quando.
- Avisos só aparecem com o app aberto.
- Valor de conta fixa é o cadastrado: se a luz variar, ajuste antes de marcar como paga.
