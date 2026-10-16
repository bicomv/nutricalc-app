# Atualização do banco original

O responsável pelo NutriCalc mantém o catálogo oficial no GitHub. Os usuários clicam em **Atualizar banco original** para baixar os alimentos, sem conta no aplicativo. O banco baixado continua disponível offline.

## Administração

No computador de desenvolvimento, a ferramenta privada em `admin-local/Abrir-Administrador.ps1` permite abrir seu SQLite em modo somente leitura, escolher o banco e selecionar alimentos para gerar o `foods.json` automaticamente. Consulte `admin-local/LEIA-ME.md`. Essa pasta é ignorada pelo Git e não é incluída no instalador público; mantenha uma cópia privada para backup. Se usar a ferramenta, ela cuida dos IDs, da revisão e da validação. Depois, basta publicar o arquivo gerado no GitHub.

A permissão para publicar é o acesso de escrita ao repositório `bicomv/nutricalc-app`. Mantenha somente sua conta e acessos explicitamente autorizados com essa permissão. O e-mail `jcarevalojr@gmail.com` não cria privilégios no app: não existe login nem botão administrativo nele. Nenhuma credencial do GitHub é distribuída no instalador.

1. Edite `catalog/foods.json`, incluindo os alimentos que deseja distribuir.
2. Use um `id` permanente por alimento, com letras minúsculas, números, hífen ou sublinhado, até 80 caracteres. Espécies: `ruminantes`, `aves`, `suinos`, `equinos`.
3. Aumente `revision` a cada alteração. Não apague registros já distribuídos. Para uma composição corrigida, publique um novo ID e indique a referência no nome: esta versão preserva composições existentes nos bancos locais.
4. Confira unidades e fonte nutricional. MS deve ser maior que zero e até 100%. Omita nutrientes desconhecidos. Use as unidades exibidas no aplicativo para cada espécie.
5. Execute `node scripts/validate-catalog.js` na pasta do projeto.
6. Publique somente o arquivo validado na branch `main` do repositório no GitHub. Os usuários poderão recebê-lo sem reinstalar o aplicativo.

Exemplo de formato, com valores apenas ilustrativos:

```json
{
  "version": 1,
  "revision": 2,
  "feeds": [
    {
      "id": "milho-referencia-001",
      "species": "ruminantes",
      "feed": {
        "name": "Milho — referência 001",
        "tipo": "Concentrado",
        "ms": 88,
        "pb": 8,
        "ndt": 85,
        "custoKg": 1.5
      }
    }
  ]
}
```

## Distribuição e uso

O arquivo começa vazio e complementa os alimentos que já vêm no aplicativo. A URL configurada em `src/catalog-config.json` é `https://raw.githubusercontent.com/bicomv/nutricalc-app/main/catalog/foods.json`.

O arquivo `catalog/foods.json` é publicado junto do código na branch `main`. Na versão 4.6.1, o botão **Atualizar banco original** fica na tela inicial, junto das opções de atualização e backup. Depois que essa versão for instalada uma vez, novos alimentos exigem apenas a atualização do banco.

O download só ocorre quando o usuário solicita. Os alimentos são incorporados ao **Banco Padrão** ao iniciar a espécie ou atualizar manualmente, sem selecionar ingredientes automaticamente. Dietas salvas e bancos personalizados são preservados. Esta versão adiciona alimentos; não substitui composições nem preços locais já existentes.

Se houver falha de rede, dados inválidos, catálogo com revisão anterior ou arquivo maior que 2 MiB, a cópia anterior permanece disponível. O limite é de 5.000 alimentos online.

## Segurança

- O app tem somente leitura do catálogo público, sem função de publicação, formulário, login ou chave de API.
- Somente quem tem acesso de escrita ao repositório pode publicar. Proteja sua conta GitHub e revise colaboradores, equipes, chaves e automações com permissão de escrita.
- O processo principal baixa apenas o caminho permitido no repositório oficial via HTTPS, sem redirecionamentos, e valida o conteúdo antes de salvar.
- O catálogo público deve conter apenas dados dos alimentos, sem informações pessoais.
- A interface continua isolada do Node e o cache fica no SQLite local. Atualizar o catálogo não modifica os registros das dietas salvas.
