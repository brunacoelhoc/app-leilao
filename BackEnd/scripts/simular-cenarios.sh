#!/bin/bash
# Simulacao dos cenarios da apresentacao contra a API no ar (padrao: Docker em localhost:3000).
# Cria usuarios/leiloes/lances de teste (sufixo aleatorio) e confere o codigo HTTP de cada regra.
# Uso (Git Bash / Linux):  bash BackEnd/scripts/simular-cenarios.sh   (ou API=http://host:3000/api ...)
# Precisa do admin do seed (admin@belleepoque.com) e de curl. Termina com "FALHAS: 0" quando tudo confere.
cd "$(dirname "$0")/../.."
K=$(grep -o 'apiKey: "[^"]*"' FrontEnd/src/app/core/environment.ts | cut -d'"' -f2)
B=${API:-http://localhost:3000/api}
RAIZ_DOCS=${B%/api}
SUF=$RANDOM
OUT="$TMP/sim_body.txt"
FALHAS=0

# req "rotulo" esperado METODO url [args curl...]
req() {
  local rotulo="$1" esperado="$2"; shift 2
  local cod
  cod=$(curl -s -o "$OUT" -w "%{http_code}" -X "$@")
  if [ "$cod" = "$esperado" ]; then printf "  OK   %-62s %s\n" "$rotulo" "$cod"; else printf "  FALHA %-61s %s (esperado %s) -> %s\n" "$rotulo" "$cod" "$esperado" "$(head -c 160 "$OUT")"; FALHAS=$((FALHAS+1)); fi
}
json() { grep -o "\"$1\":\"[^\"]*\"" "$OUT" | head -1 | cut -d'"' -f4; }
login() { curl -s -H "x-api-key: $K" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"senha\":\"$2\"}" $B/auth/login | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4; }
AK="x-api-key: $K"; CT='Content-Type: application/json'

echo "== Preparacao"
TA=$(login admin@belleepoque.com 'Admin@123!'); AA="Authorization: Bearer $TA"
req "admin cria vendedor S1" 201 POST $B/users -H "$AK" -H "$AA" -H "$CT" -d "{\"nome\":\"Lucia Sim $SUF\",\"email\":\"s1.$SUF@sim.com\",\"senha\":\"Demo@12345\",\"papel\":\"SELLER\"}"; S1ID=$(json id)
req "admin cria vendedor S2" 201 POST $B/users -H "$AK" -H "$AA" -H "$CT" -d "{\"nome\":\"Ricardo Sim $SUF\",\"email\":\"s2.$SUF@sim.com\",\"senha\":\"Demo@12345\",\"papel\":\"SELLER\"}"; S2ID=$(json id)
req "admin cria comprador B" 201 POST $B/users -H "$AK" -H "$AA" -H "$CT" -d "{\"nome\":\"Paulo Sim $SUF\",\"email\":\"b.$SUF@sim.com\",\"senha\":\"Demo@12345\",\"papel\":\"BIDDER\"}"; BID=$(json id)
T1=$(login s1.$SUF@sim.com Demo@12345); A1="Authorization: Bearer $T1"
T2=$(login s2.$SUF@sim.com Demo@12345); A2="Authorization: Bearer $T2"
TB=$(login b.$SUF@sim.com Demo@12345); AB="Authorization: Bearer $TB"
CAT=$(curl -s -H "$AK" "$B/categories?limite=100" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
INI=$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ); FIM=$(date -u -d '1 day' +%Y-%m-%dT%H:%M:%SZ)

echo "== Autenticacao e chave da API"
req "sem X-API-KEY em rota publica" 401 GET $B/auctions
req "com chave, rota publica sem login" 200 GET $B/auctions -H "$AK"
req "login com senha errada" 401 POST $B/auth/login -H "$AK" -H "$CT" -d '{"email":"admin@belleepoque.com","senha":"Errada@123"}'
req "rota protegida sem token" 401 GET $B/users -H "$AK"
req "rota de admin com token de comprador" 403 GET $B/users -H "$AK" -H "$AB"
req "docs do Swagger sem chave" 200 GET $RAIZ_DOCS/docs
req "publico: destaques / ranking / institucional" 200 GET $B/ranking/vendedores -H "$AK"

echo "== Papeis: quem pode criar o que"
req "comprador NAO cria leilao" 403 POST $B/auctions -H "$AK" -H "$AB" -H "$CT" -d "{\"titulo\":\"Nao pode\",\"dataInicio\":\"$INI\",\"dataFim\":\"$FIM\"}"
req "ADMIN NAO cria leilao (so vendedor)" 403 POST $B/auctions -H "$AK" -H "$AA" -H "$CT" -d "{\"titulo\":\"Nao pode\",\"dataInicio\":\"$INI\",\"dataFim\":\"$FIM\"}"
req "leilao com fim antes do inicio" 400 POST $B/auctions -H "$AK" -H "$A1" -H "$CT" -d "{\"titulo\":\"Datas erradas\",\"dataInicio\":\"$FIM\",\"dataFim\":\"$INI\"}"
req "vendedor S1 cria leilao" 201 POST $B/auctions -H "$AK" -H "$A1" -H "$CT" -d "{\"titulo\":\"Leilao Sim $SUF\",\"descricao\":\"Simulacao\",\"dataInicio\":\"$INI\",\"dataFim\":\"$FIM\"}"; LID=$(json id)
req "nasce como rascunho (DRAFT)" 200 GET $B/auctions/$LID -H "$AK"; grep -o '"status":"[A-Z]*"' "$OUT" | head -1
req "vendedor S1 cria item (ViaCEP real)" 201 POST $B/auction-items -H "$AK" -H "$A1" -H "$CT" -d "{\"titulo\":\"Oratorio Sim\",\"descricao\":\"Peca de simulacao\",\"precoInicial\":800,\"incrementoMinimo\":50,\"cep\":\"01310100\",\"leilaoId\":\"$LID\",\"categoriaId\":\"$CAT\"}"; IID=$(json id)
req "CEP inexistente e recusado" 400 POST $B/auction-items -H "$AK" -H "$A1" -H "$CT" -d "{\"titulo\":\"Oratorio CEP\",\"precoInicial\":800,\"incrementoMinimo\":50,\"cep\":\"00000000\",\"leilaoId\":\"$LID\",\"categoriaId\":\"$CAT\"}"
req "outro vendedor S2 NAO mexe no leilao do S1 (item)" 403 POST $B/auction-items -H "$AK" -H "$A2" -H "$CT" -d "{\"titulo\":\"Invasor\",\"precoInicial\":800,\"incrementoMinimo\":50,\"cep\":\"01310100\",\"leilaoId\":\"$LID\",\"categoriaId\":\"$CAT\"}"
req "outro vendedor S2 NAO muda status do leilao do S1" 403 PATCH $B/auctions/$LID/status -H "$AK" -H "$A2" -H "$CT" -d '{"status":"SCHEDULED"}'
req "vendedor NAO cria categoria" 403 POST $B/categories -H "$AK" -H "$A1" -H "$CT" -d '{"nome":"Nao pode","descricao":"x"}'

echo "== Maquina de estados do leilao"
req "DRAFT -> OPEN direto e proibido" 409 PATCH $B/auctions/$LID/status -H "$AK" -H "$A1" -H "$CT" -d '{"status":"OPEN"}'
req "cancelar sem motivo" 400 PATCH $B/auctions/$LID/status -H "$AK" -H "$A1" -H "$CT" -d '{"status":"CANCELED"}'
req "lance em leilao ainda rascunho" 409 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":800}'
req "DRAFT -> SCHEDULED" 200 PATCH $B/auctions/$LID/status -H "$AK" -H "$A1" -H "$CT" -d '{"status":"SCHEDULED"}'
req "SCHEDULED -> OPEN" 200 PATCH $B/auctions/$LID/status -H "$AK" -H "$A1" -H "$CT" -d '{"status":"OPEN"}'
req "editar leilao fora de rascunho" 409 PATCH $B/auctions/$LID -H "$AK" -H "$A1" -H "$CT" -d '{"titulo":"Mudei"}'
req "remover leilao fora de rascunho" 409 DELETE $B/auctions/$LID -H "$AK" -H "$A1"

echo "== Lances (regra de negocio central)"
req "lance sem login" 401 POST $B/auction-items/$IID/bids -H "$AK" -H "$CT" -d '{"valor":800}'
req "vendedor dono NAO da lance" 403 POST $B/auction-items/$IID/bids -H "$AK" -H "$A1" -H "$CT" -d '{"valor":900}'
req "ADMIN NAO da lance (o admin so modera)" 403 POST $B/auction-items/$IID/bids -H "$AK" -H "$AA" -H "$CT" -d '{"valor":900}'
req "valor negativo" 400 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":-5}'
req "valor com 3 casas decimais" 400 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":800.123}'
req "abaixo do preco inicial" 409 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":100}'
req "lance valido (= preco inicial)" 201 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":800}'
req "mesmo valor de novo" 409 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":800}'
req "abaixo de atual + incremento" 409 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":820}'
req "lance valido (atual + incremento)" 201 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":850}'
req "historico publico de lances" 200 GET $B/auction-items/$IID/bids -H "$AK"
req "item traz lance atual/minimo/sugeridos" 200 GET $B/auction-items/$IID -H "$AK"; grep -o '"lanceAtual":"[^"]*"\|"lanceMinimo":"[^"]*"\|"situacao":"[^"]*"' "$OUT" | tr '\n' ' '; echo
req "VENDEDOR S2 tambem compra: lance em leilao de OUTRO vendedor" 201 POST $B/auction-items/$IID/bids -H "$AK" -H "$A2" -H "$CT" -d '{"valor":900}'
req "chat: logado escreve com leilao aberto" 201 POST $B/auctions/$LID/chat -H "$AK" -H "$AB" -H "$CT" -d '{"texto":"Peca linda!"}'
req "chat: sem login" 401 POST $B/auctions/$LID/chat -H "$AK" -H "$CT" -d '{"texto":"oi"}'

echo "== Fechamento e resultado"
req "fechar leilao (dono)" 200 PATCH $B/auctions/$LID/status -H "$AK" -H "$A1" -H "$CT" -d '{"status":"CLOSED"}'
req "item ficou SOLD com o vencedor (vendedor S2, lance 900)" 200 GET $B/auction-items/$IID -H "$AK"; grep -o '"status":"[A-Z]*"\|"vencedorNome":"[^"]*"\|"lanceAtual":"[^"]*"' "$OUT" | tr '\n' ' '; echo
req "lance depois de fechado" 409 POST $B/auction-items/$IID/bids -H "$AK" -H "$AB" -H "$CT" -d '{"valor":2000}'
req "chat depois de fechado" 409 POST $B/auctions/$LID/chat -H "$AK" -H "$AB" -H "$CT" -d '{"texto":"tarde demais"}'
req "indicadores do leilao" 200 GET $B/auctions/$LID/indicadores -H "$AK"; head -c 200 "$OUT"; echo
req "ranking inclui o vendedor S1" 200 GET "$B/ranking/vendedores?limite=20" -H "$AK"; grep -c "Lucia Sim $SUF" "$OUT"
req "meus lances do comprador" 200 GET $B/bids/meus -H "$AK" -H "$AB"

echo "== Gestao de usuarios (ADMIN)"
req "ADMIN nao desativa a si mesmo" 409 PATCH $B/users/$(curl -s -H "$AK" -H "$AA" $B/users/me | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)/desativar -H "$AK" -H "$AA"
req "desativar comprador B" 200 PATCH $B/users/$BID/desativar -H "$AK" -H "$AA"
req "token antigo de B deixa de valer na hora" 401 GET $B/users/me -H "$AK" -H "$AB"
req "login de conta desativada (so apos a senha conferir)" 403 POST $B/auth/login -H "$AK" -H "$CT" -d "{\"email\":\"b.$SUF@sim.com\",\"senha\":\"Demo@12345\"}"
req "reativar comprador B" 200 PATCH $B/users/$BID/reativar -H "$AK" -H "$AA"
req "login volta a funcionar" 200 POST $B/auth/login -H "$AK" -H "$CT" -d "{\"email\":\"b.$SUF@sim.com\",\"senha\":\"Demo@12345\"}"
req "remover comprador COM historico" 409 DELETE $B/users/$BID -H "$AK" -H "$AA"
req "vendedor que ja entrou (auditoria) NAO e removido" 409 DELETE $B/users/$S2ID -H "$AK" -H "$AA"
req "admin cria vendedor S3 (nunca entra)" 201 POST $B/users -H "$AK" -H "$AA" -H "$CT" -d "{\"nome\":\"Descartavel Sim $SUF\",\"email\":\"s3.$SUF@sim.com\",\"senha\":\"Demo@12345\",\"papel\":\"SELLER\"}"; S3ID=$(json id)
req "conta SEM nenhum historico e removida" 204 DELETE $B/users/$S3ID -H "$AK" -H "$AA"
req "remover de novo" 404 DELETE $B/users/$S3ID -H "$AK" -H "$AA"
req "dados completos de usuario (auditado)" 200 GET $B/users/$S1ID -H "$AK" -H "$AA"
req "admin cria categoria" 201 POST $B/categories -H "$AK" -H "$AA" -H "$CT" -d "{\"nome\":\"Categoria Sim $SUF\",\"descricao\":\"Teste\"}"; CID=$(json id)
req "admin remove categoria vazia" 204 DELETE $B/categories/$CID -H "$AK" -H "$AA"
req "categoria em uso nao some" 409 DELETE $B/categories/$CAT -H "$AK" -H "$AA"

echo "== Modo comprador / vendedor (um clique, travas em cada modo)"
req "admin cria comprador C (sem perfil completo)" 201 POST $B/users -H "$AK" -H "$AA" -H "$CT" -d "{\"nome\":\"Comprador Vendedor Sim $SUF\",\"email\":\"c.$SUF@sim.com\",\"senha\":\"Demo@12345\",\"papel\":\"BIDDER\"}"
TC=$(login c.$SUF@sim.com Demo@12345); AC="Authorization: Bearer $TC"
req "comprador C NAO cria leilao (modo comprador)" 403 POST $B/auctions -H "$AK" -H "$AC" -H "$CT" -d "{\"titulo\":\"Ainda nao\",\"dataInicio\":\"$INI\",\"dataFim\":\"$FIM\"}"
req "C sem perfil completo NAO da lance" 403 POST $B/auction-items/$IID/bids -H "$AK" -H "$AC" -H "$CT" -d '{"valor":950}'
req "C troca para o modo vendedor (um clique, mesmo token)" 200 PATCH $B/users/me/modo -H "$AK" -H "$AC" -H "$CT" -d '{"modo":"SELLER"}'
req "C ja esta no modo vendedor" 409 PATCH $B/users/me/modo -H "$AK" -H "$AC" -H "$CT" -d '{"modo":"SELLER"}'
req "C sem perfil completo NAO cria leilao" 403 POST $B/auctions -H "$AK" -H "$AC" -H "$CT" -d "{\"titulo\":\"Sem perfil\",\"dataInicio\":\"$INI\",\"dataFim\":\"$FIM\"}"
CPF=$(node -e "const d=String(100000000+(($SUF+1)*7919)%899999999).slice(0,9).split('').map(Number);const dv=n=>{const r=(n.reduce((a,v,i)=>a+v*(n.length+1-i),0)*10)%11;return r===10?0:r};d.push(dv(d));d.push(dv(d));console.log(d.join(''))")
req "C completa o perfil (telefone, CPF, endereco)" 200 PATCH $B/users/me -H "$AK" -H "$AC" -H "$CT" -d "{\"telefone\":\"11999998888\",\"endereco\":\"Rua Teste, 10 - Sao Paulo/SP\",\"cpf\":\"$CPF\"}"
req "C agora cria leilao" 201 POST $B/auctions -H "$AK" -H "$AC" -H "$CT" -d "{\"titulo\":\"Leilao Sim C $SUF\",\"dataInicio\":\"$INI\",\"dataFim\":\"$FIM\"}"; L2=$(json id)
req "C no modo vendedor NAO da lance" 403 POST $B/auction-items/$IID/bids -H "$AK" -H "$AC" -H "$CT" -d '{"valor":950}'
req "ADMIN NAO troca de modo" 403 PATCH $B/users/me/modo -H "$AK" -H "$AA" -H "$CT" -d '{"modo":"SELLER"}'

echo "== Limite de tentativas (por ultimo)"
COD=""; for i in $(seq 1 12); do COD=$(curl -s -o /dev/null -w "%{http_code}" -H "$AK" -H "$CT" -d '{"email":"x@x.com","senha":"Errada@123"}' $B/auth/login); done
echo "  12 logins errados seguidos: ultimo codigo = $COD (esperado 429)"
echo; echo "FALHAS: $FALHAS"
