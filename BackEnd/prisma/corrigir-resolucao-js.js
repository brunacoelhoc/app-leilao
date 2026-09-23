// O client gerado do Prisma usa extensao ".js" nos imports internos (padrao
// "nodenext"), mas ainda e codigo TypeScript em disco (so vira .js depois do
// build). O ts-node puro nao sabe mapear ".js" -> ".ts" ao resolver esses
// requires -- e o MESMO problema ja resolvido no jest.config.ts/jest-e2e.json
// via "moduleNameMapper". Aqui replicamos a mesma correcao manualmente, para
// o script de seed (que roda fora do Jest) tambem funcionar.
const Module = require('module');
const resolverOriginal = Module._resolveFilename;

Module._resolveFilename = function (pedido, ...resto) {
  if (/^\.{1,2}\/.*\.js$/.test(pedido)) {
    const semExtensao = pedido.replace(/\.js$/, '');
    try {
      return resolverOriginal.call(this, semExtensao, ...resto);
    } catch {
      // Se nao achar sem a extensao, tenta do jeito original (deixa o erro real aparecer)
    }
  }
  return resolverOriginal.call(this, pedido, ...resto);
};

require('ts-node/register');
