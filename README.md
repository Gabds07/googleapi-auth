# STAR//GUARD — login Google + arcade pixel art

Aplicação Node/Express baseada no projeto original de autenticação Google. Após uma sessão Google válida, o usuário entra numa cabine arcade com um shooter vertical de cinco fases.

## Executar

Requer Node.js 22 ou superior e pnpm 11. Instale as dependências e inicie o servidor:

```bash
pnpm install --frozen-lockfile
pnpm start
```

Configure `GOOGLE_CLIENT_ID` no ambiente do servidor (ou em um `.env` local baseado em `.env.example`) e autorize a origem HTTPS no console OAuth do Google. O arquivo `.env` não deve ser distribuído. A sessão usa cookie `Secure; SameSite=None`, portanto o login requer HTTPS — por exemplo, Preview HTTPS ou uma implantação HTTPS; abrir diretamente em HTTP local pode impedir o envio do cookie.

## Jogo

O jogo só é liberado após autenticação. Na tela de instruções, o jogador confirma em **OK, COMEÇAR**. **W/A/S/D** movem, **J** dispara e **P** pausa. Em telas touch, há botões na interface.

- Fase 1: aliens; cada alien abatido soma 100 pontos.
- Fase 2: aliens e naves que disparam a cada 2,5 segundos.
- Fase 3: aliens, naves e meteoros destrutíveis.
- Fase 4: aliens, naves, meteoros, estrelas cadentes e naves maiores que disparam dois projéteis a cada 1,5 segundo. O reforço de tiro duplo surge no final da fase.
- Fase 5: chefe final com salvas de três projéteis.

Há três vidas, cronômetro, pausa, tela de vitória/derrota e placar final. O placar é da partida atual; a aplicação original não tem armazenamento persistente de partidas.

Verificação de sintaxe: `pnpm run check`.
