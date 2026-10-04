# Minha apuracao - Ceara 2026

Requer Python 3.10 ou mais recente, navegador e internet. Nao precisa instalar pacotes.

Abra um terminal nesta pasta e execute:

```sh
sh iniciar.sh
```

O navegador abre automaticamente. A porta padrao e 8765; se estiver ocupada,
o programa encontra outra e informa o endereco no terminal. Para encerrar: Ctrl+C.

Tambem pode executar `python3 server.py` e abrir o endereco mostrado.

## Selecao inicial

- Governador: Ciro Gomes (45), Elmano de Freitas (13), Delegado Huggo (14).
- Senador: Cid Gomes (400), Alcides Fernandes (222), Guilherme Theophilo (300), Luizianne (180).
- Deputado federal: cinco mais votados, com Dr. Jaziel (2277) sempre fixado.
- Deputado estadual: cinco mais votados, com Dra. Silvana (22777) sempre fixada.
- Presidente: cinco mais votados no Brasil, com opcao de acompanhar apenas o Ceara.
- Votos brancos, votos nulos e secoes totalizadas em cada cargo.
- Acompanhamento nacional de presidente: total oficial do Brasil e lista dos 27 estados/DF mais Exterior, com quantidade de secoes totalizadas, total de secoes e percentual. Ceara destacado.
- Aba Por regiao: cinco regioes e Exterior separados; estados ordenados do mais apurado ao menos apurado em cada grupo. Percentual regional calculado com a soma de secoes, sem fazer media dos percentuais das UFs.
- Aba Mapa: mapa interativo das UFs, com cores por apuracao ou por regiao e filtro por regiao.
- Presidente por estado: mouse, foco de teclado ou toque consultam os tres primeiros em um quadro fixo a esquerda. Ao sair do estado ou do quadro, ele fecha apos um segundo; entrar novamente cancela o fechamento. No toque, Escape ou o X fecha.

O botao Selecionar altera os candidatos fixados. A selecao fica no localStorage
do navegador deste endereco. Nao e enviada ao TSE: o servidor consulta a lista
inteira por cargo. A troca de porta/navegador cria outro conjunto de preferencias.

## Fonte e atualizacao

Usa os mesmos arquivos publicos de resultados do site oficial:
https://resultados.tse.jus.br/oficial/app/index.html

O catalogo `oficial/comum/config/ele-c.json` fornece os codigos das eleicoes.
Os resultados usam `oficial/<ciclo>/<eleicao>/dados/<uf>/<uf>-c< cargo em 4 digitos >-e< eleicao em 6 digitos >-u.json`.
Consulta os cargos 1, 3, 5, 6 e 7; fotos oficiais sao carregadas do TSE.
O resumo por UF usa `oficial/<ciclo>/<eleicao presidencial>/dados/br/br-e<eleicao em 6 digitos>-ab.json`.
O total nacional vem da linha BR desse arquivo, incluindo as secoes no exterior.
Esse acompanhamento e sempre nacional, mesmo com Presidente filtrado para Ceara.
Os detalhes por estado sao consultados apenas sob demanda, via `/api/state`,
com cache de 11 segundos. A resposta contem somente os tres lideres, sem fotos.
Com a atualizacao automatica ligada, um detalhe aberto acompanha o intervalo de 11 segundos.

O mapa e uma malha simplificada oficial do IBGE, salva em `brasil-uf.geojson`:
https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF
Documentacao: https://servicodados.ibge.gov.br/api/docs/malhas?versao=3
D3 7.9.0 esta incluido localmente para a projecao cartografica. Licenca: D3-LICENSE.
Malha e biblioteca nao sao baixadas novamente em cada consulta.

Com a caixa marcada, consulta a cada 11 segundos. Uma consulta demorada precisa
terminar antes da proxima, evitando consultas sobrepostas. O TSE pode publicar em outro ritmo:
consulte os horarios de arquivo e totalizacao apresentados em cada cargo.
Se houver falha, preserva os ultimos resultados da sessao com aviso no cargo.
Nao salva resultados em disco nem inventa votos quando nao ha dados publicados.

Os cinco mais votados aparecem apenas depois dos primeiros votos. Empates
compartilham a posicao e usam nome/numero para ordenar a exibicao. A lista dos
cinco e de votos nominais, e nao uma previsao de eleicao: deputados dependem
da totalizacao proporcional. O status vem do TSE, quando publicado.

O segundo turno pode ficar indisponivel ate o TSE publicar o catalogo e os
arquivos correspondentes. O servidor aceita conexoes apenas em 127.0.0.1.
# Versao online

Deputados federais e estaduais exibem colocacao geral, no partido e, quando
aplicavel, na federacao. O calculo inclui todos os candidatos do cargo no estado,
nao apenas os exibidos. Votos iguais compartilham a posicao; sem votos nao ha
colocacao. Esses rankings nao substituem a situacao oficial de eleicao do TSE.

https://jonatasbferreira.github.io/apuracao-2026/

Hospedada no GitHub Pages. A versao online consulta os arquivos oficiais do TSE
diretamente pelo navegador, sem servidor Python e sem credenciais. Os candidatos
fixados ficam salvos no navegador de cada pessoa. O checkbox controla consultas
a cada 11 segundos; a publicacao de novos dados depende do TSE.

Para publicar alteracoes, envie os arquivos para a branch `main`. O GitHub Pages
publica a raiz dessa branch. A versao local continua usando `server.py`.
